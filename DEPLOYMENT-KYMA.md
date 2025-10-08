# Deployment en Kyma ☸️

Guía completa para desplegar los servicios MCP y CAP en SAP BTP Kyma Runtime como PODs independientes.

## 📋 Tabla de Contenidos

1. [Arquitectura](#arquitectura)
2. [Prerequisitos](#prerequisitos)
3. [Build de Imágenes Docker](#build-de-imágenes-docker)
4. [Deployment en Kyma](#deployment-en-kyma)
5. [Verificación](#verificación)
6. [Configuración de Claude Desktop](#configuración-de-claude-desktop)
7. [Troubleshooting](#troubleshooting)

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│            SAP BTP Kyma Runtime                 │
│                                                 │
│  Namespace: mcp-cap-integration                 │
│                                                 │
│  ┌───────────────────┐  ┌──────────────────┐    │
│  │   MCP Service     │  │   CAP Service    │    │
│  │   (POD)           │  │   (POD)          │    │
│  │                   │  │                  │    │
│  │ Port: 3001        │──│ Port: 4004       │    │
│  │ Image: mcp-service│  │ Image: cap-svc   │    │
│  │                   │  │                  │    │
│  │ - MCP Tools       │  │ - OData v4       │    │
│  │ - HTTP Transport  │  │ - SQLite/HANA    │    │
│  └─────────┬─────────┘  └──────────────────┘    │
│            │                                    │
│            │ (Exposed via APIRule)              │
│            │                                    │
└────────────┼────────────────────────────────────┘
             │
             ↓
    ┌────────────────────┐
    │  Claude Desktop    │
    │  (External)        │
    └────────────────────┘
```

## Prerequisitos

### 1. SAP BTP Kyma Runtime
- Acceso a SAP BTP con Kyma Runtime habilitado
- `kubectl` configurado con tu cluster Kyma
- Permisos para crear namespaces y deployments

### 2. Herramientas Locales
```bash
# Verificar kubectl
kubectl version

# Verificar conexión a Kyma
kubectl get nodes

# Docker para build de imágenes
docker version
```

### 3. Container Registry
- Docker Hub, o
- SAP BTP Container Registry, o
- Otro registry accesible desde Kyma

## Build de Imágenes Docker

### Opción 1: Build Local y Push a Registry

#### CAP Service
```bash
cd cap-service

# Build
docker build -t {your-registry}/cap-service:v1.0.0 .

# Push
docker push {your-registry}/cap-service:v1.0.0
```

#### MCP Service
```bash
cd mcp-service

# Build
docker build -t {your-registry}/mcp-service:v1.0.0 .

# Push
docker push {your-registry}/mcp-service:v1.0.0
```

### Opción 2: Build con SAP BTP Container Registry

```bash
# Login a SAP BTP registry
docker login {your-registry-url}

# Tag con registry URL
docker tag cap-service {registry-url}/cap-service:v1.0.0
docker tag mcp-service {registry-url}/mcp-service:v1.0.0

# Push
docker push {registry-url}/cap-service:v1.0.0
docker push {registry-url}/mcp-service:v1.0.0
```

## Deployment en Kyma

### 1. Crear Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

Verifica:
```bash
kubectl get namespace mcp-cap-integration
```

### 2. Deploy CAP Service

**Actualizar imagen en `k8s/cap-service/deployment.yaml`:**
```yaml
image: {your-registry}/cap-service:v1.0.0
```

```bash
# Aplicar deployment
kubectl apply -f k8s/cap-service/deployment.yaml
kubectl apply -f k8s/cap-service/service.yaml

# Verificar
kubectl get pods -n mcp-cap-integration -l app=cap-service
kubectl logs -n mcp-cap-integration -l app=cap-service
```

Espera a que el POD esté `Running` y `Ready`:
```bash
kubectl wait --for=condition=ready pod \
  -l app=cap-service \
  -n mcp-cap-integration \
  --timeout=120s
```

### 3. Deploy MCP Service

**Actualizar imagen en `k8s/mcp-service/deployment.yaml`:**
```yaml
image: {your-registry}/mcp-service:v1.0.0
env:
- name: CAP_SERVICE_URL
  value: "http://cap-service:4004"
```

```bash
# Aplicar deployment
kubectl apply -f k8s/mcp-service/deployment.yaml
kubectl apply -f k8s/mcp-service/service.yaml
kubectl apply -f k8s/mcp-service/apirule.yaml

# Verificar
kubectl get pods -n mcp-cap-integration -l app=mcp-service
kubectl logs -n mcp-cap-integration -l app=mcp-service
```

### 4. Verificar APIRule

```bash
# Obtener URL externa
kubectl get apirule mcp-service-api -n mcp-cap-integration

# Output esperado:
# NAME              STATUS   HOST
# mcp-service-api   OK       mcp-service.{cluster-domain}
```

## Verificación

### 1. Verificar PODs
```bash
kubectl get pods -n mcp-cap-integration

# Ambos PODs deben estar Running y Ready 1/1
```

### 2. Verificar Services
```bash
kubectl get services -n mcp-cap-integration

# Debe mostrar:
# - cap-service (ClusterIP, port 4004)
# - mcp-service (ClusterIP, port 3001)
```

### 3. Probar Conectividad Interna

**Port-forward a CAP:**
```bash
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
```

En otra terminal:
```bash
curl http://localhost:4004/odata/v4/catalog/Products
```

**Port-forward a MCP:**
```bash
kubectl port-forward -n mcp-cap-integration svc/mcp-service 3001:3001
```

En otra terminal:
```bash
curl http://localhost:3001/health
```

### 4. Probar URL Externa

```bash
# Obtener URL externa
EXTERNAL_URL=$(kubectl get apirule mcp-service-api -n mcp-cap-integration -o jsonpath='{.spec.host}')

# Probar health endpoint
curl https://$EXTERNAL_URL/health
```

## Configuración de Claude Desktop

Una vez desplegado y verificado:

1. Obtén la URL externa:
```bash
kubectl get apirule mcp-service-api -n mcp-cap-integration -o jsonpath='{.spec.host}'
```

2. Configura Claude Desktop:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-cap-kyma": {
      "type": "http",
      "url": "https://mcp-service.{your-cluster}.kyma.ondemand.com/mcp"
    }
  }
}
```

3. Reinicia Claude Desktop completamente

4. Verifica que las herramientas estén disponibles:
   - `cap_list_products`
   - `cap_create_order`
   - `cap_update_order_status`

## Troubleshooting

### POD no inicia (ImagePullBackOff)

```bash
# Verificar eventos
kubectl describe pod -n mcp-cap-integration -l app=cap-service

# Posibles causas:
# - Imagen no existe en registry
# - Registry privado sin credenciales
# - Tag de imagen incorrecto
```

**Solución para registry privado:**
```bash
kubectl create secret docker-registry regcred \
  --docker-server={registry-url} \
  --docker-username={username} \
  --docker-password={password} \
  -n mcp-cap-integration

# Actualizar deployment para usar secret
```

### MCP no puede conectar con CAP

```bash
# Verificar logs de MCP
kubectl logs -n mcp-cap-integration -l app=mcp-service

# Buscar errores de conexión tipo:
# "Error obteniendo productos: connect ECONNREFUSED"
```

**Verificar comunicación:**
```bash
# Shell en POD de MCP
kubectl exec -it -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=mcp-service -o jsonpath='{.items[0].metadata.name}') \
  -- sh

# Dentro del POD:
wget -O- http://cap-service:4004/
```

### Base de datos SQLite se borra en restart

**Causa:** Sin PersistentVolume, los datos se pierden al reiniciar el POD.

**Solución:**
El PVC ya está configurado en `k8s/cap-service/deployment.yaml`. Verifica:
```bash
kubectl get pvc -n mcp-cap-integration
```

Si necesitas PostgreSQL/HANA en producción, actualiza la configuración CAP.

### APIRule no funciona

```bash
# Verificar estado
kubectl get apirule -n mcp-cap-integration

# Si STATUS no es "OK":
kubectl describe apirule mcp-service-api -n mcp-cap-integration

# Verificar Istio
kubectl get virtualservice -n mcp-cap-integration
```

### Health checks fallan

```bash
# Ver logs detallados
kubectl logs -n mcp-cap-integration -l app=mcp-service --tail=50

# Probar health endpoint directamente
kubectl exec -it -n mcp-cap-integration \
  $(kubectl get pod -n mcp-cap-integration -l app=mcp-service -o jsonpath='{.items[0].metadata.name}') \
  -- wget -O- http://localhost:3001/health
```

## Monitoreo y Logs

### Logs en tiempo real
```bash
# CAP Service
kubectl logs -f -n mcp-cap-integration -l app=cap-service

# MCP Service
kubectl logs -f -n mcp-cap-integration -l app=mcp-service
```

### Métricas (si Prometheus está instalado)
```bash
kubectl get servicemonitor -n mcp-cap-integration
```

## Actualización de Servicios

### Rolling Update
```bash
# Build nueva versión
docker build -t {registry}/mcp-service:v1.0.1 .
docker push {registry}/mcp-service:v1.0.1

# Actualizar deployment
kubectl set image deployment/mcp-service \
  mcp-service={registry}/mcp-service:v1.0.1 \
  -n mcp-cap-integration

# Verificar rollout
kubectl rollout status deployment/mcp-service -n mcp-cap-integration
```

### Rollback
```bash
kubectl rollout undo deployment/mcp-service -n mcp-cap-integration
```

## Cleanup

```bash
# Eliminar todos los recursos
kubectl delete namespace mcp-cap-integration

# O eliminar selectivamente
kubectl delete -f k8s/mcp-service/
kubectl delete -f k8s/cap-service/
kubectl delete -f k8s/namespace.yaml
```

## Notas de Producción

1. **Base de Datos:**
   - Usar PostgreSQL o HANA en lugar de SQLite
   - Configurar backups automáticos

2. **Seguridad:**
   - Habilitar autenticación en APIRule
   - Usar OAuth2/JWT tokens
   - Configurar Network Policies

3. **Escalabilidad:**
   - Ajustar `replicas` según carga
   - Configurar HorizontalPodAutoscaler

4. **Observabilidad:**
   - Integrar con Prometheus/Grafana
   - Configurar alertas
   - Logs centralizados

5. **Secrets:**
   - Usar Kubernetes Secrets para credenciales
   - Considerar SAP Credential Store
