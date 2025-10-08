# Fix: cds command not found 🔧

## Problema

Al iniciar el pod de CAP Service, falla con:
```
📦 Desplegando base de datos...
sh: cds: not found
```

## Causa

El comando `cds deploy --to sqlite` requiere el paquete `@sap/cds-dk`, pero este estaba en `devDependencies` y la imagen de producción solo instala `dependencies` regulares (`npm ci --omit=dev`).

## Solución

Mover `@sap/cds-dk` de `devDependencies` a `dependencies`.

### Cambio en cap-service/package.json

**Antes:**
```json
{
  "dependencies": {
    "@sap/cds": "^9.4.2",
    "@cap-js/sqlite": "^2.0.3",
    "express": "^4.1.0"
  },
  "devDependencies": {
    "@sap/cds-dk": "^9.3.2"
  }
}
```

**Después:**
```json
{
  "dependencies": {
    "@sap/cds": "^9.4.2",
    "@sap/cds-dk": "^9.3.2",
    "@cap-js/sqlite": "^2.0.3",
    "express": "^4.1.0"
  },
  "devDependencies": {
  }
}
```

## Aplicar el Fix

### 1. Eliminar deployment existente

```bash
kubectl delete deployment cap-service -n mcp-cap-integration
```

### 2. Build nueva imagen v1.0.2

```bash
cd cap-service
docker build -t docker.io/amartiinezg/cap-service:v1.0.2 .
docker push docker.io/amartiinezg/cap-service:v1.0.2
cd ..
```

**Nota:** La versión de la imagen ya está actualizada a `v1.0.2` en el deployment.

### 3. Deploy

```bash
kubectl apply -f k8s/cap-service/deployment.yaml
```

### 4. Verificar logs

```bash
kubectl logs -f -n mcp-cap-integration -l app=cap-service
```

**Ahora deberías ver:**
```
📦 Desplegando base de datos...

> cap-catalog-service@1.0.0 deploy
> cds deploy --to sqlite

/> successfully deployed to data/db.sqlite
🚀 Iniciando CAP service...

[cds] - loaded model from 3 file(s):
  db/schema.cds
  srv/catalog-service.cds
  node_modules/@sap/cds/srv/outbox.cds

[cds] - connect to db > sqlite { url: 'data/db.sqlite' }
[cds] - serving CatalogService { at: '/odata/v4/catalog' }
[cds] - server listening on { url: 'http://localhost:4004' }
```

### 5. Verificar que funciona

```bash
# Port-forward
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004

# En otra terminal
curl http://localhost:4004/odata/v4/catalog/Products
```

## Por qué este cambio es correcto

### Opción 1: @sap/cds-dk en dependencies ✅ (Implementado)

**Pros:**
- Comando `cds` disponible en runtime
- Permite `cds deploy` al iniciar el pod
- Simple y directo

**Contras:**
- Imagen ligeramente más grande (~30-50 MB adicionales)
- Incluye herramientas de desarrollo en producción

### Opción 2: Pre-deploy en imagen (Alternativa)

Si prefieres mantener `@sap/cds-dk` solo en dev:

**Dockerfile modificado:**
```dockerfile
# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci  # Instala TODO (incluyendo devDeps)
COPY db ./db
COPY srv ./srv
RUN npm run deploy  # Deploy aquí

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev  # Solo dependencies
COPY --from=builder /app/db ./db
COPY --from=builder /app/srv ./srv
RUN mkdir -p /app/data
COPY --from=builder /app/data/db.sqlite /app/data/db.sqlite  # Copiar DB pre-desplegada

CMD ["npm", "start"]  # No necesita cds deploy
```

**Pros:**
- Imagen de producción más pequeña
- No incluye herramientas de dev

**Contras:**
- Si el PVC está vacío, no puede re-desplegar
- Más complejo

## Recomendación

Para este caso de uso (desarrollo/demo con Kyma), **la Opción 1 es mejor** porque:
1. ✅ Permite auto-inicialización de DB si el PVC está vacío
2. ✅ Más simple de mantener
3. ✅ El overhead de tamaño es aceptable (~30-50 MB)

Para **producción real**, considera:
- Usar PostgreSQL o HANA (no SQLite)
- No necesitas `cds deploy` en runtime
- Usa migrations scripts en lugar de auto-deploy

## Verificación Final

```bash
# Pod debe estar Running
kubectl get pods -n mcp-cap-integration

# Logs deben mostrar servidor iniciado
kubectl logs -n mcp-cap-integration -l app=cap-service

# API debe responder
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
curl http://localhost:4004/odata/v4/catalog/Products

# Debe retornar JSON con productos
```

## Siguiente Paso

Una vez que CAP Service esté corriendo correctamente, deployar MCP Service:

```bash
kubectl apply -f k8s/mcp-service/deployment.yaml
kubectl apply -f k8s/mcp-service/service.yaml
kubectl apply -f k8s/mcp-service/apirule.yaml
```
