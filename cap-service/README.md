# CAP Catalog Service 📦

Servicio CAP (Cloud Application Programming Model) de SAP que expone un catálogo de productos y gestión de órdenes mediante OData v4.

## Características

- **OData v4** - API REST estándar para operaciones CRUD
- **SQLite** - Base de datos para desarrollo (sustituible por PostgreSQL/HANA)
- **Datos de ejemplo** - 5 productos precargados automáticamente
- **Validaciones de negocio** - Stock, precios, estados de orden
- **Acciones personalizadas** - Crear órdenes completas, actualizar estados

## Entidades

### Products
- ID, name, description, price, stock, category, active
- Timestamps automáticos

### Orders
- ID, orderNumber, customerName, totalAmount, status, orderDate
- Relación con OrderItems

### OrderItems
- ID, quantity, unitPrice, subtotal
- Asociaciones a Order y Product

### Customers
- ID, name, email, phone, address, active

## API Endpoints

**Base URL:** `http://localhost:4004/odata/v4/catalog`

### Recursos
- `GET /Products` - Lista todos los productos
- `GET /Products({id})` - Obtiene un producto por ID
- `POST /Products` - Crea nuevo producto
- `PATCH /Products({id})` - Actualiza producto
- `DELETE /Products({id})` - Elimina producto

- `GET /Orders` - Lista todas las órdenes
- `GET /Orders({id})?$expand=items($expand=product)` - Orden con ítems
- `GET /Customers` - Lista clientes

### Acciones y Funciones

**createCompleteOrder** (POST)
```json
{
  "customerName": "Juan Pérez",
  "items": [
    {"productId": "uuid", "quantity": 2}
  ]
}
```

**updateOrderStatus** (POST)
```json
{
  "orderId": "uuid",
  "newStatus": "SHIPPED"
}
```

**getLowStockProducts** (GET)
```
GET /getLowStockProducts?threshold=10
```

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Deploy base de datos
npm run deploy

# Iniciar servidor
npm start

# Desarrollo con hot reload
npm run watch
```

## Docker

```bash
# Build
docker build -t cap-service .

# Run
docker run -p 4004:4004 cap-service
```

## Kubernetes / Kyma

```bash
# Aplicar manifiestos
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/cap-service/

# Verificar deployment
kubectl get pods -n mcp-cap-integration
kubectl logs -n mcp-cap-integration -l app=cap-service
```

## Variables de Entorno

- `NODE_ENV` - Entorno (development/production)
- `PORT` - Puerto del servidor (default: 4004)

## Estructura de Archivos

```
cap-service/
├── db/
│   └── schema.cds          # Modelo de datos
├── srv/
│   ├── catalog-service.cds # Definición del servicio
│   └── catalog-service.js  # Lógica de negocio
├── Dockerfile
├── package.json
└── README.md
```

## Comunicación con MCP Service

El servicio CAP es consumido por el MCP Service a través de:
- **Service Discovery:** `cap-service:4004` (dentro del cluster)
- **Protocolo:** HTTP REST
- **Formato:** JSON

En Kubernetes, el MCP service usa la variable de entorno:
```
CAP_SERVICE_URL=http://cap-service:4004
```
