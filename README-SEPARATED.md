# MCP + CAP - Servicios Separados para Kyma ☸️

Proyecto con arquitectura de microservicios separando el servidor MCP del servicio CAP OData, diseñado para deployment en SAP BTP Kyma Runtime.

## 🏗️ Arquitectura

Este proyecto está organizado como **dos servicios independientes** que se comunican entre sí:

```
mcp-low-level-server-streamable-http/
├── cap-service/              # Servicio CAP independiente
│   ├── db/                   # Modelo de datos CDS
│   ├── srv/                  # Servicios y lógica de negocio
│   ├── Dockerfile            # Imagen Docker para CAP
│   ├── package.json          # Dependencias CAP
│   └── README.md
│
├── mcp-service/              # Servicio MCP independiente
│   ├── src/                  # Código TypeScript MCP
│   ├── Dockerfile            # Imagen Docker para MCP
│   ├── tsconfig.json         # Config TypeScript
│   ├── package.json          # Dependencias MCP
│   └── README.md
│
├── k8s/                      # Manifiestos Kubernetes
│   ├── namespace.yaml
│   ├── cap-service/          # Deployment, Service, PVC
│   └── mcp-service/          # Deployment, Service, APIRule
│
├── DEPLOYMENT-KYMA.md        # Guía de deployment
└── deploy-kyma.sh            # Script automatizado
```

## 🚀 Características

### CAP Service
- **OData v4** - API REST estándar
- **Modelo de datos** - Products, Orders, OrderItems, Customers
- **Validaciones** - Stock, precios, estados
- **Base de datos** - SQLite (dev) / PostgreSQL/HANA (prod)
- **Puerto** - 4004

### MCP Service
- **HTTP Transport** - Streamable HTTP para MCP
- **3 Herramientas** - Integración con CAP OData
  - `cap_list_products` - Lista productos
  - `cap_create_order` - Crea órdenes
  - `cap_update_order_status` - Actualiza estados
- **Session Management** - Gestión de sesiones MCP
- **Puerto** - 3001

## 📦 Deployment Rápido

### Opción 1: Script Automatizado

```bash
# Deployment completo a Kyma
./deploy-kyma.sh [registry] [version]

# Ejemplo:
./deploy-kyma.sh docker.io/myuser v1.0.0
```

### Opción 2: Manual

```bash
# 1. Build imágenes
cd cap-service && docker build -t myregistry/cap-service:v1 .
cd ../mcp-service && docker build -t myregistry/mcp-service:v1 .

# 2. Push a registry
docker push myregistry/cap-service:v1
docker push myregistry/mcp-service:v1

# 3. Deploy a Kyma
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/cap-service/
kubectl apply -f k8s/mcp-service/

# 4. Verificar
kubectl get pods -n mcp-cap-integration
```

Ver [DEPLOYMENT-KYMA.md](./DEPLOYMENT-KYMA.md) para instrucciones detalladas.

## 🔧 Desarrollo Local

### CAP Service
```bash
cd cap-service
npm install
npm run deploy
npm start
# Servidor en http://localhost:4004
```

### MCP Service
```bash
cd mcp-service
npm install
npm run build
npm start
# Servidor en http://localhost:3001
```

### Variables de Entorno

**CAP Service:**
- `PORT=4004`
- `NODE_ENV=development`

**MCP Service:**
- `PORT=3001`
- `CAP_SERVICE_URL=http://localhost:4004` (local)
- `CAP_SERVICE_URL=http://cap-service:4004` (Kubernetes)

## 🌐 Comunicación entre Servicios

### En Desarrollo Local
MCP → `http://localhost:4004`

### En Kubernetes/Kyma
MCP → `http://cap-service:4004` (DNS interno del cluster)

La comunicación se realiza mediante:
- **Protocolo:** HTTP REST
- **Formato:** JSON
- **Service Discovery:** Kubernetes DNS

## 🔍 Testing

### Probar CAP Service
```bash
# Local
curl http://localhost:4004/odata/v4/catalog/Products

# Kubernetes (port-forward)
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
curl http://localhost:4004/odata/v4/catalog/Products
```

### Probar MCP Service
```bash
# Local
curl http://localhost:3001/health

# Kubernetes (port-forward)
kubectl port-forward -n mcp-cap-integration svc/mcp-service 3001:3001
curl http://localhost:3001/health
```

### Probar Integración
```bash
# Con MCP Inspector
cd mcp-service
npm run inspector
# Abre http://localhost:6000 en navegador
```

