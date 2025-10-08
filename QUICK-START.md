# Quick Start Guide 🚀

Guía rápida para poner en marcha la integración MCP + CAP.

## ⚡ Inicio Rápido (3 pasos)

### 1. Instalar y Compilar

```bash
npm install
npm run build
npm run cap:deploy
```

### 2. Iniciar Servicios

```bash
npm run start:all
```

Deberías ver:
- ✅ Servidor CAP en http://localhost:4004
- ✅ Servidor MCP en http://localhost:3001

### 3. Verificar que Funciona

```bash
# Probar CAP
curl http://localhost:4004/odata/v4/catalog/Products

# Probar MCP
curl http://localhost:3001/health
```

## 🎯 Usar con Claude Desktop

1. Abre la configuración de Claude Desktop:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

2. Agrega esta configuración:

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

3. Reinicia Claude Desktop completamente

4. Verifica que las herramientas estén disponibles:
   - `cap_list_products`
   - `cap_create_order`
   - `cap_update_order_status`
   - `create_note` (demo original)

## 💡 Ejemplos de Uso en Claude Desktop

### Listar todos los productos

**Prompt:**
```
Usa la herramienta cap_list_products para mostrarme todos los productos disponibles
```

### Listar productos con bajo stock

**Prompt:**
```
Muéstrame los productos con menos de 5 unidades en stock usando cap_list_products
```

### Crear una orden

**Primero, obtén los IDs de productos:**
```
Lista los productos disponibles
```

**Luego, crea la orden:**
```
Crea una orden para "Juan Pérez" con:
- 2 unidades del producto "Laptop Dell XPS 15"
- 1 unidad del "Mouse Logitech MX Master 3"

Usa los IDs que obtuviste antes
```

### Actualizar estado de orden

```
Actualiza la orden [ID] al estado "SHIPPED"
```

## 📊 Datos de Ejemplo Precargados

Al iniciar el servidor CAP, se crean automáticamente estos productos:

| Producto | Precio | Stock | Categoría |
|----------|--------|-------|-----------|
| Laptop Dell XPS 15 | $1299.99 | 15 | Electrónica |
| Mouse Logitech MX Master 3 | $99.99 | 50 | Accesorios |
| Monitor LG UltraWide 34" | $599.99 | 8 | Electrónica |
| Teclado Mecánico Keychron K2 | $89.99 | **3** ⚠️ | Accesorios |
| Webcam Logitech C920 | $79.99 | 25 | Accesorios |

**Nota:** El teclado tiene bajo stock (3 unidades).

## 🔍 Explorar la API OData Directamente

### Navegador

Abre en tu navegador:
- Metadata: http://localhost:4004/odata/v4/catalog/$metadata
- Productos: http://localhost:4004/odata/v4/catalog/Products
- Órdenes: http://localhost:4004/odata/v4/catalog/Orders

### curl

```bash
# Listar productos
curl http://localhost:4004/odata/v4/catalog/Products

# Productos con bajo stock (threshold=10)
curl "http://localhost:4004/odata/v4/catalog/getLowStockProducts?threshold=10"

# Crear orden
curl -X POST http://localhost:4004/odata/v4/catalog/createCompleteOrder \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test User",
    "items": [
      {"productId": "UUID-DEL-PRODUCTO", "quantity": 2}
    ]
  }'
```

## 🛑 Detener Servicios

Si usaste `npm run start:all`:
- Presiona **Ctrl+C** una vez
- El script detendrá ambos servicios automáticamente

Si iniciaste manualmente:
- Presiona **Ctrl+C** en cada terminal

## 🐛 Problemas?

Consulta [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para soluciones a problemas comunes.

### Problema más común: Puerto en uso

```bash
# Windows - matar proceso en puerto 4004
netstat -ano | findstr :4004
taskkill /PID <PID> /F

# Windows - matar proceso en puerto 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

## 📚 Documentación Adicional

- [README-CAP.md](./README-CAP.md) - Documentación completa de la integración
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Solución de problemas
- [CLAUDE.md](./CLAUDE.md) - Guía para Claude Code

## 🎓 Próximos Pasos

1. **Explorar el código:**
   - `src/index.ts` - Servidor MCP principal
   - `src/cap-integration.ts` - Cliente para CAP
   - `db/schema.cds` - Modelo de datos
   - `srv/catalog-service.js` - Lógica de negocio

2. **Agregar más funcionalidad:**
   - Crear más herramientas MCP
   - Añadir más entidades al modelo CAP
   - Implementar autenticación
   - Añadir más validaciones de negocio

3. **Desplegar a producción:**
   - Configurar PostgreSQL/HANA en lugar de SQLite
   - Añadir variables de entorno
   - Configurar HTTPS
   - Desplegar a SAP BTP o cloud provider

## ✨ Tips Útiles

- **Logs detallados de CAP:** `DEBUG=cds:* npm run cap:start`
- **Inspector MCP:** `npm run inspector` (abre en navegador)
- **Hot reload:** CAP ya tiene hot reload incluido con `cds watch`
- **Base de datos:** El archivo SQLite está en `cap/db.sqlite`
