# Setup local (sin BTP) — VPN Convista

Ejecuta el MCP server contra SAP OnPremise (`saps373.sap.convista.local`) sin pasar por BTP.

## Requisitos

- **Node.js 20+** (probado con 22)
- **VPN Convista activa** — debes resolver `saps373.sap.convista.local`
- Usuario SAP en mandante 101 con permisos OData (API_BUSINESS_PARTNER, etc.)

## Instalación

```bash
# 1. Descomprimir el zip
unzip mcp-low-level-server-streamable-http.zip
cd mcp-low-level-server-streamable-http

# 2. Instalar dependencias
cd mcp-service
npm install
npm run build
cd ..

cd cap-service
npm install
npm run deploy   # crea SQLite local
cd ..
```

## Configurar credenciales SAP

```bash
cd mcp-service
cp .env.example .env
```

Edita `.env` y rellena:

```bash
LOCAL_SAP_USER=tu_usuario_sap
LOCAL_SAP_PASSWORD=tu_password_sap
LOCAL_SAP_CLIENT=101
```

El resto (URL SAP, modo local, CA bundle) ya viene preconfigurado.

## Validar conectividad antes de arrancar

```bash
curl -u USER:PASS --cacert mcp-service/certs/convista-ca-bundle.pem \
  "https://saps373.sap.convista.local:44300/sap/opu/odata/sap/API_BUSINESS_PARTNER/\$metadata?sap-client=101"
```

- Devuelve XML → OK
- `Could not resolve host` → no hay VPN
- `401` → creds incorrectas
- Error de cert → ver sección "Cert no válido" más abajo

## Arrancar

Dos terminales, o usa dos `start &` en bash:

```bash
# Terminal 1 — CAP service (puerto 4004)
cd cap-service
npm run start:dev

# Terminal 2 — MCP service (puerto 3001)
cd mcp-service
npm start
```

Logs esperados en MCP:

```
🔐 [TLS] Extra CA bundle cargado: .../certs/convista-ca-bundle.pem
[Destination Service] LOCAL_SAP_DIRECT enabled - calling SAP directly, no BTP
[Destination Service] LOCAL_SAP_DIRECT mode - bypassing BTP
✅ [Startup] Business Partner API connectivity validated successfully
```

## Cliente MCP (Claude Desktop / Gemini CLI)

```json
{
  "mcpServers": {
    "mcp-cap-integration": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

## Cert no válido (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`)

El bundle `mcp-service/certs/convista-ca-bundle.pem` cubre la PKI Convista actual (CVROOTPKI02-CA + CVENTPKI02-CA + server cert de saps373). Si cambia o usas otro host SAP, regenera:

```bash
# Server + intermediate
echo | openssl s_client -showcerts -servername TU_HOST -connect TU_HOST:44300 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' \
  > mcp-service/certs/server-chain.pem

# Root desde Windows cert store (PowerShell, ajusta thumbprint si difiere)
$root = Get-Item -Path "Cert:\LocalMachine\Root\F57C272A2899EDC806B06D1337FB0310197A8D93"
$bytes = $root.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$b64 = [Convert]::ToBase64String($bytes, [Base64FormattingOptions]::InsertLineBreaks)
"-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n" | `
  Out-File -FilePath "mcp-service\certs\root-ca.pem" -Encoding ascii

# Combinar
cat mcp-service/certs/server-chain.pem mcp-service/certs/root-ca.pem \
  > mcp-service/certs/convista-ca-bundle.pem
```

Atajo dev (NO usar en prod): añade `NODE_TLS_REJECT_UNAUTHORIZED=0` al `.env`.

## Volver a BTP

Quita o comenta `LOCAL_SAP_DIRECT=true` en `.env` y rellena las `BTP_*` variables.
