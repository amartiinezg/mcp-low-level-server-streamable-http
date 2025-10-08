# Fix: @sap/xssec Module Not Found ✅

## Problema

El pod de CAP Service falla con:
```
Error: Cannot find '@sap/xssec'. Make sure to install it with 'npm i @sap/xssec'
[cds] - using auth strategy { kind: 'jwt' }
```

## Causa

Por defecto, CAP intenta usar autenticación JWT en producción, lo que requiere el paquete `@sap/xssec` para validar tokens de SAP BTP. Este paquete no está instalado y no es necesario para desarrollo/demo.

## Solución

Configurar CAP para usar autenticación "mocked" en lugar de JWT.

### Cambio en cap-service/package.json

**Agregar configuración de auth:**

```json
{
  "cds": {
    "requires": {
      "db": {
        "kind": "sqlite",
        "credentials": {
          "url": "data/db.sqlite"
        }
      },
      "auth": {
        "kind": "mocked"
      }
    }
  }
}
```

## Opciones de Autenticación en CAP

### 1. Mocked Auth ✅ (Recomendado para desarrollo)

```json
"auth": {
  "kind": "mocked"
}
```

**Características:**
- ✅ No requiere dependencias adicionales
- ✅ Ideal para desarrollo y demos
- ✅ Permite testing sin configurar OAuth
- ⚠️ No seguro para producción

### 2. JWT Auth (Producción con SAP BTP)

```json
"auth": {
  "kind": "jwt"
}
```

**Requiere:**
- Paquete `@sap/xssec` instalado
- XSUAA service binding de SAP BTP
- Variables de entorno con credenciales OAuth

### 3. Basic Auth

```json
"auth": {
  "kind": "basic"
}
```

**Características:**
- Autenticación HTTP Basic
- Simple pero menos seguro

### 4. Sin Auth

```json
"auth": false
```

**Características:**
- Completamente abierto
- Solo para desarrollo interno

## Aplicar el Fix

### 1. Eliminar deployment actual

```bash
export KUBECONFIG=.kubeconfig.yaml
kubectl delete deployment cap-service -n mcp-cap-integration
```

### 2. Build nueva versión v1.0.3

```bash
cd cap-service
docker build -t docker.io/amartiinezg/cap-service:v1.0.3 .
docker push docker.io/amartiinezg/cap-service:v1.0.3
cd ..
```

### 3. Actualizar deployment

Editar `k8s/cap-service/deployment.yaml`:
```yaml
image: docker.io/amartiinezg/cap-service:v1.0.3
```

### 4. Deploy

```bash
kubectl apply -f k8s/cap-service/deployment.yaml
```

### 5. Verificar logs

```bash
export KUBECONFIG=.kubeconfig.yaml
kubectl logs -f -n mcp-cap-integration -l app=cap-service
```

**Ahora deberías ver:**
```
📦 Desplegando base de datos...
/> successfully deployed to data/db.sqlite
🚀 Iniciando CAP service...
[cds] - loaded model from 3 file(s)
[cds] - connect to db > sqlite { url: 'data/db.sqlite' }
[cds] - using auth strategy { kind: 'mocked' }
[cds] - serving CatalogService { at: '/odata/v4/catalog' }
[cds] - server listening on { url: 'http://localhost:4004' }
```

**Clave:** Debe decir `kind: 'mocked'` en lugar de `kind: 'jwt'` ✅

## Para Producción Real

Si despliegas a SAP BTP con autenticación real:

### 1. Instalar @sap/xssec

```json
{
  "dependencies": {
    "@sap/xssec": "^3.6.0"
  }
}
```

### 2. Configurar XSUAA binding

```yaml
# k8s deployment
env:
- name: VCAP_SERVICES
  valueFrom:
    secretKeyRef:
      name: xsuaa-binding
      key: vcap_services
```

### 3. Usar JWT auth

```json
{
  "cds": {
    "requires": {
      "auth": {
        "kind": "jwt"
      }
    }
  }
}
```

## Verificación

### 1. Pod debe estar Running

```bash
kubectl get pods -n mcp-cap-integration
# STATUS debe ser: Running, READY: 2/2
```

### 2. Logs deben mostrar "mocked" auth

```bash
kubectl logs -n mcp-cap-integration -l app=cap-service | grep auth
# Debe mostrar: [cds] - using auth strategy { kind: 'mocked' }
```

### 3. API debe responder

```bash
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
curl http://localhost:4004/odata/v4/catalog/Products
```

## Resumen de Versiones

- **v1.0.0**: Versión inicial (fallaba por PVC mount)
- **v1.0.1**: Fix PVC mount (fallaba por cds not found)
- **v1.0.2**: @sap/cds-dk en dependencies (fallaba por @sap/xssec)
- **v1.0.3**: Auth mocked ✅ (debería funcionar)

## Siguiente Paso

Una vez que CAP Service esté corriendo:

```bash
# Deploy MCP Service
kubectl apply -f k8s/mcp-service/deployment.yaml
kubectl apply -f k8s/mcp-service/service.yaml
kubectl apply -f k8s/mcp-service/apirule.yaml

# Verificar
kubectl get pods -n mcp-cap-integration
kubectl logs -f -n mcp-cap-integration -l app=mcp-service
```
