# Integración MCP + CAP OData 🚀

Este proyecto integra un servidor MCP (Model Context Protocol) con una aplicación CAP (Cloud Application Programming Model) de SAP que expone servicios OData.

## Arquitectura 🏗️

### Componentes

1. **Servidor MCP** (`src/index.ts`)
   - Servidor HTTP que expone capacidades MCP
   - Herramientas para interactuar con el servicio OData de CAP
   - Puerto por defecto: 3001

2. **Aplicación CAP** (`cap/`)
   - Modelo de datos: `cap/db/schema.cds`
   - Servicio: `cap/srv/catalog-service.cds`
   - Lógica de negocio: `cap/srv/catalog-service.js`
   - Puerto por defecto: 4004

### Modelo de Datos (CAP)

#### Entidades Principales

**Products** - Catálogo de productos
- ID, name, description, price, stock, category, active
- Timestamps automáticos (createdAt, modifiedAt)

**Orders** - Órdenes de compra
- ID, orderNumber, customerName, totalAmount, status
- Relación con OrderItems (composición)

**OrderItems** - Ítems de las órdenes
- ID, quantity, unitPrice, subtotal
- Asociaciones a Order y Product

**Customers** - Clientes
- ID, name, email, phone, address, active

## Herramientas MCP 🛠️

El servidor MCP expone 3 herramientas para interactuar con el servicio OData:

### 1. `cap_list_products`
Lista todos los productos del catálogo o filtra por bajo stock.

**Parámetros:**
- `filterByLowStock` (boolean): Filtrar solo productos con bajo stock
- `threshold` (number): Umbral de stock (default: 10)

**Ejemplo:**
```json
{
  "filterByLowStock": true,
  "threshold": 5
}
```

### 2. `cap_create_order`
Crea una nueva orden de compra con múltiples productos.

**Parámetros:**
- `customerName` (string): Nombre del cliente
- `items` (array): Lista de productos
  - `productId` (UUID): ID del producto
  - `quantity` (number): Cantidad

**Ejemplo:**
```json
{
  "customerName": "Juan Pérez",
  "items": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2
    },
    {
      "productId": "550e8400-e29b-41d4-a716-446655440001",
      "quantity": 1
    }
  ]
}
```

**Características:**
- Valida stock disponible antes de crear la orden
- Actualiza automáticamente el stock de productos
- Calcula el total de la orden
- Genera número de orden único

### 3. `cap_update_order_status`
Actualiza el estado de una orden existente.

**Parámetros:**
- `orderId` (UUID): ID de la orden
- `newStatus` (string): Nuevo estado (PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED)

