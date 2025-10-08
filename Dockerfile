# Etapa 1: Build
FROM node:20-alpine AS builder

# Establece el directorio de trabajo
WORKDIR /app

# Copia archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instala todas las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copia el código fuente
COPY . .

# Compila el proyecto TypeScript
RUN npm run build

# Etapa 2: Production
FROM node:20-alpine

# Establece el directorio de trabajo
WORKDIR /app

# Copia archivos de dependencias
COPY package*.json ./

# Instala solo dependencias de producción
RUN npm ci --omit=dev

# Copia el código compilado desde la etapa de build
COPY --from=builder /app/build ./build

# Expone el puerto configurado (default 3001)
EXPOSE 3001

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3001

# Ejecuta el servidor
CMD ["npm", "run start:all"]

# Healthcheck opcional
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (r) => {process.exit(r.statusCode === 404 ? 0 : 1)})"