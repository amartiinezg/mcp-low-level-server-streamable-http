# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server integrated with SAP CAP (Cloud Application Programming Model) demonstrating:
- MCP server with Low-Level API and Streamable HTTP transport
- OAuth 2.0 authentication with SAP Identity Authentication Service (IAS)
- CAP OData service for e-commerce catalog management
- 3 MCP tools to interact with CAP OData endpoints
- Note-taking system (original MCP demo)
- JWT token validation using JWKS (JSON Web Key Set)

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

**Tools** - Actions invokable by MCP clients (4 total)
- `create_note`: Creates notes with title and content (original demo)
- `cap_list_products`: Lists all products from CAP OData, optionally filtered by low stock
- `cap_create_order`: Creates purchase order with products and quantities
- `cap_update_order_status`: Updates order status (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED)

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

See [docs/IAS_SETUP.md](docs/IAS_SETUP.md) for complete OAuth 2.0 setup guide.

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

### HTTP Transport & Session Management

Uses `StreamableHTTPServerTransport` from MCP SDK for HTTP-based sessions:

- **POST /mcp**: Main endpoint for MCP requests **(requires authentication if enabled)**
- **GET /mcp**: SSE (Server-Sent Events) streaming endpoint **(requires authentication if enabled)**
- **DELETE /mcp**: Session termination **(requires authentication if enabled)**
- **GET /health**: Kubernetes liveness probe (public, no authentication required)
- **GET /ready**: Kubernetes readiness probe (public, no authentication required)

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

**Claude Desktop config:**

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-low-level-server-streamable-http": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```
