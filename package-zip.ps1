# package-zip.ps1 — Empaqueta el proyecto portable para distribuir.
# Excluye: node_modules, build, .env (con creds), .git, worktrees, sqlite, logs.
# Incluye: código fuente, certs/convista-ca-bundle.pem, .env.example, LOCAL-SETUP.md

param(
  [string]$Output = "mcp-low-level-server-streamable-http.zip"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$staging = Join-Path $env:TEMP "mcp-package-$(Get-Random)"

Write-Host "Staging en: $staging"
New-Item -ItemType Directory -Path $staging | Out-Null

# Copia con exclusiones
$excludeDirs = @("node_modules", "build", ".git", ".claude", "worktrees", "gen", "data")
$excludeFiles = @(".env", "*.sqlite", "*.log", ".kubeconfig.yaml")

robocopy $root $staging /E `
  /XD $excludeDirs `
  /XF $excludeFiles `
  /NFL /NDL /NJH /NJS /NC /NS | Out-Null

# Eliminar el script en sí del staging
Remove-Item (Join-Path $staging "package-zip.ps1") -Force -ErrorAction SilentlyContinue

# Verifica que viajan archivos clave
$mustExist = @(
  "mcp-service\.env.example",
  "mcp-service\certs\convista-ca-bundle.pem",
  "mcp-service\src\index.ts",
  "cap-service\package.json",
  "LOCAL-SETUP.md"
)
foreach ($f in $mustExist) {
  if (-not (Test-Path (Join-Path $staging $f))) {
    Write-Error "Falta archivo clave en staging: $f"
  }
}

# Avisa si .env se coló
if (Test-Path (Join-Path $staging "mcp-service\.env")) {
  Write-Error "PELIGRO: mcp-service\.env esta en el staging. Aborta."
}

# Comprime
$outPath = Join-Path $root $Output
if (Test-Path $outPath) { Remove-Item $outPath -Force }
Compress-Archive -Path "$staging\*" -DestinationPath $outPath -CompressionLevel Optimal

Remove-Item $staging -Recurse -Force

$size = (Get-Item $outPath).Length / 1MB
Write-Host ("ZIP creado: {0} ({1:N2} MB)" -f $outPath, $size)
Write-Host "Destinatario: descomprimir, seguir LOCAL-SETUP.md"
