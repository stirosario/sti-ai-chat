# Dockerfile para STI Chat v7
# Build: docker build -t sti-chat:latest .
# Run: docker run -p 3001:3001 --env-file .env sti-chat:latest

FROM node:20-alpine

# Metadata
LABEL maintainer="STI Rosario"
LABEL description="STI Chat v7 - Servicio Técnico Inteligente con OpenAI"

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (para cache de layers)
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && npm cache clean --force

# Copiar código de la aplicación
COPY . .

# Crear directorios necesarios
RUN mkdir -p data/transcripts data/tickets data/uploads data/logs

# Variables de entorno por defecto (sobrescribir con --env-file)
ENV NODE_ENV=production
ENV PORT=3001

# Exponer puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Comando de inicio
CMD ["node", "server.js"]
