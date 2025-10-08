# Estructura del Proyecto 📁

Este documento describe la estructura completa del proyecto separado en microservicios.

## 🌳 Árbol de Directorios

```
mcp-low-level-server-streamable-http/
│
├── 📦 cap-service/                    # Servicio CAP independiente
│   ├── db/
│   │   └── schema.cds                 # Modelo de datos (Products, Orders, etc.)
│   ├── srv/
│   │   ├── catalog-service.cds        # Definición del servicio OData
│   │   └── catalog-service.js         # Lógica de negocio
│   ├── Dockerfile                     # Build multi-stage para CAP
│   ├── .dockerignore
│   ├── package.json                   # Dependencias: @sap/cds, @cap-js/sqlite
│   └── README.md                      # Docs del servicio CAP
│
├── 🔗 mcp-service/                    # Servicio MCP independiente
│   ├── src/
│   │   ├── index.ts                   # Servidor MCP + Express + herramientas
│   │   └── cap-integration.ts         # Cliente HTTP para consumir CAP OData
│   ├── build/                         # TypeScript compilado (gitignored)
│   ├── Dockerfile                     # Build multi-stage para MCP
│   ├── .dockerignore
│   ├── tsconfig.json                  # Config TypeScript (ES2022, Node16)
│   ├── package.json                   # Dependencias: @modelcontextprotocol/sdk, axios
│   └── README.md                      # Docs del servicio MCP
│
├── ☸️ k8s/                            # Manifiestos Kubernetes para Kyma
│   ├── namespace.yaml                 # Namespace: mcp-cap-integration
│   ├── cap-service/
│   │   ├── deployment.yaml            # Deployment + PVC para SQLite
│   │   └── service.yaml               # ClusterIP Service (port 4004)
│   └── mcp-service/
│       ├── deployment.yaml            # Deployment con env CAP_SERVICE_URL
│       ├── service.yaml               # ClusterIP Service (port 3001)
│       └── apirule.yaml               # APIRule para exponer externamente
│
├── 📚 Documentación
│   ├── README.md                      # README principal (integración combinada)
│   ├── README-SEPARATED.md            # README para servicios separados ⭐
│   ├── README-CAP.md                  # Docs originales de integración
│   ├── DEPLOYMENT-KYMA.md             # Guía completa de deployment en Kyma ⭐
│   ├── QUICK-START.md                 # Inicio rápido (desarrollo local)
│   ├── TROUBLESHOOTING.md             # Solución de problemas comunes
│   ├── CLAUDE.md                      # Guía para Claude Code
│   └── PROJECT-STRUCTURE.md           # Este archivo
│
├── 🚀 Scripts
│   ├── deploy-kyma.sh                 # Script automatizado de deployment ⭐
│   └── start-all.js                   # Script para desarrollo local (ambos servicios)
│
├── 🔧 Archivos legacy (raíz)
│   ├── db/                            # Copiado a cap-service/
│   ├── srv/                           # Copiado a cap-service/
│   ├── src/                           # Copiado a mcp-service/
│   ├── build/                         # Build antiguo
│   ├── cap/                           # Base de datos antigua
│   ├── Dockerfile                     # Dockerfile monolítico antiguo
│   └── package.json                   # Package.json combinado antiguo
│
└── ⚙️ Configuración
    ├── .gitignore                     # node_modules, build, *.sqlite, etc.
    ├── .dockerignore                  # Para builds legacy
    ├── tsconfig.json                  # TypeScript config raíz
    └── package.cds                    # Config CAP legacy
```

## 📊 Comparación: Antes vs Después

### ❌ Arquitectura Anterior (Monolítica)

```
┌─────────────────────────────────┐
│     Single Container            │
│                                 │
│  ┌──────────┐  ┌──────────┐   │
│  │   MCP    │──│   CAP    │   │
│  │  (3001)  │  │  (4004)  │   │
│  └──────────┘  └──────────┘   │
│                                 │
│  - start-all.js inicia ambos   │
│  - Deployment único             │
│  - Escalado conjunto            │
└─────────────────────────────────┘
```

**Problemas:**
- No se puede escalar independientemente
- Deployment conjunto (mayor riesgo)
- Recursos compartidos
- Tecnologías mezcladas

### ✅ Arquitectura Nueva (Microservicios)

```
┌──────────────────┐      ┌──────────────────┐
│  MCP Service     │      │  CAP Service     │
│  (POD 1)         │      │  (POD 2)         │
│                  │      │                  │
│  Port: 3001      │──────│  Port: 4004      │
│  Image: mcp-svc  │ HTTP │  Image: cap-svc  │
│  Replicas: 1-N   │      │  Replicas: 1-N   │
│                  │      │                  │
│  - MCP Tools     │      │  - OData v4      │
│  - HTTP Trans.   │      │  - SQLite/HANA   │
│  - Session Mgmt  │      │  - Validations   │
└──────────────────┘      └──────────────────┘
        ↑
        │ APIRule (External)
        │
   Claude Desktop
```

