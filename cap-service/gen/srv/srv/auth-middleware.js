/**
 * 🔐 Authentication Middleware for CAP Service
 *
 * Middleware para validar tokens JWT de SAP IAS en el servicio CAP.
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

let jwksClientInstance = null;

/**
 * Inicializa el cliente JWKS para validación de tokens
 */
function initializeJWKS(issuer, jwksUri) {
  if (!issuer || !jwksUri) {
    console.log('🔓 CAP Service: Authentication DISABLED');
    return;
  }

  jwksClientInstance = jwksClient({
    jwksUri: jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });

  console.log('🔐 CAP Service: JWT Authentication enabled');
  console.log(`   Issuer: ${issuer}`);
  console.log(`   JWKS URI: ${jwksUri}`);
}

/**
 * Obtiene la clave pública desde JWKS
 */
function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    if (!jwksClientInstance) {
      reject(new Error('JWKS client not initialized'));
      return;
    }

    jwksClientInstance.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      resolve(signingKey);
    });
  });
}

/**
 * Verifica un token JWT
 */
async function verifyToken(token, issuer, audience) {
  try {
    // Decodificar el header
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header.kid) {
      throw new Error('Invalid token: missing kid in header');
    }

    // Obtener la clave pública
    const signingKey = await getSigningKey(decodedHeader.header.kid);

    // Verificar el token
    const verifyOptions = {
      issuer: issuer,
      algorithms: ['RS256'],
    };

    if (audience) {
      verifyOptions.audience = audience;
    }

    const decoded = jwt.verify(token, signingKey, verifyOptions);
    return decoded;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Middleware de autenticación para Express
 */
function authMiddleware(config) {
  return async (req, res, next) => {
    // Si la autenticación está deshabilitada, continuar
    if (!config.enabled) {
      next();
      return;
    }

    try {
      // Extraer token del header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: {
            code: 401,
            message: 'Unauthorized: Missing or invalid Authorization header',
          },
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer '

      // Verificar el token
      const payload = await verifyToken(token, config.issuer, config.audience);

      // Agregar información del usuario al request
      req.user = payload;
      req.authInfo = payload;

      console.log(`✅ CAP: Authenticated user: ${payload.email || payload.sub}`);

      next();
    } catch (error) {
      console.error('❌ CAP: Authentication error:', error.message);
      return res.status(401).json({
        error: {
          code: 401,
          message: `Unauthorized: ${error.message}`,
        },
      });
    }
  };
}

module.exports = {
  initializeJWKS,
  authMiddleware,
};
