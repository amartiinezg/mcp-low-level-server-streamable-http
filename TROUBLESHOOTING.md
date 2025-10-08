# Troubleshooting 🔧

## Problemas Comunes y Soluciones

### 1. Error: "SQLITE_ERROR" con json_insert

**Síntoma:**
```
Error: SQLITE_ERROR: near "->": syntax error
query: SELECT json_insert(...) -> '$' ...
```

**Causa:** Incompatibilidad entre la versión de `@cap-js/sqlite` y la sintaxis SQL generada por CAP.

**Solución:**
1. Eliminar la base de datos existente:
   ```bash
   rm -f cap/db.sqlite*
   ```

2. Verificar configuración en `package.json`:
   ```json
   "cds": {
     "requires": {
       "db": {
         "kind": "sqlite",
         "credentials": {
           "url": "cap/db.sqlite"
         }
       }
     },
     "sql": {
       "native_hana_associations": false
     }
   }
   ```

3. Redesplegar la base de datos:
   ```bash
   npm run cap:deploy
   ```

4. Si la base de datos se creó en la raíz del proyecto:
   ```bash
   mv db.sqlite cap/db.sqlite
   ```

### 2. El servidor MCP no puede conectarse a CAP

**Síntoma:**
```
Error obteniendo productos: connect ECONNREFUSED 127.0.0.1:4004
```

**Causa:** El servidor CAP no está ejecutándose o no está listo.

**Solución:**
1. Asegúrate de iniciar CAP primero:
   ```bash
   npm run cap:start
   ```

2. Espera a ver este mensaje:
   ```
   [cds] - server listening on { url: 'http://localhost:4004' }
   ```

3. Luego inicia MCP:
   ```bash
   npm start
   ```

4. O usa el script unificado:
   ```bash
   npm run start:all
   ```

### 3. Puerto ya en uso

**Síntoma:**
```
Error: listen EADDRINUSE: address already in use :::4004
```

**Solución para CAP (puerto 4004):**
```bash
# Windows
netstat -ano | findstr :4004
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:4004 | xargs kill -9
```

**Solución para MCP (puerto 3001):**
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3001 | xargs kill -9
```

### 4. Módulos no encontrados después de instalar

**Síntoma:**
```
Error: Cannot find module '@sap/cds'
```

**Solución:**
1. Limpiar node_modules y package-lock:
   ```bash
   rm -rf node_modules package-lock.json
   ```

2. Reinstalar:
   ```bash
   npm install
   ```

3. Verificar versiones instaladas:
   ```bash
   npm list @sap/cds @sap/cds-dk @cap-js/sqlite
   ```

### 5. Error de compilación TypeScript

**Síntoma:**
```
error TS2307: Cannot find module './cap-integration.js'
```

**Causa:** TypeScript busca archivo `.js` pero el source es `.ts`.

**Solución:**
Asegúrate de que los imports usen la extensión `.js` en el código TypeScript:
```typescript
import { CAPClient } from "./cap-integration.js";  // Correcto
```

TypeScript transpilará esto correctamente a ES modules.

### 6. Axios timeout o errores de red

**Síntoma:**
```
Error: timeout of 0ms exceeded
```

**Solución:**
1. Verifica que el servicio CAP esté corriendo:
   ```bash
   curl http://localhost:4004/odata/v4/catalog
   ```

2. Configura timeout más largo en `src/cap-integration.ts`:
   ```typescript
   this.client = axios.create({
     baseURL: `${baseUrl}/odata/v4/catalog`,
     timeout: 10000,  // 10 segundos
     headers: {
       'Content-Type': 'application/json',
       'Accept': 'application/json'
     }
   });
   ```

### 7. Base de datos bloqueada (SQLite)

**Síntoma:**
```
Error: SQLITE_BUSY: database is locked
```

**Causa:** Múltiples procesos intentando acceder a la base de datos.

**Solución:**
1. Detén todos los procesos CAP:
   ```bash
   # Windows
   taskkill /F /IM node.exe

   # Linux/Mac
   pkill -f "cds watch"
   ```

2. Elimina archivos de bloqueo:
   ```bash
   rm -f cap/db.sqlite-shm cap/db.sqlite-wal
   ```

3. Reinicia el servidor CAP.

### 8. MCP Session ID inválido

**Síntoma:**
```
Bad Request: No valid session ID provided
```

**Causa:** El cliente MCP no está enviando el header `mcp-session-id` correctamente.

**Solución:**
1. Verifica la configuración de Claude Desktop
2. Reinicia Claude Desktop después de cambiar la configuración
3. Verifica que el servidor MCP esté ejecutándose correctamente

### 9. Herramientas MCP no aparecen en Claude Desktop

**Síntoma:**
Las herramientas `cap_list_products`, `cap_create_order`, etc. no aparecen disponibles.

**Solución:**
1. Verifica la configuración en Claude Desktop:
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

2. Reinicia Claude Desktop completamente

3. Verifica que ambos servicios estén corriendo:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:4004/
   ```

4. Revisa los logs del servidor MCP para errores

### 10. Datos de ejemplo no se cargan

**Síntoma:**
Al consultar productos, la lista está vacía.

**Causa:** La lógica de inicialización en `catalog-service.js` no se ejecutó.

**Solución:**
1. Verifica que el archivo `srv/catalog-service.js` existe
2. Haz una petición GET para activar el hook `before READ`:
   ```bash
   curl http://localhost:4004/odata/v4/catalog/Products
   ```
3. Los productos de ejemplo deberían crearse automáticamente

## Logs y Debugging

### Habilitar logs detallados de CAP

```bash
# Modo debug
DEBUG=* npm run cap:start

# O específico de CAP
DEBUG=cds:* npm run cap:start
```

### Ver requests HTTP en MCP

El servidor MCP ya incluye logs detallados en la consola. Busca:
- 📨 Peticiones recibidas
- 🔑 Session IDs
- ❌ Errores de herramientas

### Usar MCP Inspector

```bash
npm run inspector
```

Abre la URL que se muestra en el navegador para debug interactivo.

## Verificación de Estado

### Script de health check

```bash
# Verificar CAP
curl http://localhost:4004/

# Verificar MCP
curl http://localhost:3001/health

# Verificar OData CAP
curl http://localhost:4004/odata/v4/catalog
```

### Respuesta esperada de /health (MCP):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-08T...",
  "uptime": 123.456,
  "notesCount": 2,
  "activeSessions": 1
}
```

## Contacto y Soporte

Si encuentras otros problemas:
1. Revisa los logs de ambos servidores
2. Verifica las versiones de las dependencias
3. Consulta la documentación oficial:
   - [SAP CAP Documentation](https://cap.cloud.sap/docs/)
   - [MCP Documentation](https://modelcontextprotocol.io/)