**Beneficios:**
- ✅ Escalado independiente por servicio
- ✅ Deployment independiente (menos riesgo)
- ✅ Tecnologías optimizadas por servicio
- ✅ Resilencia mejorada
- ✅ Desarrollo paralelo por equipos

## 🔄 Flujo de Comunicación

### 1. Desarrollo Local

```
Claude Desktop
      │
      │ MCP Protocol (HTTP)
      ↓
MCP Service (localhost:3001)
      │
      │ HTTP REST
      ↓
CAP Service (localhost:4004)
      │
      ↓
  SQLite DB
```

### 2. Kubernetes/Kyma

```
Claude Desktop (External)
      │
      │ HTTPS (via Istio Gateway)
      ↓
APIRule (mcp-service.{cluster}.kyma.ondemand.com)
      │
      ↓
MCP Service (Service: mcp-service:3001)
      │
      │ HTTP (ClusterIP, internal DNS)
      ↓
CAP Service (Service: cap-service:4004)
      │
      ↓
PersistentVolume (SQLite) or External DB (PostgreSQL/HANA)
```

## 📦 Dependencias por Servicio

### CAP Service

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

**Tamaño imagen:** ~150-200 MB

### MCP Service

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.13.2",
    "axios": "^1.7.9",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.7",
    "typescript": "^5.9.3"
  }
}
```

**Tamaño imagen:** ~100-150 MB

## 🎯 Puntos de Entrada

### CAP Service
- **Comando:** `npm start` → `cds run --port 4004`
- **Entry Point:** Auto-generado por CDS
- **Endpoints principales:**
  - `GET /` - Metadata del servicio
  - `/odata/v4/catalog/*` - API OData

### MCP Service
- **Comando:** `npm start` → `node build/index.js`
- **Entry Point:** `build/index.js` (compilado desde `src/index.ts`)
- **Endpoints principales:**
  - `POST /mcp` - JSON-RPC MCP
  - `GET /mcp` - SSE streaming
  - `GET /health` - Health check

## 🔐 Variables de Entorno

### CAP Service
| Variable | Valor Dev | Valor K8s | Descripción |
|----------|-----------|-----------|-------------|
| `NODE_ENV` | development | production | Entorno |
| `PORT` | 4004 | 4004 | Puerto del servidor |

### MCP Service
| Variable | Valor Dev | Valor K8s | Descripción |
|----------|-----------|-----------|-------------|
| `NODE_ENV` | development | production | Entorno |
| `PORT` | 3001 | 3001 | Puerto del servidor |
| `CAP_SERVICE_URL` | http://localhost:4004 | http://cap-service:4004 | URL de CAP |

## 📝 Archivos de Configuración Clave

### TypeScript (MCP Service)
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src"
  }
}
```

### CAP Configuration
```json
// package.json - cds section
{
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
}
```

## 🚀 Comandos Útiles

### Desarrollo

```bash
# CAP Service
cd cap-service
npm install && npm run deploy && npm start

# MCP Service (en otra terminal)
cd mcp-service
npm install && npm run build && npm start
```

### Docker Local

```bash
# Build
docker build -t cap-service:local cap-service/
docker build -t mcp-service:local mcp-service/

# Run con network compartida
docker network create mcp-net
docker run -d --name cap --network mcp-net -p 4004:4004 cap-service:local
docker run -d --name mcp --network mcp-net -p 3001:3001 \
  -e CAP_SERVICE_URL=http://cap:4004 mcp-service:local
```

### Kubernetes

```bash
# Deploy todo
./deploy-kyma.sh myregistry v1.0.0

# Logs
kubectl logs -f -n mcp-cap-integration -l app=cap-service
kubectl logs -f -n mcp-cap-integration -l app=mcp-service

# Port-forward para testing
kubectl port-forward -n mcp-cap-integration svc/cap-service 4004:4004
kubectl port-forward -n mcp-cap-integration svc/mcp-service 3001:3001
```

## 📈 Recursos de Kubernetes

### CAP Service
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### MCP Service
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

## 🔍 Health Checks

### CAP Service
- **Liveness:** `GET /` (status 200)
- **Readiness:** `GET /` (status 200)
- **Startup:** 30s initial delay

### MCP Service
- **Liveness:** `GET /health` (status 200)
- **Readiness:** `GET /ready` (status 200)
- **Startup:** 30s initial delay

## 📖 Siguiente Lectura

- Para desarrollo local: [QUICK-START.md](./QUICK-START.md)
- Para deployment: [DEPLOYMENT-KYMA.md](./DEPLOYMENT-KYMA.md)
- Para servicios separados: [README-SEPARATED.md](./README-SEPARATED.md)
