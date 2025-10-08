# Fix: PersistentVolume Issue ✅

## Problema

El POD de CAP Service fallaba con el error:
```
error mounting "/var/lib/kubelet/.../db.sqlite" to rootfs at "/app/db.sqlite":
cannot mkdir: not a directory
```

**Causa:** Intentábamos montar el PVC directamente como un archivo (`db.sqlite`), pero PersistentVolumes solo pueden montarse como directorios.

## Solución Implementada

### 1. Cambio en Deployment (k8s/cap-service/deployment.yaml)

**Antes:**
```yaml
volumeMounts:
- name: data
  mountPath: /app/db.sqlite
  subPath: db.sqlite
```

**Después:**
```yaml
volumeMounts:
- name: data
  mountPath: /app/data
```

El volumen ahora se monta en `/app/data` (directorio) y el archivo SQLite estará en `/app/data/db.sqlite`.

### 2. Actualización de Configuración CAP (cap-service/package.json)

**Antes:**
```json
"cds": {
  "requires": {
    "db": {
      "kind": "sqlite",
      "credentials": {
        "url": "db.sqlite"
      }
    }
  }
}
```

**Después:**
```json
"cds": {
  "requires": {
    "db": {
      "kind": "sqlite",
      "credentials": {
        "url": "data/db.sqlite"
      }
    }
  }
}
```

### 3. Script de Inicialización (cap-service/init-db.sh)

Nuevo script que:
1. Crea el directorio `/app/data` si no existe
2. Verifica si la base de datos existe
3. Si no existe, ejecuta `npm run deploy` para crearla
4. Inicia el servidor CAP

```bash
#!/bin/sh
echo "🔍 Verificando base de datos..."
mkdir -p /app/data

if [ ! -f /app/data/db.sqlite ]; then
    echo "📦 Desplegando schema..."
    npm run deploy
fi

echo "🚀 Iniciando CAP service..."
exec npm start
```

### 4. Actualización del Dockerfile (cap-service/Dockerfile)

- Crea el directorio `/app/data`
- Copia el script `init-db.sh`
- Usa el script como CMD en lugar de `npm start` directamente

## Pasos para Aplicar el Fix

### Opción 1: Rebuild y Redeploy Completo

```bash
# 1. Eliminar deployment existente
kubectl delete deployment cap-service -n mcp-cap-integration
kubectl delete pvc cap-service-pvc -n mcp-cap-integration

# 2. Rebuild imagen con los cambios
cd cap-service
docker build -t docker.io/amartiinezg/cap-service:v1.0.1 .
docker push docker.io/amartiinezg/cap-service:v1.0.1

# 3. Actualizar imagen en deployment
# Editar k8s/cap-service/deployment.yaml y cambiar la versión a v1.0.1

# 4. Redesplegar
kubectl apply -f k8s/cap-service/deployment.yaml
kubectl apply -f k8s/cap-service/service.yaml

# 5. Verificar
kubectl get pods -n mcp-cap-integration -w
kubectl logs -f -n mcp-cap-integration -l app=cap-service
```

### Opción 2: Usar Script Automatizado

```bash
# El script ya tiene los cambios aplicados
./deploy-kyma.sh docker.io/amartiinezg v1.0.1
```

## Verificación

### 1. Verificar que el POD inicia correctamente

```bash
kubectl get pods -n mcp-cap-integration

# Debe mostrar:
# cap-service-xxxxx   2/2   Running   0   30s
```

### 2. Verificar logs del POD

```bash
kubectl logs -n mcp-cap-integration -l app=cap-service

# Debe mostrar:
# 🔍 Verificando base de datos...
# 📦 Desplegando schema... (solo la primera vez)
# ✅ Base de datos desplegada
# 🚀 Iniciando CAP service...
# [cds] - server listening on { url: 'http://localhost:4004' }
```

### 3. Verificar PVC está bound

```bash
kubectl get pvc -n mcp-cap-integration

# Debe mostrar:
# NAME               STATUS   VOLUME                                     CAPACITY   ACCESS MODES
# cap-service-pvc    Bound    pvc-xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx     1Gi        RWO
```

### 4. Verificar que la base de datos persiste

```bash
# Entrar al POD
kubectl exec -it -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=cap-service -o jsonpath='{.items[0].metadata.name}') \
  -- sh

# Dentro del POD:
ls -la /app/data/
# Debe mostrar: db.sqlite

# Verificar contenido
sqlite3 /app/data/db.sqlite ".tables"
# Debe mostrar las tablas: Products, Orders, OrderItems, Customers
```

### 5. Probar la API

```bash
# Port-forward
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004

# En otra terminal
curl http://localhost:4004/odata/v4/catalog/Products
```

## Persistencia de Datos

Con este fix:
- ✅ La base de datos SQLite se almacena en el PersistentVolume
- ✅ Los datos persisten entre reinicios del POD
- ✅ Si el POD se elimina y recrea, los datos se mantienen
- ✅ El directorio `/app/data` está montado en el volumen persistente

## Notas Adicionales

### Para Producción

En producción, considera migrar a PostgreSQL o HANA en lugar de SQLite:

1. **PostgreSQL:**
```json
"cds": {
  "requires": {
    "db": {
      "kind": "postgres",
      "credentials": {
        "host": "postgres-service",
        "port": 5432,
        "database": "cap_db",
        "user": "cap_user",
        "password": "${DB_PASSWORD}"
      }
    }
  }
}
```

2. **SAP HANA:**
```json
"cds": {
  "requires": {
    "db": {
      "kind": "hana",
      "credentials": {
        "host": "hana-service",
        "port": 30015,
        "user": "CAP_USER",
        "password": "${DB_PASSWORD}"
      }
    }
  }
}
```

### Backup de Datos SQLite

Para hacer backup del volumen:

```bash
# Crear backup
kubectl exec -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=cap-service -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'cd /app/data && tar czf - db.sqlite' > backup-$(date +%Y%m%d-%H%M%S).tar.gz

# Restaurar backup
kubectl exec -i -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=cap-service -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'cd /app/data && tar xzf -' < backup-20250108-153000.tar.gz
```

## Troubleshooting

### El POD sigue fallando

1. Verificar logs completos:
```bash
kubectl logs -n mcp-cap-integration -l app=cap-service --previous
```

2. Verificar eventos:
```bash
kubectl describe pod -n mcp-cap-integration -l app=cap-service
```

### PVC no se crea

Verificar que tu cluster tiene un StorageClass por defecto:
```bash
kubectl get storageclass

# Si no hay default, establecer uno:
kubectl patch storageclass {nombre} -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### Permisos de escritura

Si hay errores de permisos:
```bash
# Añadir securityContext en el deployment
securityContext:
  fsGroup: 1000
  runAsUser: 1000
```
