/**
 * 🔐 OAuth 2.0 Authorization Code Flow para SAP IAS
 *
 * Implementa el flujo completo de autorización OAuth 2.0:
 * 1. /mcp/login - Redirige al usuario a IAS para autenticarse
 * 2. /mcp/callback - Recibe el code y lo intercambia por access_token
 * 3. Almacena el token en sesión y redirige al usuario
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { randomBytes } from 'crypto';

export interface OAuthConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * Almacenamiento temporal de estados CSRF (en producción, usar Redis)
 */
const stateStore = new Map<string, { timestamp: number; redirectTo?: string }>();

// Limpiar estados antiguos cada 5 minutos
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of stateStore.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      stateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * Almacenamiento temporal de tokens por sesión (en producción, usar Redis)
 */
interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  user_info?: any;
}

const sessionStore = new Map<string, TokenData>();

/**
 * Genera un ID de sesión único
 */
function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Genera un estado CSRF único
 */
function generateState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Endpoint /mcp/login
 * Inicia el flujo OAuth redirigiendo al usuario a IAS
 */
export function handleLogin(config: OAuthConfig) {
  return (req: Request, res: Response): void => {
    if (!config.enabled) {
      res.status(503).json({
        error: 'OAuth flow is not enabled',
        message: 'Set IAS_ENABLED=true and configure OAuth settings',
      });
      return;
    }

    try {
      // Generar state para protección CSRF
      const state = generateState();
      const redirectTo = (req.query.redirect as string) || '/mcp';

      stateStore.set(state, {
        timestamp: Date.now(),
        redirectTo,
      });

      // Construir URL de autorización de IAS
      const authUrl = new URL(`${config.issuer}/oauth2/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('state', state);

      console.log(`🔐 Redirecting user to IAS login: ${authUrl.toString()}`);
      console.log(`   State: ${state}`);
      console.log(`   Redirect after login: ${redirectTo}`);

      // Redirigir al usuario a IAS
      res.redirect(authUrl.toString());
    } catch (error: any) {
      console.error('❌ Error in /mcp/login:', error);
      res.status(500).json({
        error: 'Failed to initiate OAuth flow',
        message: error.message,
      });
    }
  };
}

/**
 * Endpoint /mcp/callback
 * Recibe el authorization code y lo intercambia por access_token
 */
export function handleCallback(config: OAuthConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!config.enabled) {
      res.status(503).json({
        error: 'OAuth flow is not enabled',
      });
      return;
    }

    try {
      const { code, state, error, error_description } = req.query;

      // Verificar si hubo un error en IAS
      if (error) {
        console.error(`❌ OAuth error from IAS: ${error} - ${error_description}`);
        res.status(400).send(`
          <html>
            <body>
              <h1>Authentication Failed</h1>
              <p><strong>Error:</strong> ${error}</p>
              <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
              <p><a href="/mcp/login">Try again</a></p>
            </body>
          </html>
        `);
        return;
      }

      // Verificar que recibimos el code y el state
      if (!code || !state) {
        res.status(400).json({
          error: 'Missing code or state parameter',
        });
        return;
      }

      // Verificar el state (protección CSRF)
      const stateData = stateStore.get(state as string);
      if (!stateData) {
        console.error('❌ Invalid or expired state');
        res.status(400).json({
          error: 'Invalid or expired state',
          message: 'Please try logging in again',
        });
        return;
      }

      // Eliminar el state usado
      stateStore.delete(state as string);

      console.log(`🔐 Exchanging authorization code for access token...`);
      console.log(`   Code: ${(code as string).substring(0, 20)}...`);
      console.log(`   State validated: ${state}`);

      // Intercambiar el code por access_token
      const tokenResponse = await axios.post(
        `${config.issuer}/oauth2/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const {
        access_token,
        refresh_token,
        expires_in,
        token_type,
      } = tokenResponse.data;

      console.log(`✅ Access token obtained successfully`);
      console.log(`   Token type: ${token_type}`);
      console.log(`   Expires in: ${expires_in} seconds`);
      console.log(`   Has refresh token: ${!!refresh_token}`);

      // Calcular timestamp de expiración
      const expiresAt = Date.now() + expires_in * 1000;

      // Generar session ID
      const sessionId = generateSessionId();

      // Almacenar token en sesión
      sessionStore.set(sessionId, {
        access_token,
        refresh_token,
        expires_at: expiresAt,
      });

      console.log(`💾 Token stored in session: ${sessionId}`);

      // Obtener información del usuario (opcional)
      try {
        const userInfoResponse = await axios.get(
          `${config.issuer}/oauth2/userinfo`,
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          }
        );

        const userInfo = userInfoResponse.data;
        console.log(`👤 User info obtained: ${userInfo.email || userInfo.sub}`);

        // Actualizar sesión con info de usuario
        const session = sessionStore.get(sessionId);
        if (session) {
          session.user_info = userInfo;
        }
      } catch (userInfoError) {
        console.warn('⚠️  Could not fetch user info:', userInfoError);
      }

      // Redirigir al usuario con la sesión
      const redirectTo = stateData.redirectTo || '/mcp';

      // Opción 1: Cookie HTTP-only (más seguro)
      res.cookie('mcp_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: expires_in * 1000,
      });

      // Redirigir con página de éxito
      res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
              }
              .success {
                color: #28a745;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .token-info {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 5px;
                padding: 15px;
                margin: 20px 0;
                text-align: left;
              }
              .token-info pre {
                background: #fff;
                padding: 10px;
                border-radius: 3px;
                overflow-x: auto;
                font-size: 12px;
              }
              button {
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
              }
              button:hover {
                background: #0056b3;
              }
            </style>
          </head>
          <body>
            <div class="success">✅ Authentication Successful!</div>
            <p>You have been successfully authenticated with SAP IAS.</p>

            <div class="token-info">
              <strong>Session Information:</strong>
              <pre>Session ID: ${sessionId}
Token expires in: ${Math.floor(expires_in / 60)} minutes
Has refresh token: ${!!refresh_token ? 'Yes' : 'No'}</pre>
            </div>

            <div class="token-info">
              <strong>Your Access Token:</strong>
              <pre>${access_token.substring(0, 100)}...</pre>
              <button onclick="copyToken()">Copy Token</button>
            </div>

            <p>
              <button onclick="window.location.href='${redirectTo}'">Continue to Application</button>
            </p>

            <script>
              const token = '${access_token}';

              function copyToken() {
                navigator.clipboard.writeText(token).then(() => {
                  alert('Token copied to clipboard!');
                });
              }

              // Auto-redirect después de 5 segundos
              setTimeout(() => {
                window.location.href = '${redirectTo}';
              }, 5000);
            </script>
          </body>
        </html>
      `);

    } catch (error: any) {
      console.error('❌ Error in /mcp/callback:', error);

      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `${error.response.status} - ${JSON.stringify(error.response.data)}`;
      }

      res.status(500).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p><strong>Error:</strong> ${errorMessage}</p>
            <p><a href="/mcp/login">Try again</a></p>
          </body>
        </html>
      `);
    }
  };
}

