/**
 * 🔐 SAP IAS (Identity Authentication Service) Integration
 *
 * Este módulo proporciona autenticación OAuth 2.0 usando SAP Cloud Identity Services.
 * Implementa validación de JWT tokens usando JWKS (JSON Web Key Set).
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * Configuración de IAS desde variables de entorno
 */
export interface IASConfig {
  issuer: string;           // URL del tenant IAS (e.g., https://your-tenant.accounts.ondemand.com)
  jwksUri: string;          // URL del JWKS endpoint
  audience?: string;        // Expected audience (client ID)
  enabled: boolean;         // Enable/disable authentication
}

/**
 * Payload del JWT token de IAS
 */
export interface IASTokenPayload {
  sub: string;              // Subject (user ID)
  iss: string;              // Issuer
  aud: string | string[];   // Audience
  exp: number;              // Expiration time
  iat: number;              // Issued at
  email?: string;           // User email
  given_name?: string;      // First name
  family_name?: string;     // Last name
  groups?: string[];        // User groups
  scope?: string;           // OAuth scopes
}

/**
 * Cliente JWKS para validar tokens
 */
let jwksClientInstance: jwksClient.JwksClient | null = null;

/**
 * Inicializa el cliente JWKS
 */
export function initializeJWKSClient(config: IASConfig): void {
  if (!config.enabled) {
    console.log('🔓 IAS Authentication is DISABLED');
    return;
  }

  jwksClientInstance = jwksClient({
    jwksUri: config.jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });

  console.log(`🔐 IAS Authentication initialized`);
  console.log(`   Issuer: ${config.issuer}`);
  console.log(`   JWKS URI: ${config.jwksUri}`);
}

/**
 * Obtiene la clave pública desde JWKS
 */
function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!jwksClientInstance) {
      reject(new Error('JWKS client not initialized'));
      return;
    }

    jwksClientInstance.getSigningKey(header.kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      resolve(signingKey!);
    });
  });
}

/**
 * Verifica y decodifica un JWT token
 */
export async function verifyToken(
  token: string,
  config: IASConfig
): Promise<IASTokenPayload> {
  try {
    // Decodificar el header para obtener el kid (key ID)
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header.kid) {
      throw new Error('Invalid token: missing kid in header');
    }

    // Obtener la clave pública del JWKS
    const signingKey = await getSigningKey(decodedHeader.header);

    // Verificar y decodificar el token
    const verifyOptions: jwt.VerifyOptions = {
      issuer: config.issuer,
      algorithms: ['RS256'],
    };

    if (config.audience) {
      verifyOptions.audience = config.audience;
    }

    const decoded = jwt.verify(token, signingKey, verifyOptions) as IASTokenPayload;

    return decoded;
  } catch (error: any) {
    console.error('❌ Token verification failed:', error.message);
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Extrae el token del header Authorization
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware de autenticación para Express
 */
export function authMiddleware(config: IASConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Si la autenticación está deshabilitada, continuar
    if (!config.enabled) {
      next();
      return;
    }

    try {
      // Extraer token del header
      const token = extractToken(req);

      if (!token) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Missing or invalid Authorization header',
          },
          id: null,
        });
        return;
      }

      // Verificar el token
      const payload = await verifyToken(token, config);

      // Agregar información del usuario al request
      (req as any).user = payload;

      console.log(`✅ Authenticated user: ${payload.email || payload.sub}`);

      next();
    } catch (error: any) {
      console.error('❌ Authentication error:', error.message);
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Unauthorized: ${error.message}`,
        },
        id: null,
      });
    }
  };
}

/**
 * Carga la configuración de IAS desde variables de entorno
 */
export function loadIASConfig(): IASConfig {
  const enabled = process.env.IAS_ENABLED === 'true';
  const issuer = process.env.IAS_ISSUER || '';
  const jwksUri = process.env.IAS_JWKS_URI || `${issuer}/oauth2/certs`;
  const audience = process.env.IAS_AUDIENCE;

  if (enabled && !issuer) {
    throw new Error('IAS_ISSUER must be set when IAS_ENABLED=true');
  }

  return {
    enabled,
    issuer,
    jwksUri,
    audience,
  };
}
