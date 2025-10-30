# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server integrated with SAP CAP (Cloud Application Programming Model) demonstrating:
- MCP server with Low-Level API and Streamable HTTP transport
- OAuth 2.0 authentication with SAP Identity Authentication Service (IAS)
- **OAuth Discovery** - RFC 8414 (Authorization Server Metadata) with custom proxy endpoints
- **OAuth Proxy Endpoints** - Filters RFC 8707 `resource` parameter for SAP IAS compatibility
- CAP OData service for e-commerce catalog management
- 4 MCP tools to interact with CAP OData endpoints
- **SAP OnPremise Integration** - Business Partner API via BTP Destination Service and Cloud Connector
- 2 MCP tools for Business Partner operations (get, search)
- Note-taking system (original MCP demo)
- JWT token validation using JWKS (JSON Web Key Set)
- Combined authentication (JWT Bearer token + OAuth session cookies)

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to build/ directory
npm run cap:deploy   # Initialize CAP database (SQLite)
npm run start:all    # Start both CAP and MCP servers (recommended)
npm run cap:start    # Start only CAP server (port 4004)
npm start            # Start only MCP server (port 3001)
npm run inspector    # Debug with MCP Inspector
```

**Important:** Always start CAP server before MCP server. Use `npm run start:all` to start both automatically.

## Architecture

### MCP Server (src/index.ts)

The server implements three MCP capability types:

**Resources** - Notes accessible via `note:///` URIs
- `ListResourcesRequestSchema`: Returns all notes as MCP resources
- `ReadResourceRequestSchema`: Returns specific note content by ID

**Tools** - Actions invokable by MCP clients (6 total)
- `create_note`: Creates notes with title and content (original demo)
- `cap_list_products`: Lists all products from CAP OData, optionally filtered by low stock
- `cap_create_order`: Creates purchase order with products and quantities
- `cap_update_order_status`: Updates order status (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED)
- `sap_get_business_partner`: Get Business Partner by ID from SAP OnPremise via Cloud Connector
- `sap_search_business_partners`: Search Business Partners by name from SAP OnPremise

**Prompts** - Templates for LLM interactions
- `summarize_notes`: Returns prompt with embedded note resources

### Authentication (mcp-service/src/auth/ias-auth.ts)

OAuth 2.0 authentication using SAP IAS:
- `loadIASConfig()`: Loads configuration from environment variables
- `initializeJWKSClient(config)`: Initializes JWKS client for token validation
- `verifyToken(token, config)`: Validates JWT tokens using public keys from JWKS
- `authMiddleware(config)`: Express middleware for protecting endpoints
- `extractToken(req)`: Extracts Bearer token from Authorization header

**Authentication is optional** - controlled by `IAS_ENABLED` environment variable.

See [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) for complete OAuth 2.0 setup guide.

### CAP Integration (mcp-service/src/cap-integration.ts)

`CAPClient` class provides HTTP client wrapper for CAP OData service:
- `getProducts()`: Fetch all products
- `getLowStockProducts(threshold)`: Filter products with low inventory
- `createCompleteOrder(customerName, items)`: Create order with validation and stock updates
- `updateOrderStatus(orderId, newStatus)`: Update order workflow state
- Uses Axios for HTTP communication with `/odata/v4/catalog` endpoints
- Includes detailed error logging with URL and error codes

### CAP Service (db/schema.cds, srv/catalog-service.cds)

**Entities:**
- `Products`: name, description, price, stock, category, active
- `Orders`: orderNumber, customerName, totalAmount, status, orderDate
- `OrderItems`: quantity, unitPrice, subtotal (associations to Order and Product)
- `Customers`: name, email, phone, address, active

**Service Actions/Functions:**
- `createCompleteOrder`: Validates stock, creates order with items, updates inventory
- `updateOrderStatus`: Changes order status with validation
- `getLowStockProducts(threshold)`: Returns products below stock threshold

**Business Logic (srv/catalog-service.js):**
- Auto-initializes 5 sample products on first read
- Validates stock availability before order creation
- Automatic stock deduction on order creation
- Price and stock validation on product create/update

### CAP Service Authentication (cap-service/server.js, srv/auth-middleware.js)

OAuth 2.0 authentication for CAP OData endpoints:
- `server.js`: Custom CAP server bootstrap with authentication middleware
- `auth-middleware.js`: JWT validation middleware for Express
- Applies authentication to `/odata/v4/catalog` routes when enabled
- Uses same JWKS validation as MCP service for consistency

### SAP OnPremise Integration (mcp-service/src/sap-onpremise/)

Integration with SAP OnPremise systems via BTP Destination Service and Cloud Connector:

**Architecture Flow:**
```
MCP Server → BTP Destination Service → Connectivity Proxy (kyma-system) → Cloud Connector → SAP OnPremise System
```

**Important:** The connectivity-proxy is deployed in the `kyma-system` namespace as a Kyma module. Your application code communicates only with the Destination Service API, which internally routes through the connectivity-proxy.

