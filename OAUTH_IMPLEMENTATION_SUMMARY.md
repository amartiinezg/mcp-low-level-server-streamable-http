# 🔐 OAuth 2.0 Implementation Summary

## Overview

Se ha implementado autenticación OAuth 2.0 usando SAP Cloud Identity Services (IAS) con el flujo Authorization Code para proteger todos los endpoints MCP y del servicio CAP. La implementación valida tokens JWT usando JWKS (JSON Web Key Set) y es completamente opcional, permitiendo operar sin autenticación en desarrollo.

---

## 📁 Archivos Creados

### MCP Service
- **`mcp-service/src/auth/ias-auth.ts`** - Módulo principal de autenticación OAuth 2.0
  - Validación de JWT tokens
  - Integración con JWKS
  - Middleware de Express
  - Gestión de configuración

- **`mcp-service/.env.example`** - Plantilla de variables de entorno

### CAP Service
- **`cap-service/server.js`** - Servidor CAP personalizado con autenticación
- **`cap-service/srv/auth-middleware.js`** - Middleware de autenticación para Express/CAP
- **`cap-service/.env.example`** - Plantilla de variables de entorno

### Documentación
- **`docs/IAS_SETUP.md`** - Guía completa paso a paso para configurar OAuth 2.0
  - Configuración de SAP IAS
  - Setup de MCP y CAP services
  - Despliegue en KYMA
  - Testing y troubleshooting
  - Security best practices

---

## 📦 Dependencias Instaladas

### MCP Service (`mcp-service/package.json`)
```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.2.0",
    "express-oauth2-jwt-bearer": "^1.7.1"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.10"
  }
}
```

### CAP Service (`cap-service/package.json`)
```json
{
  "dependencies": {
    "@sap/xssec": "^4.10.0",
    "passport": "^0.7.0",
    "jsonwebtoken": "^9.0.2",
    "jwks-rsa": "^3.2.0"
  }
}
```

---

## 🔧 Archivos Modificados

### MCP Service
1. **`mcp-service/src/index.ts`**
   - Import del módulo de autenticación
   - Inicialización de JWKS client
   - Aplicación de middleware a endpoints MCP (POST, GET, DELETE /mcp)
   - Health checks permanecen públicos

2. **`mcp-service/Dockerfile`**
   - Agregada variable `ENV IAS_ENABLED=false`

3. **`mcp-service/README.md`**
   - Documentación de autenticación OAuth
   - Variables de entorno de IAS
   - Ejemplos de configuración con tokens
   - Referencia a `docs/IAS_SETUP.md`

### CAP Service
1. **`cap-service/package.json`**
   - Cambiado `main` de `srv/catalog-service.js` a `server.js`
   - Actualizado script `start` a `cds-serve --port 4004`

2. **`cap-service/Dockerfile`**
   - Agregada variable `ENV IAS_ENABLED=false`
   - Copiado `server.js` en la imagen

### Kubernetes/KYMA
1. **`k8s/mcp-service/deployment.yaml`**
   - Agregadas variables de entorno para IAS
   - Comentarios con instrucciones de configuración

2. **`k8s/cap-service/deployment.yaml`**
   - Agregadas variables de entorno para IAS
   - Comentarios con instrucciones de configuración

### Documentación General
1. **`CLAUDE.md`**
   - Actualizado Project Overview con OAuth 2.0
   - Documentación de módulos de autenticación
   - Detalles de protección de endpoints

---

## 🔐 Arquitectura de Autenticación

```
┌─────────────────┐
│  Claude Desktop │
│   (MCP Client)  │
└────────┬────────┘
         │
         │ 1. Request con Bearer Token
         ▼
┌─────────────────────────┐
│     MCP Service         │
│  (Express + MCP SDK)    │
│                         │
│  ✅ JWT Validation      │
│  ✅ JWKS Integration    │
│  ✅ Token Verification  │
└────────┬────────────────┘
         │
         │ 2. Forward Request con Token
         ▼
┌─────────────────────────┐
│     CAP Service         │
│   (CAP + OData)         │
│                         │
│  ✅ JWT Validation      │
│  ✅ User Authorization  │
│  ✅ Data Access         │
└─────────────────────────┘
```

**Flujo de Autenticación:**
1. Cliente obtiene Access Token de SAP IAS (OAuth 2.0 Authorization Code Flow)
2. Cliente incluye token en header: `Authorization: Bearer <token>`
3. MCP Service valida token usando JWKS
4. MCP Service extrae información del usuario (email, groups, scopes)
5. CAP Service también valida el token independientemente
6. Ambos servicios procesan la request si el token es válido