**Ejemplo:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440002",
  "newStatus": "SHIPPED"
}
```

## Funciones y Acciones CAP Personalizadas

### Acciones

**createCompleteOrder**
- Crea orden completa con validación de stock
- Actualiza inventario automáticamente

**updateOrderStatus**
- Actualiza estado con validación
- Estados permitidos: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED

### Funciones

**getLowStockProducts(threshold)**
- Retorna productos con stock menor al umbral especificado
- Default threshold: 10

## Instalación y Configuración ⚙️

### 1. Instalar dependencias

```bash
npm install
```

### 2. Compilar TypeScript

```bash
npm run build
```

### 3. Inicializar base de datos CAP

```bash
npm run cap:deploy
```

**Nota:** La base de datos se creará en `cap/db.sqlite`. Si se crea en la raíz, muévela a la carpeta `cap/`.

### 4. Iniciar servicios

**Opción A: Iniciar ambos servicios simultáneamente** (Recomendado)
```bash
npm run start:all
```

Este comando usa el script `start-all.js` que:
- Inicia primero el servidor CAP en puerto 4004
- Espera 3 segundos
- Inicia el servidor MCP en puerto 3001
- Maneja correctamente Ctrl+C para detener ambos servicios

**Opción B: Iniciar servicios por separado**

Terminal 1 - Servidor CAP:
```bash
npm run cap:start
```

Terminal 2 - Servidor MCP (espera a que CAP esté listo):
```bash
npm start
```

## Endpoints 🌐

### Servidor MCP (puerto 3001)
- `POST /mcp` - Endpoint principal MCP
- `GET /mcp` - SSE para eventos MCP
- `DELETE /mcp` - Terminar sesión MCP
- `GET /health` - Health check
- `GET /ready` - Readiness check

### Servidor CAP (puerto 4004)
- `GET /odata/v4/catalog` - Metadata del servicio
- `GET /odata/v4/catalog/Products` - Lista de productos
- `GET /odata/v4/catalog/Orders` - Lista de órdenes
- `GET /odata/v4/catalog/Customers` - Lista de clientes
- `POST /odata/v4/catalog/createCompleteOrder` - Crear orden
- `POST /odata/v4/catalog/updateOrderStatus` - Actualizar estado
- `GET /odata/v4/catalog/getLowStockProducts` - Productos bajo stock

## Datos de Ejemplo 📊

Al iniciar el servidor CAP, se crean automáticamente 5 productos de ejemplo:

1. **Laptop Dell XPS 15** - $1299.99 (15 unidades)
2. **Mouse Logitech MX Master 3** - $99.99 (50 unidades)
3. **Monitor LG UltraWide 34"** - $599.99 (8 unidades)
4. **Teclado Mecánico Keychron K2** - $89.99 (3 unidades) ⚠️ Bajo stock
5. **Webcam Logitech C920** - $79.99 (25 unidades)

## Configuración con Claude Desktop 🤖

Agregar en el archivo de configuración de Claude Desktop:

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

## Variables de Entorno 🔧

Crear archivo `.env` (opcional):

```env
# Puerto del servidor MCP
PORT=3001

# URL del servicio CAP
CAP_SERVICE_URL=http://localhost:4004

# Configuración de base de datos CAP
CDS_DB=sqlite
```

## Pruebas con curl 🧪

### Listar productos (OData directo)
```bash
curl http://localhost:4004/odata/v4/catalog/Products
```

### Crear orden (OData directo)
```bash
curl -X POST http://localhost:4004/odata/v4/catalog/createCompleteOrder \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test User",
    "items": [{"productId": "UUID-HERE", "quantity": 1}]
  }'
```

### Productos con bajo stock
```bash
curl "http://localhost:4004/odata/v4/catalog/getLowStockProducts?threshold=10"
```

## Debugging 🐞

### MCP Inspector
```bash
npm run inspector
```

### Logs del servidor CAP
El servidor CAP muestra logs detallados en la consola, incluyendo:
- Consultas SQL generadas
- Errores de validación
- Operaciones CRUD

### Logs del servidor MCP
El servidor MCP muestra:
- Peticiones MCP recibidas
- Sesiones activas
- Errores de herramientas

## Notas Importantes ⚠️

1. **Orden de inicio**: Iniciar primero el servidor CAP (puerto 4004) antes del servidor MCP
2. **Base de datos**: SQLite se usa por defecto para desarrollo (archivo `cap/db.sqlite`)
3. **Stock**: Las órdenes validan y actualizan el stock automáticamente
4. **IDs**: Usar UUIDs válidos al crear órdenes (obtenerlos listando productos primero)
5. **Estados**: Solo los estados definidos son válidos para actualizar órdenes

## Estructura de Archivos 📁

```
.
├── src/
│   ├── index.ts              # Servidor MCP principal
│   └── cap-integration.ts    # Cliente para interactuar con CAP
├── cap/
│   ├── db/
│   │   └── schema.cds        # Modelo de datos CAP
│   ├── srv/
│   │   ├── catalog-service.cds    # Definición del servicio
│   │   └── catalog-service.js     # Lógica de negocio
│   └── server.cds            # Punto de entrada CAP
├── package.json              # Dependencias y scripts
└── README-CAP.md            # Esta documentación
```

## Siguientes Pasos 🎯

1. ✅ Implementar autenticación y autorización
2. ✅ Agregar más validaciones de negocio
3. ✅ Implementar paginación en listados
4. ✅ Agregar búsqueda y filtros avanzados
5. ✅ Desplegar a SAP BTP o plataforma cloud
6. ✅ Agregar tests unitarios e integración
7. ✅ Documentar API con OpenAPI/Swagger
