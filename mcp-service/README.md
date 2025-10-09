# MCP Server HTTP 🔗

Servidor MCP (Model Context Protocol) que expone herramientas para interactuar con el servicio CAP OData mediante HTTP transport.

## Características

- **HTTP Transport** - Streamable HTTP para MCP
- **Session Management** - Gestión de sesiones con headers
- **OAuth 2.0 Authentication** - Autenticación JWT con SAP IAS (opcional)
- **3 Herramientas CAP** - Integración con OData
- **Health Checks** - Endpoints para Kubernetes
- **SSE Support** - Server-Sent Events para streaming

## Herramientas MCP

### 1. cap_list_products
Lista todos los productos del catálogo OData.

**Parámetros:**
- `filterByLowStock` (boolean, opcional) - Filtrar por bajo stock
- `threshold` (number, opcional) - Umbral de stock (default: 10)

### 2. cap_create_order
Crea una orden de compra completa.

**Parámetros:**
- `customerName` (string, requerido) - Nombre del cliente
- `items` (array, requerido) - Lista de productos
  - `productId` (string) - UUID del producto
  - `quantity` (number) - Cantidad a ordenar

### 3. cap_update_order_status
Actualiza el estado de una orden existente.

**Parámetros:**
- `orderId` (string, requerido) - UUID de la orden
- `newStatus` (string, requerido) - Nuevo estado (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED)

## Endpoints HTTP

- `POST /mcp` - Endpoint principal MCP (JSON-RPC) **(requiere autenticación si está habilitada)**
- `GET /mcp` - SSE para streaming de eventos MCP **(requiere autenticación si está habilitada)**
- `DELETE /mcp` - Terminar sesión MCP **(requiere autenticación si está habilitada)**
- `GET /health` - Health check (público, no requiere autenticación)
- `GET /ready` - Readiness probe (público, no requiere autenticación)

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Iniciar servidor
npm start

# Desarrollo con build automático
npm run dev

# MCP Inspector
npm run inspector
```

## Configuración

### Variables de Entorno

**Configuración Básica:**
- `NODE_ENV` - Entorno (development/production)
- `PORT` - Puerto del servidor (default: 3001)
- `CAP_SERVICE_URL` - URL del servicio CAP (default: http://localhost:4004)

**Autenticación OAuth 2.0 (Opcional):**
- `IAS_ENABLED` - Habilitar autenticación (true/false, default: false)
- `IAS_ISSUER` - URL del tenant IAS (e.g., https://your-tenant.accounts.ondemand.com)
- `IAS_JWKS_URI` - URL del JWKS endpoint (default: {IAS_ISSUER}/oauth2/certs)
- `IAS_AUDIENCE` - Client ID esperado en el token

Ver [docs/IAS_SETUP.md](../docs/IAS_SETUP.md) para configuración completa de OAuth 2.0.

### Claude Desktop Config

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

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

Para Kyma (después del deployment):
```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.{your-kyma-cluster}.kyma.ondemand.com/mcp"
    }
  }
}
```

**Con autenticación OAuth 2.0:**
```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.{your-kyma-cluster}.kyma.ondemand.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-access-token>"
      }
    }
  }
}
```

**Nota:** Para producción, considera implementar un mecanismo de refresh token automático. Ver [docs/IAS_SETUP.md](../docs/IAS_SETUP.md).

## Docker

```bash
# Build
docker build -t mcp-service .

# Run (requiere CAP service corriendo)
docker run -p 3001:3001 \
  -e CAP_SERVICE_URL=http://cap-service:4004 \
  mcp-service
```

## Kubernetes / Kyma

```bash
# Aplicar manifiestos
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mcp-service/

# Verificar deployment
kubectl get pods -n mcp-cap-integration
kubectl logs -n mcp-cap-integration -l app=mcp-service

# Obtener URL externa (APIRule)
kubectl get apirule -n mcp-cap-integration
```

## Arquitectura

```
┌─────────────────────┐
│  Claude Desktop     │
└──────────┬──────────┘
           │ MCP HTTP Protocol
           ↓
┌─────────────────────┐
│  MCP Service        │
│  (port 3001)        │
│                     │
│  - Session Mgmt     │
│  - MCP Tools        │
│  - CAP Client       │
└──────────┬──────────┘
           │ HTTP REST
           ↓
┌─────────────────────┐
│  CAP Service        │
│  (port 4004)        │
│                     │
│  - OData v4         │
│  - Business Logic   │
└─────────────────────┘
```

## Estructura de Archivos

```
mcp-service/
├── src/
│   ├── index.ts              # Servidor MCP principal
│   ├── cap-integration.ts    # Cliente HTTP para CAP
│   └── auth/
│       └── ias-auth.ts       # Módulo de autenticación OAuth 2.0
├── build/                    # Código compilado
├── Dockerfile
├── tsconfig.json
├── package.json
├── .env.example              # Ejemplo de variables de entorno
└── README.md
```

## Session Management

El servidor MCP mantiene sesiones usando el header `mcp-session-id`:

1. Cliente envía request `initialize` sin session ID
2. Servidor crea transport y genera UUID
3. Servidor responde con session ID en header
4. Cliente incluye session ID en requests subsecuentes
5. Sesiones se limpian al recibir DELETE o cerrar conexión

## Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-10-08T...",
  "uptime": 123.45,
  "notesCount": 2,
  "activeSessions": 3
}
```
