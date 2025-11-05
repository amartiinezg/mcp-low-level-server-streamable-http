# MCP Low-Level Server - Streamable HTTP 🔗

Implementación de un servidor MCP (Model Context Protocol) usando la Low-Level API del SDK oficial, con HTTP transport, autenticación OAuth 2.0, e integración con SAP CAP (Cloud Application Programming Model).

## 🌟 Características Principales

- **MCP Server** - Low-Level API con Streamable HTTP transport
- **OAuth 2.0 Authentication** - Autenticación JWT con SAP Identity Authentication Service (IAS)
- **OAuth Discovery** - Soporte completo para RFC 8414 (sin RFC 9728 por compatibilidad con SAP IAS)
- **CAP Integration** - Servicio OData para gestión de catálogo e-commerce
- **SAP OnPremise Integration** - Integración con sistemas SAP On-Premise vía BTP Destination Service y Cloud Connector
- **Generic OData V2 Client** - Cliente flexible para consultar cualquier servicio OData V2 de SAP
- **Automatic Schema Discovery** - Parser de metadatos OData V2 que expone esquemas como recursos MCP
- **Session Management** - Gestión de sesiones HTTP con headers
- **6 MCP Tools** - 4 herramientas CAP + 2 herramientas SAP OData
- **Kubernetes Ready** - Deployable en KYMA BTP
- **Health Checks** - Endpoints para liveness y readiness probes

## 📁 Estructura del Proyecto

```
mcp-low-level-server-streamable-http/
├── mcp-service/              # Servidor MCP (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts          # Servidor MCP principal
│   │   ├── cap-integration.ts # Cliente HTTP para CAP
│   │   ├── auth/
│   │   │   └── ias-auth.ts   # Módulo OAuth 2.0
│   │   └── sap-onpremise/
│   │       ├── destination-service.ts      # Cliente BTP Destination Service
│   │       ├── business-partner-client.ts  # Cliente Business Partner API
│   │       ├── odata-v2-client.ts         # Cliente genérico OData V2
│   │       ├── odata-v2-metadata-parser.ts # Parser de metadatos OData V2
│   │       ├── types.ts                    # Tipos TypeScript
│   │       └── README.md                   # Documentación SAP OnPremise
│   ├── Dockerfile
│   └── package.json
│
├── cap-service/              # Servicio CAP OData
│   ├── db/                   # Modelos de datos CDS
│   ├── srv/                  # Servicios y lógica de negocio
│   │   ├── catalog-service.cds
│   │   ├── catalog-service.js
│   │   ├── auth-middleware.js
│   │   └── server.js
│   ├── Dockerfile
│   └── package.json
│
├── k8s/                      # Manifiestos de Kubernetes
│   ├── namespace.yaml
│   ├── mcp-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── apirule.yaml
│   └── cap-service/
│       ├── deployment.yaml
│       └── service.yaml
│
├── docs/
│   └── DOCUMENTATION.md      # Documentación completa (OAuth 2.0, SAP OnPremise)
│
├── CLAUDE.md                 # Guía para Claude Code
└── README.md                 # Este archivo
```

## 🚀 Quick Start

👉 **[Ver QUICK_START.md](QUICK_START.md)** para instrucciones paso a paso en 5 minutos.

### Prerrequisitos

- Node.js 20+
- Docker Desktop (opcional)
- kubectl (para deployment en KYMA)
- (Opcional) SAP BTP account con IAS para OAuth 2.0

### Desarrollo Local Rápido

```bash
# 1. Instalar dependencias
cd mcp-service && npm install
cd ../cap-service && npm install

# 2. Desplegar base de datos CAP
cd cap-service
npm run deploy

# 3. Iniciar servicios
# Terminal 1 - CAP Service
cd cap-service
npm start

# Terminal 2 - MCP Service
cd mcp-service
npm run build
npm start
```

### Con Docker Compose (recomendado)

```bash
docker-compose up
```

Los servicios estarán disponibles en:
- **MCP Service:** http://localhost:3001
- **CAP Service:** http://localhost:4004

## 🔐 Autenticación OAuth 2.0

Este proyecto soporta autenticación OAuth 2.0 usando SAP Identity Authentication Service (IAS). La autenticación es **opcional** y se controla mediante variables de entorno.

### OAuth Discovery y Compatibilidad con SAP IAS

El servidor implementa **OAuth Discovery** con compatibilidad especial para SAP IAS:

**✅ RFC 8414 - Authorization Server Metadata**
- Endpoint: `GET /.well-known/oauth-authorization-server`
- Permite a clientes MCP descubrir automáticamente la configuración OAuth
- Retorna endpoints de autorización, token y JWKS