**Components:**
- `destination-service.ts`: BTP Destination Service client with OAuth 2.0 authentication
  - `DestinationServiceClient`: Manages OAuth tokens and retrieves destination configuration
  - `loadDestinationServiceConfig()`: Loads configuration from environment variables
  - `getAccessToken()`: OAuth 2.0 Client Credentials flow for BTP authentication
  - `getDestination()`: Retrieves destination configuration including credentials

- `business-partner-client.ts`: SAP Business Partner API client
  - `BusinessPartnerClient`: Queries Business Partner data from SAP OnPremise
  - `getBusinessPartner(id)`: Get specific Business Partner by ID
  - `searchBusinessPartners(searchTerm, top)`: Search Business Partners by name
  - `formatBusinessPartner(bp)`: Format Business Partner data for display

- `types.ts`: TypeScript interfaces for SAP integration
  - `DestinationServiceConfig`, `DestinationConfiguration`
  - `BusinessPartner`, `BusinessPartnerAddress`
  - `OAuthTokenResponse`, `DestinationServiceResponse`

**Configuration Requirements:**
- `BTP_DESTINATION_SERVICE_URL`: Destination Service URL from BTP service key
- `BTP_DESTINATION_CLIENT_ID`: OAuth client ID for Destination Service
- `BTP_DESTINATION_CLIENT_SECRET`: OAuth client secret for Destination Service
- `BTP_DESTINATION_TOKEN_URL`: OAuth token endpoint URL
- `BTP_DESTINATION_NAME`: Name of destination configured in BTP Cockpit

**Authentication is optional** - If destination service configuration is not provided, SAP OnPremise tools will not be available.

See [mcp-service/src/sap-onpremise/README.md](mcp-service/src/sap-onpremise/README.md) for complete setup guide.

### HTTP Transport & Session Management

Uses `StreamableHTTPServerTransport` from MCP SDK for HTTP-based sessions:

- **POST /mcp**: Main endpoint for MCP requests **(requires authentication if enabled)**
- **GET /mcp**: SSE (Server-Sent Events) streaming endpoint **(requires authentication if enabled)**
- **DELETE /mcp**: Session termination **(requires authentication if enabled)**
- **GET /health**: Kubernetes liveness probe (public, no authentication required)
- **GET /ready**: Kubernetes readiness probe (public, no authentication required)
- **GET /.well-known/oauth-authorization-server**: OAuth Server Metadata (RFC 8414) for discovery
- **GET /oauth/authorize**: OAuth proxy endpoint - filters `resource` parameter before forwarding to SAP IAS
- **POST /oauth/token**: OAuth token proxy endpoint - filters `resource` parameter before forwarding to SAP IAS
- **GET /mcp/login**: OAuth 2.0 Authorization Code Flow - login initiation
- **GET /mcp/callback**: OAuth 2.0 callback handler
- **GET /mcp/logout**: OAuth 2.0 logout

**Important:** The `/.well-known/oauth-protected-resource` endpoint (RFC 9728) is **intentionally disabled** because SAP IAS does not support the RFC 8707 `resource` parameter. When enabled, MCP clients automatically add this parameter causing `invalid_target` errors.

**Session lifecycle:**
1. Client sends `initialize` request without session ID to POST /mcp
2. Transport created with `sessionIdGenerator` (randomUUID), stored in `transports` map
3. `onsessioninitialized` callback stores transport by session ID
4. Subsequent requests include `mcp-session-id` header to reuse transport
5. On DELETE or `onclose` callback, transport removed from map

**Data storage:** Notes stored in-memory as `{ [id: string]: Note }` where `Note = { title: string; content: string }`

**Graceful shutdown:** SIGINT handler closes all active transports before exit

## TypeScript Configuration

- ES modules (package.json: `"type": "module"`)
- Target: ES2022, Module: Node16
- Output: `./build`, Source: `./src`

## Docker Deployment

Multi-stage Dockerfile:
1. Builder: Compiles TypeScript with all dependencies
2. Production: Only compiled code + production dependencies

Environment variables:
- `PORT`: Server port (default 3001)
- `NODE_ENV`: production

Build and run:
```bash
docker build -t mcp-server .
docker run -p 3001:3001 mcp-server
```

## Kubernetes Deployment

Configuration in `k8s/03-deployment.yaml`:
- Update image: `docker.io/amartiinezg/mcp-low-level-server:latest`
- Namespace: `mcp-server`
- Resources: 256Mi-512Mi memory, 100m-500m CPU
- Probes use `/health` endpoint

## MCP Client Configuration

### Claude Desktop

**Config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

**Local (without authentication):**
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

**Production (with OAuth):**
```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "https://mcp-service.a7dda9c.kyma.ondemand.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### Gemini CLI

**Config location:**
- Windows: `%USERPROFILE%\.gemini\settings.json`
- macOS/Linux: `~/.gemini/settings.json`

**With OAuth Discovery (recommended):**
```json
{
  "mcpServers": {
    "mcp-cap-service": {
      "url": "https://mcp-service.a7dda9c.kyma.ondemand.com/mcp",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "scopes": ["openid", "email", "profile"],
        "authProviderType": "dynamic_discovery"
      }
    }
  }
}
```

**Authentication:**
```bash
# Authenticate with OAuth
/mcp auth mcp-cap-service

# List available servers
/mcp list

# Test tools
/mcp tools mcp-cap-service
```
