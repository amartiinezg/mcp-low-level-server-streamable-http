#!/bin/bash

# Inicializar sesión y obtener session ID
echo "Inicializando sesión MCP..."
RESPONSE=$(curl -s -D - -X POST "https://mcp-service.c-7c1fc59.kyma.ondemand.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')

SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID obtenido: $SESSION_ID"
echo ""

if [ -z "$SESSION_ID" ]; then
  echo "Error: No se pudo obtener session ID"
  echo "Respuesta completa:"
  echo "$RESPONSE"
  exit 1
fi

# Llamar a la tool cap_list_products
echo "Llamando a cap_list_products..."
echo ""

curl -X POST "https://mcp-service.c-7c1fc59.kyma.ondemand.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "cap_list_products",
      "arguments": {
        "filterByLowStock": false
      }
    }
  }'

echo ""