---

## 🌍 Variables de Entorno

### Configuración Básica (ambos servicios)
```bash
IAS_ENABLED=true|false              # Habilitar/deshabilitar autenticación
IAS_ISSUER=<ias-tenant-url>         # https://your-tenant.accounts.ondemand.com
IAS_JWKS_URI=<jwks-endpoint>        # https://your-tenant.accounts.ondemand.com/oauth2/certs
IAS_AUDIENCE=<client-id>            # Client ID de la aplicación IAS
```

### Desarrollo Local
```bash
# Sin autenticación (default)
IAS_ENABLED=false

# Con autenticación
IAS_ENABLED=true
IAS_ISSUER=https://your-tenant.accounts.ondemand.com
IAS_JWKS_URI=https://your-tenant.accounts.ondemand.com/oauth2/certs
IAS_AUDIENCE=your-client-id
```

### Producción (Kubernetes)
Se recomienda usar Kubernetes Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ias-credentials
  namespace: mcp-cap-integration
type: Opaque
stringData:
  IAS_ISSUER: "https://your-tenant.accounts.ondemand.com"
  IAS_JWKS_URI: "https://your-tenant.accounts.ondemand.com/oauth2/certs"
  IAS_AUDIENCE: "your-client-id"
```

---

## 🛡️ Características de Seguridad

### 1. Validación de Tokens JWT
- ✅ Verificación de firma usando claves públicas JWKS
- ✅ Validación de issuer (`iss` claim)
- ✅ Validación de audience (`aud` claim)
- ✅ Verificación de expiración (`exp` claim)
- ✅ Soporte para algoritmo RS256

### 2. JWKS (JSON Web Key Set)
- ✅ Cache de claves públicas (10 minutos)
- ✅ Rate limiting (10 requests/minuto)
- ✅ Rotación automática de claves
- ✅ Máximo 5 claves en cache

### 3. Middleware de Express
- ✅ Extracción automática de Bearer token
- ✅ Manejo de errores estandarizado
- ✅ Logging de autenticaciones exitosas y fallidas
- ✅ Información de usuario agregada a `req.user`

### 4. Endpoints Públicos
- ✅ `/health` - Health check (no requiere autenticación)
- ✅ `/ready` - Readiness probe (no requiere autenticación)

---

## 📊 Estado de Endpoints

### MCP Service

| Endpoint | Método | Autenticación | Propósito |
|----------|--------|---------------|-----------|
| `/mcp` | POST | **Requerida*** | Endpoint principal MCP |
| `/mcp` | GET | **Requerida*** | SSE streaming |
| `/mcp` | DELETE | **Requerida*** | Terminar sesión |
| `/health` | GET | ❌ Pública | Health check |
| `/ready` | GET | ❌ Pública | Readiness probe |

\* Solo si `IAS_ENABLED=true`

### CAP Service

| Endpoint | Método | Autenticación | Propósito |
|----------|--------|---------------|-----------|
| `/odata/v4/catalog/*` | ALL | **Requerida*** | Todos los endpoints OData |
| `/` | GET | ❌ Pública | Root endpoint |

\* Solo si `IAS_ENABLED=true`

---

## 🧪 Testing

### Test Sin Autenticación (Development)
```bash
# MCP Service
curl -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

# CAP Service
curl -X GET "http://localhost:4004/odata/v4/catalog/Products"
```

### Test Con Autenticación (Production)
```bash
# 1. Obtener token de IAS
TOKEN=$(curl -X POST "https://your-tenant.accounts.ondemand.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<client-id>" \
  -d "client_secret=<client-secret>" \
  | jq -r '.access_token')

# 2. Usar token en MCP Service
curl -X POST "https://mcp-service.kyma.ondemand.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

# 3. Usar token en CAP Service
curl -X GET "https://cap-service.kyma.ondemand.com/odata/v4/catalog/Products" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Configuración de Claude Desktop

### Sin Autenticación
```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.c-<cluster-id>.kyma.ondemand.com/mcp"
    }
  }
}
```

### Con Autenticación
```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.c-<cluster-id>.kyma.ondemand.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-access-token>"
      }
    }
  }
}
```

**⚠️ Nota:** Para producción, implementa un mecanismo de refresh token automático.

---

## 🚀 Despliegue

### Paso 1: Build de Imágenes
```bash
# MCP Service
cd mcp-service
docker build -t amartiinezg/mcp-service:v2.0.0-oauth .
docker push amartiinezg/mcp-service:v2.0.0-oauth

# CAP Service
cd ../cap-service
docker build -t amartiinezg/cap-service:v2.0.0-oauth .
docker push amartiinezg/cap-service:v2.0.0-oauth
```

### Paso 2: Crear Secrets en Kubernetes
```bash
kubectl create secret generic ias-credentials \
  --from-literal=IAS_ISSUER=https://your-tenant.accounts.ondemand.com \
  --from-literal=IAS_JWKS_URI=https://your-tenant.accounts.ondemand.com/oauth2/certs \
  --from-literal=IAS_AUDIENCE=your-client-id \
  -n mcp-cap-integration
```

### Paso 3: Actualizar Deployments
```bash
kubectl set image deployment/mcp-service \
  mcp-service=amartiinezg/mcp-service:v2.0.0-oauth \
  -n mcp-cap-integration

kubectl set image deployment/cap-service \
  cap-service=amartiinezg/cap-service:v2.0.0-oauth \
  -n mcp-cap-integration
```

### Paso 4: Habilitar Autenticación
```bash
kubectl set env deployment/mcp-service IAS_ENABLED=true -n mcp-cap-integration
kubectl set env deployment/cap-service IAS_ENABLED=true -n mcp-cap-integration
```

### Paso 5: Verificar
```bash
kubectl logs -f deployment/mcp-service -n mcp-cap-integration
# Buscar: "🔐 IAS Authentication initialized"

kubectl logs -f deployment/cap-service -n mcp-cap-integration
# Buscar: "🔐 CAP Service: JWT Authentication enabled"
```

---

## ⚠️ Troubleshooting Común

### Error: "Invalid token: missing kid in header"
**Solución:** Asegúrate de que IAS está configurado para generar tokens JWT (no opaque tokens).

### Error: "Unauthorized: Missing or invalid Authorization header"
**Solución:** Verifica el formato del header: `Authorization: Bearer <token>`

### Error: "Token expired"
**Solución:** Obtén un nuevo token o implementa refresh token logic.

### Error: "Invalid issuer"
**Solución:** Verifica que `IAS_ISSUER` coincida exactamente con el claim `iss` del token.

### Error: "Cannot fetch JWKS"
**Solución:** Verifica conectividad de red desde KYMA a IAS.

Ver [docs/IAS_SETUP.md](docs/IAS_SETUP.md) para troubleshooting detallado.

---

## 📚 Recursos

### Documentación
- **[docs/IAS_SETUP.md](docs/IAS_SETUP.md)** - Guía completa de configuración OAuth 2.0
- **[mcp-service/README.md](mcp-service/README.md)** - Documentación del MCP Service
- **[CLAUDE.md](CLAUDE.md)** - Guía para Claude Code

### Referencias Externas
- [SAP Cloud Identity Services](https://help.sap.com/docs/identity-authentication)
- [OAuth 2.0 Authorization Code Flow](https://oauth.net/2/grant-types/authorization-code/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [JWKS Specification](https://datatracker.ietf.org/doc/html/rfc7517)

---

## ✅ Checklist de Implementación

### Desarrollo
- [x] Instalar dependencias OAuth 2.0
- [x] Crear módulo de autenticación IAS
- [x] Implementar middleware de Express
- [x] Proteger endpoints MCP
- [x] Proteger endpoints CAP
- [x] Crear archivos .env.example
- [x] Actualizar Dockerfiles
- [x] Compilar y probar código

### Documentación
- [x] Crear docs/IAS_SETUP.md
- [x] Actualizar READMEs
- [x] Actualizar CLAUDE.md
- [x] Crear resumen de implementación

### Deployment
- [x] Actualizar deployments de Kubernetes
- [x] Agregar variables de entorno
- [x] Documentar proceso de despliegue

### Testing
- [ ] Probar autenticación local
- [ ] Probar en KYMA
- [ ] Validar Claude Desktop integration
- [ ] Verificar logs y errores

---

## 🎯 Próximos Pasos

1. **Testing Completo**
   - Probar autenticación con tokens de IAS
   - Validar todos los endpoints
   - Verificar manejo de errores

2. **Configuración de IAS**
   - Crear aplicación OAuth en IAS
   - Configurar scopes y permisos
   - Generar client credentials

3. **Despliegue en KYMA**
   - Build y push de nuevas imágenes
   - Crear secrets con credenciales IAS
   - Actualizar deployments
   - Habilitar autenticación

4. **Integración con Claude Desktop**
   - Obtener access token
   - Configurar headers en claude_desktop_config.json
   - Implementar refresh token logic (opcional)

---

**Fecha de Implementación:** 2025-10-09
**Versión:** 2.0.0-oauth
**Estado:** ✅ Implementación Completa
