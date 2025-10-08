# Dockerfile para CAP Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY db ./db
COPY srv ./srv

# Build CAP (si es necesario)
RUN npm run build || true

# Deploy inicial de la base de datos
RUN npm run deploy || true

# ====================================
# Imagen de producción
# ====================================
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar código desde builder
COPY --from=builder /app/db ./db
COPY --from=builder /app/srv ./srv
COPY --from=builder /app/db.sqlite ./db.sqlite

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=4004

# Exponer puerto
EXPOSE 4004

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4004/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio
CMD ["npm", "start"]