## 📝 Configuración Claude Desktop

**Desarrollo Local:**
```json
{
  "mcpServers": {
    "mcp-cap-local": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

**Kyma (Producción):**
```json
{
  "mcpServers": {
    "mcp-cap-kyma": {
      "type": "http",
      "url": "https://mcp-service.{cluster}.kyma.ondemand.com/mcp"
    }
  }
}
```

Obtener URL de Kyma:
```bash
kubectl get apirule mcp-service-api -n mcp-cap-integration -o jsonpath='{.spec.host}'
```

## 📚 Documentación

- **[cap-service/README.md](./cap-service/README.md)** - Documentación del servicio CAP
- **[mcp-service/README.md](./mcp-service/README.md)** - Documentación del servicio MCP
- **[DEPLOYMENT-KYMA.md](./DEPLOYMENT-KYMA.md)** - Guía completa de deployment
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Solución de problemas

## 🐳 Docker Images

### Build Local
```bash
# CAP
cd cap-service
docker build -t cap-service:local .

# MCP
cd mcp-service
docker build -t mcp-service:local .
```

### Test Local con Docker
```bash
# Network para comunicación
docker network create mcp-network

# CAP Service
docker run -d --name cap-service \
  --network mcp-network \
  -p 4004:4004 \
  cap-service:local

# MCP Service
docker run -d --name mcp-service \
  --network mcp-network \
  -p 3001:3001 \
  -e CAP_SERVICE_URL=http://cap-service:4004 \
  mcp-service:local
```

## 🔐 Seguridad

### Para Producción en Kyma

1. **Autenticación API:**
   - Configurar OAuth2 en APIRule
   - Usar JWT tokens

2. **Network Policies:**
   ```bash
   kubectl apply -f k8s/network-policies.yaml
   ```

3. **Secrets Management:**
   - Usar Kubernetes Secrets
   - SAP Credential Store

4. **HTTPS:**
   - Automático con Kyma APIRule
   - Certificados gestionados por Istio

## 📊 Monitoreo

```bash
# Logs en tiempo real
kubectl logs -f -n mcp-cap-integration -l app=cap-service
kubectl logs -f -n mcp-cap-integration -l app=mcp-service

# Métricas de PODs
kubectl top pods -n mcp-cap-integration

# Eventos
kubectl get events -n mcp-cap-integration --sort-by='.lastTimestamp'
```

## 🔄 Actualización de Servicios

```bash
# Build nueva versión
docker build -t myregistry/mcp-service:v1.1.0 mcp-service/
docker push myregistry/mcp-service:v1.1.0

# Rolling update
kubectl set image deployment/mcp-service \
  mcp-service=myregistry/mcp-service:v1.1.0 \
  -n mcp-cap-integration

# Verificar
kubectl rollout status deployment/mcp-service -n mcp-cap-integration
```

## 🧹 Cleanup

```bash
# Eliminar todo
kubectl delete namespace mcp-cap-integration

# O selectivamente
kubectl delete -f k8s/mcp-service/
kubectl delete -f k8s/cap-service/
```

## 🎯 Beneficios de la Arquitectura Separada

1. **Escalabilidad Independiente** - Escala MCP y CAP por separado
2. **Deployment Independiente** - Actualiza servicios sin afectar al otro
3. **Tecnologías Específicas** - Cada servicio con su stack óptimo
4. **Resilencia** - Fallo de un servicio no afecta al otro
5. **Desarrollo Paralelo** - Equipos pueden trabajar independientemente
6. **Optimización de Recursos** - Ajusta recursos por servicio

## ⚠️ Consideraciones

- **Latencia de Red:** Comunicación HTTP entre PODs
- **Service Discovery:** Usa nombres DNS de Kubernetes
- **Gestión de Estado:** CAP necesita PersistentVolume para SQLite
- **Base de Datos Compartida:** Considera PostgreSQL/HANA para producción
- **Observabilidad:** Implementar distributed tracing

## 📖 Próximos Pasos

1. [ ] Migrar de SQLite a PostgreSQL/HANA
2. [ ] Implementar autenticación OAuth2
3. [ ] Configurar Horizontal Pod Autoscaler
4. [ ] Añadir service mesh (Istio)
5. [ ] Implementar circuit breakers
6. [ ] Configurar backups automáticos
7. [ ] Métricas con Prometheus/Grafana
8. [ ] CI/CD con GitHub Actions / Jenkins
