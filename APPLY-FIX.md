# Pasos para Aplicar el Fix del PVC 🔧

## Resumen del Problema

El POD de CAP Service estaba fallando porque:
1. ❌ Intentaba montar PVC como archivo (`/app/db.sqlite`)
2. ❌ El script `init-db.sh` tenía problemas de ejecución

## Solución Aplicada

1. ✅ Montar PVC como directorio (`/app/data`)
2. ✅ Comando inline en Dockerfile en lugar de script externo
3. ✅ Auto-inicialización de DB si no existe

## Pasos a Seguir

### 1. Verificar Estado Actual

```bash
# Ver si hay pods corriendo
kubectl get pods -n mcp-cap-integration

# Si hay algún pod fallando, eliminarlo
kubectl delete deployment cap-service -n mcp-cap-integration
```

### 2. Build Nueva Imagen

```bash
# Navegar al directorio del servicio CAP
cd cap-service

# Build la imagen con la versión corregida
docker build -t docker.io/amartiinezg/cap-service:v1.0.1 .

# Push a Docker Hub
docker push docker.io/amartiinezg/cap-service:v1.0.1
```

**Nota:** La imagen ya está configurada en el deployment como `v1.0.1`.

### 3. Deploy a Kubernetes

```bash
# Volver al directorio raíz
cd ..

# Aplicar deployment
kubectl apply -f k8s/cap-service/deployment.yaml

# Verificar que se está creando
kubectl get pods -n mcp-cap-integration -w
```

### 4. Verificar Logs

```bash
# Ver logs del pod
kubectl logs -f -n mcp-cap-integration -l app=cap-service
```

**Deberías ver:**
```
📦 Desplegando base de datos...
/> successfully deployed to data/db.sqlite
🚀 Iniciando CAP service...
[cds] - server listening on { url: 'http://localhost:4004' }
```

### 5. Verificar PVC

```bash
# Ver que el PVC está bound
kubectl get pvc -n mcp-cap-integration

# Debería mostrar:
# NAME               STATUS   VOLUME     CAPACITY   ACCESS MODES
# cap-service-pvc    Bound    pvc-xxx    1Gi        RWO
```

### 6. Probar el Servicio

```bash
# Port-forward
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004

# En otra terminal, probar
curl http://localhost:4004/odata/v4/catalog/Products

# Debería devolver JSON con los productos
```

### 7. Verificar Persistencia de Datos

```bash
# Entrar al pod
kubectl exec -it -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=cap-service -o jsonpath='{.items[0].metadata.name}') \
  -- sh

# Dentro del pod:
ls -la /app/data/
# Debería mostrar: db.sqlite

# Salir
exit
```

## Troubleshooting

### Si el pod sigue en CrashLoopBackOff

```bash
# Ver logs detallados
kubectl logs -n mcp-cap-integration -l app=cap-service --previous

# Ver eventos del pod
kubectl describe pod -n mcp-cap-integration -l app=cap-service
```

### Si hay error "npm run deploy not found"

Esto significa que las devDependencies no están instaladas. Verificar que en el Dockerfile del builder se ejecuta `npm ci` (no `npm ci --omit=dev`).

### Si el PVC no se crea

```bash
# Ver StorageClass disponibles
kubectl get storageclass

# Ver si hay un default
kubectl get storageclass -o json | grep '"storageclass.kubernetes.io/is-default-class": "true"'

# Si no hay default, establecer uno:
kubectl patch storageclass {nombre} -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### Si hay problemas de permisos

Agregar al deployment:
```yaml
spec:
  securityContext:
    fsGroup: 1000
    runAsUser: 1000
```

## Cambios Realizados en el Código

### ✅ cap-service/Dockerfile

**Antes:**
```dockerfile
CMD ["/app/init-db.sh"]
```

**Después:**
```dockerfile
CMD sh -c 'mkdir -p /app/data && \
    if [ ! -f /app/data/db.sqlite ]; then \
        echo "📦 Desplegando base de datos..."; \
        npm run deploy; \
    fi && \
    echo "🚀 Iniciando CAP service..." && \
    npm start'
```

### ✅ cap-service/package.json

```json
"cds": {
  "requires": {
    "db": {
      "kind": "sqlite",
      "credentials": {
        "url": "data/db.sqlite"  // ← Cambio aquí
      }
    }
  }
}
```

### ✅ k8s/cap-service/deployment.yaml

```yaml
volumeMounts:
- name: data
  mountPath: /app/data  # ← Cambio aquí (era /app/db.sqlite)
```

## Siguiente Paso: Deploy MCP Service

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

## Resumen de Comandos Rápidos

```bash
# 1. Build y push
cd cap-service
docker build -t docker.io/amartiinezg/cap-service:v1.0.1 .
docker push docker.io/amartiinezg/cap-service:v1.0.1
cd ..

# 2. Deploy
kubectl apply -f k8s/cap-service/deployment.yaml

# 3. Watch
kubectl get pods -n mcp-cap-integration -w

# 4. Logs
kubectl logs -f -n mcp-cap-integration -l app=cap-service

# 5. Test
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
curl http://localhost:4004/odata/v4/catalog/Products
```

## Verificación Final

El deployment está OK cuando:
- ✅ POD está en estado `Running`
- ✅ Readiness probe pasa (2/2 containers ready)
- ✅ Logs muestran "server listening on..."
- ✅ PVC está en estado `Bound`
- ✅ API responde con datos
- ✅ Archivo `/app/data/db.sqlite` existe en el pod
