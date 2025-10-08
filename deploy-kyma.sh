#!/bin/bash

# Script de deployment automatizado para Kyma
# Uso: ./deploy-kyma.sh [REGISTRY] [VERSION]

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración
REGISTRY=${1:-"docker.io/amartiinezg"}
VERSION=${2:-"latest"}
NAMESPACE="mcp-cap-integration"

echo -e "${GREEN}🚀 Deployment MCP + CAP a Kyma${NC}"
echo -e "${YELLOW}Registry: ${REGISTRY}${NC}"
echo -e "${YELLOW}Version: ${VERSION}${NC}"
echo ""

# Verificar kubectl
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl no está instalado${NC}"
    exit 1
fi

# Verificar docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ docker no está instalado${NC}"
    exit 1
fi

# Verificar conexión a cluster
echo -e "${YELLOW}Verificando conexión a Kyma...${NC}"
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ No hay conexión al cluster Kyma${NC}"
    echo "Ejecuta: kubectl config use-context {your-kyma-context}"
    exit 1
fi
echo -e "${GREEN}✅ Conectado a cluster Kyma${NC}"
echo ""

# Build y push de imágenes
echo -e "${GREEN}📦 Building Docker images...${NC}"

# CAP Service
echo -e "${YELLOW}Building CAP Service...${NC}"
cd cap-service
docker build -t ${REGISTRY}/cap-service:${VERSION} .
docker push ${REGISTRY}/cap-service:${VERSION}
cd ..
echo -e "${GREEN}✅ CAP Service image pushed${NC}"

# MCP Service
echo -e "${YELLOW}Building MCP Service...${NC}"
cd mcp-service
docker build -t ${REGISTRY}/mcp-service:${VERSION} .
docker push ${REGISTRY}/mcp-service:${VERSION}
cd ..
echo -e "${GREEN}✅ MCP Service image pushed${NC}"
echo ""

# Crear namespace
echo -e "${GREEN}📋 Creando namespace...${NC}"
kubectl apply -f k8s/namespace.yaml
echo -e "${GREEN}✅ Namespace creado${NC}"
echo ""

# Actualizar imágenes en manifiestos (temporal)
echo -e "${YELLOW}Actualizando referencias de imágenes...${NC}"
sed "s|image: docker.io/amartiinezg/cap-service:latest|image: ${REGISTRY}/cap-service:${VERSION}|g" \
  k8s/cap-service/deployment.yaml > /tmp/cap-deployment.yaml
sed "s|image: docker.io/amartiinezg/mcp-service:latest|image: ${REGISTRY}/mcp-service:${VERSION}|g" \
  k8s/mcp-service/deployment.yaml > /tmp/mcp-deployment.yaml

# Deploy CAP Service
echo -e "${GREEN}🚀 Deploying CAP Service...${NC}"
kubectl apply -f /tmp/cap-deployment.yaml
kubectl apply -f k8s/cap-service/service.yaml

echo -e "${YELLOW}Esperando a que CAP Service esté listo...${NC}"
kubectl wait --for=condition=ready pod \
  -l app=cap-service \
  -n ${NAMESPACE} \
  --timeout=120s || {
    echo -e "${RED}❌ CAP Service no pudo iniciar${NC}"
    kubectl logs -n ${NAMESPACE} -l app=cap-service --tail=50
    exit 1
  }
echo -e "${GREEN}✅ CAP Service desplegado${NC}"
echo ""

# Deploy MCP Service
echo -e "${GREEN}🚀 Deploying MCP Service...${NC}"
kubectl apply -f /tmp/mcp-deployment.yaml
kubectl apply -f k8s/mcp-service/service.yaml
kubectl apply -f k8s/mcp-service/apirule.yaml

echo -e "${YELLOW}Esperando a que MCP Service esté listo...${NC}"
kubectl wait --for=condition=ready pod \
  -l app=mcp-service \
  -n ${NAMESPACE} \
  --timeout=120s || {
    echo -e "${RED}❌ MCP Service no pudo iniciar${NC}"
    kubectl logs -n ${NAMESPACE} -l app=mcp-service --tail=50
    exit 1
  }
echo -e "${GREEN}✅ MCP Service desplegado${NC}"
echo ""

# Cleanup archivos temporales
rm -f /tmp/cap-deployment.yaml /tmp/mcp-deployment.yaml

# Verificación
echo -e "${GREEN}🔍 Verificando deployment...${NC}"
echo ""

echo -e "${YELLOW}PODs:${NC}"
kubectl get pods -n ${NAMESPACE}
echo ""

echo -e "${YELLOW}Services:${NC}"
kubectl get services -n ${NAMESPACE}
echo ""

echo -e "${YELLOW}APIRule:${NC}"
kubectl get apirule -n ${NAMESPACE}
echo ""

# Obtener URL externa
EXTERNAL_URL=$(kubectl get apirule mcp-service-api -n ${NAMESPACE} -o jsonpath='{.spec.host}' 2>/dev/null || echo "pending")

echo -e "${GREEN}✅ Deployment completado!${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}URL Externa del MCP Service:${NC}"
echo -e "${YELLOW}https://${EXTERNAL_URL}${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Configuración para Claude Desktop:${NC}"
echo -e '{'
echo -e '  "mcpServers": {'
echo -e '    "mcp-cap-kyma": {'
echo -e '      "type": "http",'
echo -e "      \"url\": \"https://${EXTERNAL_URL}/mcp\""
echo -e '    }'
echo -e '  }'
echo -e '}'
echo ""
echo -e "${GREEN}Para ver logs:${NC}"
echo -e "kubectl logs -f -n ${NAMESPACE} -l app=mcp-service"
echo -e "kubectl logs -f -n ${NAMESPACE} -l app=cap-service"