**⚠️ RFC 9728 - Protected Resource Metadata (DESHABILITADO)**
- El endpoint `/.well-known/oauth-protected-resource` está **intencionalmente deshabilitado**
- **Razón:** SAP IAS no soporta el parámetro `resource` de RFC 8707
- Cuando los clientes MCP detectan RFC 9728, automáticamente agregan el parámetro `resource` causando error `invalid_target`

**🔄 OAuth Proxy Endpoints**
- `GET /oauth/authorize` - Filtra el parámetro `resource` antes de redirigir a SAP IAS
- `POST /oauth/token` - Filtra el parámetro `resource` antes de reenviar a SAP IAS
- Estos endpoints actúan como proxy para garantizar compatibilidad con SAP IAS

**Clientes MCP compatibles** (Gemini CLI, etc.) pueden conectarse con dynamic discovery:
```json
{
  "mcpServers": {
    "mcp-cap-service": {
      "url": "https://mcp-service.a7dda9c.kyma.ondemand.com/mcp",
      "oauth": {
        "enabled": true,
        "clientId": "YOUR_CLIENT_ID_HERE",
        "clientSecret": "YOUR_CLIENT_SECRET_HERE",
        "scopes": ["openid", "email", "profile"],
        "authProviderType": "dynamic_discovery"
      }
    }
  }
}
```

**Importante:** Este servidor NO soporta dynamic client registration. Debes:
1. Obtener un `client_id` y `client_secret` pre-configurado en SAP IAS
2. Configurar el `redirect_uri` en IAS según tu cliente MCP:
   - Gemini CLI: `http://localhost:7777/oauth/callback`
   - Navegador web: `https://mcp-service.a7dda9c.kyma.ondemand.com/mcp/callback`
3. Agregar `client_id` y `client_secret` a la configuración del cliente MCP

El cliente automáticamente:
1. Detecta que requiere OAuth al recibir 401 con `WWW-Authenticate` header
2. Realiza `GET /.well-known/oauth-authorization-server` para descubrir configuración
3. Inicia el flujo OAuth 2.0 Authorization Code con PKCE
4. Obtiene access token y lo incluye en futuras peticiones

### Sin Autenticación (Development)

```bash
# MCP Service
export IAS_ENABLED=false
npm start

# CAP Service
export IAS_ENABLED=false
npm start
```

### Con Autenticación (Production)

```bash
# MCP Service
export IAS_ENABLED=true
export IAS_ISSUER=https://your-tenant.accounts.ondemand.com
export IAS_JWKS_URI=https://your-tenant.accounts.ondemand.com/oauth2/certs
export IAS_AUDIENCE=your-client-id
npm start

# CAP Service
export IAS_ENABLED=true
export IAS_ISSUER=https://your-tenant.accounts.ondemand.com
export IAS_JWKS_URI=https://your-tenant.accounts.ondemand.com/oauth2/certs
export IAS_AUDIENCE=your-client-id
npm start
```

📚 **Guía Completa:** Ver [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) para configuración paso a paso.

## 🛠️ MCP Tools

El servidor MCP expone 6 herramientas:

### Herramientas CAP (4)

#### 1. `create_note`
Crea notas de texto (demo original de MCP)

**Parámetros:**
- `title` (string) - Título de la nota
- `content` (string) - Contenido de la nota

#### 2. `cap_list_products`
Lista productos del catálogo OData

**Parámetros:**
- `filterByLowStock` (boolean, opcional) - Filtrar por bajo stock
- `threshold` (number, opcional) - Umbral de stock (default: 10)

#### 3. `cap_create_order`
Crea una orden de compra

**Parámetros:**
- `customerName` (string) - Nombre del cliente
- `items` (array) - Lista de productos
  - `productId` (string) - UUID del producto
  - `quantity` (number) - Cantidad

#### 4. `cap_update_order_status`
Actualiza el estado de una orden

**Parámetros:**
- `orderId` (string) - UUID de la orden
- `newStatus` (string) - PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED

### Herramientas SAP OnPremise (2)

#### 5. `sap_odata_query`
Ejecuta consultas flexibles sobre cualquier servicio OData V2 de SAP

**Parámetros:**
- `entitySet` (string) - Nombre del EntitySet (ej: "A_BusinessPartner")
- `key` (string, opcional) - Clave del entity para consulta específica
- `filter` (string, opcional) - Expresión $filter de OData V2
- `select` (string, opcional) - Campos a retornar (separados por coma)
- `expand` (string, opcional) - Propiedades de navegación a expandir
- `orderby` (string, opcional) - Ordenamiento
- `top` (number, opcional) - Límite de resultados
- `skip` (number, opcional) - Offset para paginación
- `inlinecount` (boolean, opcional) - Incluir conteo total

