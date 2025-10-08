# Servidor MCP + CAP OData Integration 🚀🖥️✨

Este proyecto integra un servidor MCP (Model Context Protocol) con SAP CAP (Cloud Application Programming Model) para demostrar:

- 📦 **Servicio OData CAP** - Catálogo de productos con órdenes de compra
- 🛠️ **3 Herramientas MCP** - Para interactuar con el servicio OData desde Claude Desktop
- 📄 **Sistema de Notas** - Demo original de MCP con recursos y prompts
- 🔗 **Integración HTTP** - MCP tools consultando API OData de CAP

> **🎯 Quick Start:** Ver [QUICK-START.md](./QUICK-START.md) para comenzar en 3 pasos

## Características 🌟

### Herramientas MCP para CAP OData 🛠️

1. **`cap_list_products`** - Lista productos del catálogo
   - Parámetro opcional: `filterByLowStock` y `threshold`
   - Muestra nombre, precio, stock y categoría

2. **`cap_create_order`** - Crea órdenes de compra
   - Requiere: `customerName` y array de `items` (productId, quantity)
   - Valida stock disponible automáticamente
   - Actualiza inventario tras crear la orden

3. **`cap_update_order_status`** - Actualiza estado de órdenes
   - Requiere: `orderId` y `newStatus`
   - Estados: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED

### Modelo de Datos CAP 📊

**Entidades:**
- `Products` - Catálogo de productos (name, price, stock, category)
- `Orders` - Órdenes de compra (orderNumber, customer, total, status)
- `OrderItems` - Ítems de orden (quantity, unitPrice, subtotal)
- `Customers` - Clientes (name, email, phone, address)

**Datos precargados:** 5 productos de ejemplo al iniciar el servidor

### Recursos MCP (Demo Original) 📚

- 📑 Lista y accede a notas mediante URIs `note://`
- ✍️ `create_note` - Crea nuevas notas de texto
- 📝 `summarize_notes` - Genera resumen de todas las notas

## Instalación Rápida 🚀

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar TypeScript
npm run build

# 3. Inicializar base de datos CAP
npm run cap:deploy

# 4. Iniciar ambos servicios
npm run start:all
```

**Servicios iniciados:**
- ✅ CAP OData: http://localhost:4004
- ✅ MCP Server: http://localhost:3001

## Configuración con Claude Desktop ⚙️

**Archivo de configuración:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

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

Reinicia Claude Desktop y verifica que las herramientas `cap_list_products`, `cap_create_order` y `cap_update_order_status` estén disponibles.

## Documentación 📚

- **[QUICK-START.md](./QUICK-START.md)** - Guía de inicio rápido con ejemplos
- **[README-CAP.md](./README-CAP.md)** - Documentación completa de la integración CAP
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Solución de problemas comunes
- **[CLAUDE.md](./CLAUDE.md)** - Guía para Claude Code

## Debugging 🐞

### MCP Inspector
```bash
npm run inspector
```

### Logs detallados de CAP
```bash
DEBUG=cds:* npm run cap:start
```

### Verificar servicios
```bash
# CAP OData
curl http://localhost:4004/odata/v4/catalog/Products

# MCP Health
curl http://localhost:3001/health
```

## Arquitectura 🏗️

```
┌─────────────────────┐
│  Claude Desktop     │
│                     │
│  - cap_list_products│
│  - cap_create_order │
│  - cap_update_...   │
└──────────┬──────────┘
           │ HTTP MCP Protocol
           ↓
┌─────────────────────┐
│  MCP Server         │
│  (port 3001)        │
│                     │
│  src/index.ts       │
│  src/cap-integration│
└──────────┬──────────┘
           │ HTTP REST
           ↓
┌─────────────────────┐
│  CAP Server         │
│  (port 4004)        │
│                     │
│  OData v4 Service   │
│  SQLite Database    │
└─────────────────────┘
```
