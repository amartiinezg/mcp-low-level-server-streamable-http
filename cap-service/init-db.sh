#!/bin/sh

# Script de inicialización de base de datos para CAP Service

echo "🔍 Verificando base de datos..."

# Crear directorio data si no existe
mkdir -p /app/data

# Si no existe la base de datos, desplegarla
if [ ! -f /app/data/db.sqlite ]; then
    echo "📦 Base de datos no encontrada. Desplegando schema..."
    npm run deploy
    echo "✅ Base de datos desplegada"
else
    echo "✅ Base de datos encontrada"
fi

echo "🚀 Iniciando CAP service..."
exec npm start
