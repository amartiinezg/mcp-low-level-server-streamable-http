#!/bin/bash

# 🧪 Script de Testing OAuth 2.0 para MCP y CAP Services
# Este script prueba la autenticación OAuth 2.0 en ambos servicios

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración (editar según tu entorno)
IAS_TENANT="${IAS_TENANT:-your-tenant.accounts.ondemand.com}"
IAS_CLIENT_ID="${IAS_CLIENT_ID:-your-client-id}"
IAS_CLIENT_SECRET="${IAS_CLIENT_SECRET:-your-client-secret}"
MCP_URL="${MCP_URL:-http://localhost:3001}"
CAP_URL="${CAP_URL:-http://localhost:4004}"

echo -e "${BLUE}🔐 OAuth 2.0 Authentication Test${NC}"
echo -e "${BLUE}================================${NC}\n"

# Verificar si jq está instalado
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: jq is not installed. Please install jq to parse JSON.${NC}"
    exit 1
fi

# Función para imprimir paso
print_step() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

# Función para imprimir éxito
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Función para imprimir error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Función para imprimir warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Paso 1: Obtener Access Token de IAS
print_step "Step 1: Obtaining Access Token from SAP IAS"

TOKEN_RESPONSE=$(curl -s -X POST "https://${IAS_TENANT}/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${IAS_CLIENT_ID}" \
  -d "client_secret=${IAS_CLIENT_SECRET}" 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to get token from IAS"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
    print_error "No access token received from IAS"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

print_success "Access token obtained successfully"
echo "Token (first 50 chars): ${ACCESS_TOKEN:0:50}..."

# Decodificar y mostrar información del token
print_step "Step 2: Decoding JWT Token"

# Decodificar header
HEADER=$(echo "$ACCESS_TOKEN" | cut -d'.' -f1 | base64 -d 2>/dev/null | jq . 2>/dev/null || echo "{}")
echo "Header: $HEADER"

# Decodificar payload
PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq . 2>/dev/null || echo "{}")
echo "Payload: $PAYLOAD"

# Extraer información importante
ISSUER=$(echo "$PAYLOAD" | jq -r '.iss // "N/A"')
AUDIENCE=$(echo "$PAYLOAD" | jq -r '.aud // "N/A"')
EXPIRY=$(echo "$PAYLOAD" | jq -r '.exp // "N/A"')

echo ""
echo "Token Info:"
echo "  - Issuer (iss): $ISSUER"
echo "  - Audience (aud): $AUDIENCE"
echo "  - Expires at (exp): $EXPIRY"

# Paso 3: Test MCP Service Health (sin autenticación)
print_step "Step 3: Testing MCP Health Endpoint (no auth required)"

HEALTH_RESPONSE=$(curl -s -X GET "${MCP_URL}/health" 2>&1)

if [ $? -eq 0 ]; then
    print_success "MCP Health endpoint accessible"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    print_error "MCP Health endpoint failed"
    echo "$HEALTH_RESPONSE"
fi

# Paso 4: Test MCP Service con autenticación
print_step "Step 4: Testing MCP Endpoint WITH Authentication"

MCP_RESPONSE=$(curl -s -X POST "${MCP_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }' 2>&1)

if echo "$MCP_RESPONSE" | grep -q "result"; then
    print_success "MCP authentication successful"
    echo "$MCP_RESPONSE" | grep -o '"result":{[^}]*}' || echo "$MCP_RESPONSE"
else
    print_error "MCP authentication failed"
    echo "$MCP_RESPONSE"
fi

# Paso 5: Test MCP Service SIN autenticación (debería fallar si IAS_ENABLED=true)
print_step "Step 5: Testing MCP Endpoint WITHOUT Authentication"

MCP_NOAUTH_RESPONSE=$(curl -s -X POST "${MCP_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }' 2>&1)

if echo "$MCP_NOAUTH_RESPONSE" | grep -q "Unauthorized"; then
    print_success "MCP correctly rejects requests without authentication"
    echo "Response: Unauthorized (as expected)"
elif echo "$MCP_NOAUTH_RESPONSE" | grep -q "result"; then
    print_warning "MCP accepts requests without authentication (IAS_ENABLED=false?)"
    echo "Response: Success (auth disabled or not required)"
else
    print_error "Unexpected response from MCP"
    echo "$MCP_NOAUTH_RESPONSE"
fi

# Paso 6: Test CAP Service con autenticación
print_step "Step 6: Testing CAP Service WITH Authentication"

CAP_RESPONSE=$(curl -s -X GET "${CAP_URL}/odata/v4/catalog/Products" \
  -H "Authorization: Bearer $ACCESS_TOKEN" 2>&1)

if echo "$CAP_RESPONSE" | grep -q "@odata.context"; then
    print_success "CAP authentication successful"
    PRODUCT_COUNT=$(echo "$CAP_RESPONSE" | jq '.value | length' 2>/dev/null || echo "N/A")
    echo "Products found: $PRODUCT_COUNT"
    echo "$CAP_RESPONSE" | jq '.value[0]' 2>/dev/null || echo "First product: N/A"
else
    print_error "CAP authentication failed"
    echo "$CAP_RESPONSE"
fi

# Paso 7: Test CAP Service SIN autenticación
print_step "Step 7: Testing CAP Service WITHOUT Authentication"

CAP_NOAUTH_RESPONSE=$(curl -s -X GET "${CAP_URL}/odata/v4/catalog/Products" 2>&1)

if echo "$CAP_NOAUTH_RESPONSE" | grep -q "error"; then
    print_success "CAP correctly rejects requests without authentication"
    echo "Response: Unauthorized (as expected)"
elif echo "$CAP_NOAUTH_RESPONSE" | grep -q "@odata.context"; then
    print_warning "CAP accepts requests without authentication (IAS_ENABLED=false?)"
    echo "Response: Success (auth disabled or not required)"
else
    print_error "Unexpected response from CAP"
    echo "$CAP_NOAUTH_RESPONSE"
fi

# Resumen final
print_step "Test Summary"

echo ""
echo "Configuration:"
echo "  - IAS Tenant: https://${IAS_TENANT}"
echo "  - MCP Service: ${MCP_URL}"
echo "  - CAP Service: ${CAP_URL}"
echo ""
echo "Results:"
echo "  ✅ Token obtained successfully"
echo "  ✅ MCP health endpoint accessible"
if echo "$MCP_RESPONSE" | grep -q "result"; then
    echo "  ✅ MCP authenticated request successful"
else
    echo "  ❌ MCP authenticated request failed"
fi
if echo "$CAP_RESPONSE" | grep -q "@odata.context"; then
    echo "  ✅ CAP authenticated request successful"
else
    echo "  ❌ CAP authenticated request failed"
fi

echo ""
echo -e "${BLUE}🎉 Testing completed!${NC}"
