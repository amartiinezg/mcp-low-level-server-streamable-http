/**
 * 🚀 CAP Server con autenticación OAuth 2.0
 *
 * Servidor CAP personalizado con soporte para autenticación JWT de SAP IAS
 */

// Cargar variables de entorno desde .env en desarrollo
require('dotenv').config();

const cds = require('@sap/cds');
const { initializeJWKS, authMiddleware } = require('./srv/auth-middleware');

// Configuración de autenticación desde variables de entorno
const authConfig = {
  enabled: process.env.IAS_ENABLED === 'true',
  issuer: process.env.IAS_ISSUER || '',
  jwksUri: process.env.IAS_JWKS_URI || `${process.env.IAS_ISSUER}/oauth2/certs`,
  audience: process.env.IAS_AUDIENCE,
};

// Inicializar JWKS client
if (authConfig.enabled) {
  initializeJWKS(authConfig.issuer, authConfig.jwksUri);
}

// Bootstrap del servidor CDS
cds.on('bootstrap', (app) => {
  console.log('📡 CAP Server bootstrapping...');

  // Health check endpoint (sin autenticación)
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      authentication: authConfig.enabled ? 'enabled' : 'disabled'
    });
  });

  // Readiness check endpoint (sin autenticación)
  app.get('/ready', (req, res) => {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  });

  // Aplicar middleware de autenticación a todas las rutas OData
  if (authConfig.enabled) {
    console.log('🔐 Applying authentication middleware to /odata/v4/catalog');
    app.use('/odata/v4/catalog', authMiddleware(authConfig));
  }
});

// Iniciar el servidor
cds.on('listening', ({ url }) => {
  console.log(`📡 CAP Server listening on ${url}`);
  console.log(`🔐 Authentication: ${authConfig.enabled ? 'ENABLED' : 'DISABLED'}`);
  if (authConfig.enabled) {
    console.log(`   Issuer: ${authConfig.issuer}`);
  }
});

module.exports = cds.server;