/**
 * Middleware para verificar sesión
 */
export function requireSession() {
  return (req: Request, res: Response, next: Function): void => {
    const sessionId = req.cookies?.mcp_session;

    if (!sessionId) {
      res.status(401).json({
        error: 'No session found',
        message: 'Please log in first',
        login_url: '/mcp/login',
      });
      return;
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      res.status(401).json({
        error: 'Invalid or expired session',
        message: 'Please log in again',
        login_url: '/mcp/login',
      });
      return;
    }

    // Verificar si el token expiró
    if (session.expires_at < Date.now()) {
      sessionStore.delete(sessionId);
      res.status(401).json({
        error: 'Session expired',
        message: 'Please log in again',
        login_url: '/mcp/login',
      });
      return;
    }

    // Agregar token al request
    (req as any).accessToken = session.access_token;
    (req as any).userInfo = session.user_info;

    next();
  };
}

/**
 * Endpoint /mcp/logout
 */
export function handleLogout() {
  return (req: Request, res: Response): void => {
    const sessionId = req.cookies?.mcp_session;

    if (sessionId) {
      sessionStore.delete(sessionId);
      res.clearCookie('mcp_session');
    }

    res.send(`
      <html>
        <head>
          <title>Logged Out</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <h1>✅ Logged Out Successfully</h1>
          <p>You have been logged out.</p>
          <p><a href="/mcp/login">Log in again</a></p>
        </body>
      </html>
    `);
  };
}

/**
 * Obtiene el token de la sesión
 */
export function getTokenFromSession(sessionId: string): string | null {
  const session = sessionStore.get(sessionId);
  if (!session || session.expires_at < Date.now()) {
    return null;
  }
  return session.access_token;
}

/**
 * Cargar configuración OAuth desde variables de entorno
 */
export function loadOAuthConfig(): OAuthConfig {
  return {
    enabled: process.env.IAS_ENABLED === 'true',
    issuer: process.env.IAS_ISSUER || '',
    clientId: process.env.IAS_CLIENT_ID || '',
    clientSecret: process.env.IAS_CLIENT_SECRET || '',
    redirectUri: process.env.IAS_REDIRECT_URI || 'http://localhost:3001/mcp/callback',
    scopes: (process.env.IAS_SCOPES || 'openid email profile').split(' '),
  };
}