**Restricciones S/4HANA 2022:**
- ⚠️ No combinar `$select` con `$expand` en la misma consulta
- ⚠️ No usar `$select` dentro de `$expand`
- ⚠️ No usar filtros con `any()` lambda operator
- 👉 Ver [CLAUDE.md](CLAUDE.md#sap-onpremise-odata-v2---s4hana-2022-restrictions) para detalles

#### 6. `sap_get_schema_info`
Obtiene información detallada del esquema OData V2

**Parámetros:**
- `entityType` (string, opcional) - Nombre del tipo de entidad para obtener detalles específicos

**Retorna:**
- Lista de todos los EntitySets disponibles
- Propiedades, claves y tipos de datos
- Propiedades de navegación y relaciones

## 📡 Endpoints HTTP

### MCP Service (Port 3001)

| Endpoint | Método | Autenticación | Descripción |
|----------|--------|---------------|-------------|
| `/mcp` | POST | Requerida* | Endpoint principal MCP |
| `/mcp` | GET | Requerida* | SSE streaming |
| `/mcp` | DELETE | Requerida* | Terminar sesión |
| `/health` | GET | Pública | Health check |
| `/ready` | GET | Pública | Readiness probe |
| `/.well-known/oauth-authorization-server` | GET | Pública | OAuth Server Metadata (RFC 8414) |
| `/oauth/authorize` | GET | Pública | OAuth proxy - filtra parámetro `resource` |
| `/oauth/token` | POST | Pública | OAuth token proxy - filtra parámetro `resource` |
| `/mcp/login` | GET | Pública | Iniciar flujo OAuth 2.0 |
| `/mcp/callback` | GET | Pública | Callback OAuth 2.0 |
| `/mcp/logout` | GET | Pública | Cerrar sesión OAuth |

\* Solo si `IAS_ENABLED=true`

### CAP Service (Port 4004)

| Endpoint | Método | Autenticación | Descripción |
|----------|--------|---------------|-------------|
| `/odata/v4/catalog/Products` | GET | Requerida* | Listar productos |
| `/odata/v4/catalog/Orders` | GET | Requerida* | Listar órdenes |
| `/odata/v4/catalog/createCompleteOrder` | POST | Requerida* | Crear orden |
| `/odata/v4/catalog/updateOrderStatus` | POST | Requerida* | Actualizar estado |

\* Solo si `IAS_ENABLED=true`

## 🐳 Docker

### Build de Imágenes

```bash
# MCP Service
cd mcp-service
docker build -t mcp-service:latest .

# CAP Service
cd cap-service
docker build -t cap-service:latest .
```

### Run con Docker

```bash
# Network para comunicación entre servicios
docker network create mcp-network

# CAP Service
docker run -d --name cap-service \
  --network mcp-network \
  -p 4004:4004 \
  -e IAS_ENABLED=false \
  cap-service:latest

# MCP Service
docker run -d --name mcp-service \
  --network mcp-network \
  -p 3001:3001 \
  -e CAP_SERVICE_URL=http://cap-service:4004 \
  -e IAS_ENABLED=false \
  mcp-service:latest
```

## ☸️ Kubernetes / KYMA Deployment

### Paso 1: Crear Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### Paso 2: Deploy Servicios

```bash
# CAP Service
kubectl apply -f k8s/cap-service/

# MCP Service
kubectl apply -f k8s/mcp-service/
```

### Paso 3: Verificar Deployment

```bash
kubectl get pods -n mcp-cap-integration
kubectl get svc -n mcp-cap-integration
kubectl get apirule -n mcp-cap-integration
```

### Paso 4: Obtener URL Externa

```bash
kubectl get virtualservice -n mcp-cap-integration
# URL: https://mcp-service.c-<cluster-id>.kyma.ondemand.com
```

## 🧪 Testing

### Test Manual

```bash
# Health check
curl http://localhost:3001/health

# Inicializar sesión MCP (sin auth)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }'
```

### Test con OAuth 2.0

```bash
# Usar el script de testing
export IAS_TENANT=your-tenant.accounts.ondemand.com
export IAS_CLIENT_ID=your-client-id
export IAS_CLIENT_SECRET=your-client-secret
export MCP_URL=http://localhost:3001
export CAP_URL=http://localhost:4004

./test-oauth.sh
```

### Test con MCP Inspector

```bash
cd mcp-service
npm run inspector
```

## 🔧 Configuración de Claude Desktop

### Local (sin autenticación)

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### KYMA (con autenticación)

```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.a7dda9c.kyma.ondemand.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-access-token>"
      }
    }
  }
}
```

## 📚 Documentación

- **[CLAUDE.md](CLAUDE.md)** - Guía para Claude Code
- **[docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)** - Documentación completa (OAuth 2.0, IAS Setup, Gemini CLI, etc.)
- **[DEPLOYMENT-KYMA.md](DEPLOYMENT-KYMA.md)** - Guía de deployment en KYMA

## 🏗️ Arquitectura

```
┌─────────────────┐
│  Claude Desktop │
│   (MCP Client)  │
└────────┬────────┘
         │
         │ MCP HTTP Protocol
         │ (con Bearer Token opcional)
         ▼
┌─────────────────────────┐
│     MCP Service         │
│  (Express + MCP SDK)    │
│                         │
│  • Session Management   │
│  • OAuth 2.0 (opcional) │
│  • MCP Tools            │
│  • CAP Client           │
└────────┬────────────────┘
         │
         │ HTTP REST
         │ (con Bearer Token opcional)
         ▼
┌─────────────────────────┐
│     CAP Service         │
│   (CAP + OData v4)      │
│                         │
│  • OAuth 2.0 (opcional) │
│  • Business Logic       │
│  • SQLite Database      │
└─────────────────────────┘
```

## 🏢 Integración SAP OnPremise

El MCP Server incluye integración completa con sistemas SAP On-Premise mediante BTP Destination Service y Cloud Connector.

### Arquitectura de Conectividad

```
MCP Server
  → BTP Destination Service
    → Connectivity Proxy (kyma-system)
      → Cloud Connector
        → SAP OnPremise System
```

### Características

- **Cliente Genérico OData V2**: Query flexible sobre cualquier servicio OData V2 de SAP
- **Parser de Metadatos**: Descubrimiento automático de esquemas OData V2 como recursos MCP
- **Soporte S/4HANA 2022**: Compatibilidad con restricciones específicas de OData V2 On-Premise
- **BTP Destination Service**: Autenticación OAuth 2.0 Client Credentials para acceso a destinos
- **Cloud Connector**: Túnel seguro hacia sistemas SAP On-Premise

### Configuración

**Variables de entorno requeridas:**

```bash
BTP_DESTINATION_SERVICE_URL=https://<subaccount>.dest.cfapps.<region>.hana.ondemand.com
BTP_DESTINATION_CLIENT_ID=<client-id-from-service-key>
BTP_DESTINATION_CLIENT_SECRET=<client-secret-from-service-key>
BTP_DESTINATION_TOKEN_URL=https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token
BTP_DESTINATION_NAME=<your-destination-name>
```

### Restricciones S/4HANA 2022

El servidor detecta automáticamente queries incompatibles con S/4HANA 2022 On-Premise:

| Restricción | Problema | Workaround |
|------------|----------|------------|
| `$select` + `$expand` | Expand desaparece de la respuesta | Usar solo `$expand`, filtrar localmente |
| `$select` en `$expand` | Error de sintaxis | Llamar EntitySet de navegación directamente |
| `$filter` con `any()` | No soportado | Expandir y filtrar localmente, o query reverso |

**Ejemplo - Query válido:**
```json
{
  "entitySet": "A_BusinessPartner",
  "expand": "to_BusinessPartnerAddress",
  "top": 10
}
```

**Ejemplo - Query inválido:**
```json
{
  "entitySet": "A_BusinessPartner",
  "select": "BusinessPartner,FirstName",  // ❌ No combinar con expand
  "expand": "to_BusinessPartnerAddress"
}
```

👉 **Documentación completa:** [mcp-service/src/sap-onpremise/README.md](mcp-service/src/sap-onpremise/README.md)

## 🔒 Seguridad

### Autenticación JWT
- ✅ Validación de firma con JWKS
- ✅ Verificación de issuer, audience y expiración
- ✅ Algoritmo RS256
- ✅ Cache de claves públicas (10 min)

### Best Practices
- Usar HTTPS en producción
- Almacenar secrets en Kubernetes Secrets
- Implementar refresh token logic
- Rate limiting (recomendado)
- Audit logging

## 🐛 Troubleshooting

### MCP Service no se conecta a CAP

**Solución:** Verifica la variable `CAP_SERVICE_URL`
```bash
kubectl logs -n mcp-cap-integration deployment/mcp-service | grep "Inicializando CAPClient"
```

### Error de autenticación

**Solución:** Verifica que el token sea válido y no haya expirado
```bash
# Decodificar token
echo $TOKEN | cut -d'.' -f2 | base64 -d | jq .
```

### CAP Service no responde

**Solución:** Verifica que la base de datos esté inicializada
```bash
kubectl exec -it deployment/cap-service -n mcp-cap-integration -- ls /app/data
```

Ver más en [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md#troubleshooting)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto es un demo educativo para mostrar integración de MCP con CAP y OAuth 2.0.

## 🙏 Reconocimientos

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP SDK
- [SAP Cloud Application Programming Model](https://cap.cloud.sap/) - CAP Framework
- [SAP Cloud Identity Services](https://help.sap.com/docs/identity-authentication) - OAuth 2.0 / IAS

---

**Versión:** 1.0.0
**Última Actualización:** 2025-10-15
