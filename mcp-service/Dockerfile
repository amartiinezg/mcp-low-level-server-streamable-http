# Dockerfile para MCP Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json tsconfig.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# ====================================
# Imagen de producción
# ====================================
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar código compilado desde builder
COPY --from=builder /app/build ./build

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3001
ENV CAP_SERVICE_URL=http://cap-service:4004

# Exponer puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio
CMD ["npm", "start"]
