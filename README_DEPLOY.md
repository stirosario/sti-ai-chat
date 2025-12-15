# Guía de Despliegue - STI / Tecnos

Esta guía describe el proceso de despliegue y configuración del servidor de Tecnos.

## Variables de Entorno Requeridas

### Obligatorias

- `OPENAI_API_KEY`: Clave API de OpenAI para respuestas técnicas (opcional pero recomendado)
- `ADMIN_TOKEN`: Token de autenticación para endpoints administrativos (obligatorio en producción)

### Opcionales

- `PORT`: Puerto del servidor (default: 3001)
- `NODE_ENV`: Entorno de ejecución (`production` o `development`, default: `development`)
- `LOG_LEVEL`: Nivel de logging de pino (`info`, `debug`, `warn`, `error`, default: `info`)
- `DATA_BASE`: Directorio base para datos (default: `/data`)
- `TRANSCRIPTS_DIR`: Directorio para transcripts (default: `${DATA_BASE}/transcripts`)
- `TICKETS_DIR`: Directorio para tickets (default: `${DATA_BASE}/tickets`)
- `LOGS_DIR`: Directorio para logs (default: `${DATA_BASE}/logs`)
- `UPLOADS_DIR`: Directorio para uploads (default: `${DATA_BASE}/uploads`)
- `PUBLIC_BASE_URL`: URL base pública (default: `https://stia.com.ar`)
- `WHATSAPP_NUMBER`: Número de WhatsApp para soporte (default: `5493417422422`)
- `OPENAI_MODEL`: Modelo de OpenAI a usar (default: `gpt-4o-mini`)

## Proceso de Despliegue

### 1. Preparación

```bash
# Clonar repositorio
git clone <repository-url>
cd sti-ai-chat

# Instalar dependencias
npm install
```

### 2. Configuración de Variables de Entorno

Crear archivo `.env` en el directorio raíz:

```env
NODE_ENV=production
PORT=3001
OPENAI_API_KEY=sk-...
ADMIN_TOKEN=tu_token_seguro_aqui
LOG_LEVEL=info
DATA_BASE=/data
PUBLIC_BASE_URL=https://stia.com.ar
```

### 3. Despliegue en Render

1. **Crear nuevo Web Service** en Render
2. **Configurar:**
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** `Node`
   - **Node Version:** `22.x` o superior

3. **Agregar Variables de Entorno:**
   - Ir a "Environment" en el dashboard
   - Agregar todas las variables requeridas (ver sección anterior)
   - **IMPORTANTE:** Nunca committear el archivo `.env` al repositorio

4. **Configurar Persistencia (Opcional):**
   - Si usas Render Disk, montarlo en `/data`
   - O configurar `DATA_BASE` para usar almacenamiento externo (S3, etc.)

### 4. Despliegue en GitHub Actions (Opcional)

Crear `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm install
      - run: npm test  # Si hay tests
      # Agregar paso de deployment aquí
```

## Estructura de Directorios

El servidor crea automáticamente estos directorios si no existen:

- `/data/transcripts/` - Sesiones y conversaciones
- `/data/tickets/` - Tickets de soporte
- `/data/logs/` - Logs del servidor
- `/data/uploads/` - Imágenes subidas por usuarios
- `/data/historial_chat/` - Historial en formato legible

## Endpoints Importantes

### Públicos

- `GET /api/greeting` - Iniciar nueva sesión (rate limit: 20/15min por IP)
- `POST /api/chat` - Enviar mensaje (rate limit: 50/5min por IP)
- `GET /api/health` - Health check del servidor

### Administrativos (requieren ADMIN_TOKEN en producción)

- `POST /api/simulations/run` - Ejecutar simulaciones (rate limit: 10/hora)
- `GET /api/historial/:sessionId` - Ver historial de sesión
- `GET /api/transcript-json/:sessionId` - Ver transcript en JSON

## Troubleshooting

### Problema: El servidor no inicia

**Solución:**
1. Verificar que todas las variables de entorno requeridas estén configuradas
2. Verificar permisos de escritura en `/data`
3. Revisar logs: `tail -f /data/logs/server.log`

### Problema: Error "ADMIN_TOKEN requerido"

**Solución:**
- Configurar `ADMIN_TOKEN` en variables de entorno
- En producción, este token es obligatorio para endpoints administrativos

### Problema: Las simulaciones no funcionan

**Solución:**
1. Verificar que `ADMIN_TOKEN` esté configurado
2. Verificar que el endpoint `/api/simulations/run` reciba el token en el header `Authorization: Bearer <token>`
3. Revisar logs para errores de autenticación

### Problema: Logs crecen demasiado

**Solución:**
- El sistema tiene rotación automática de logs (diaria, mantiene 7 días)
- Verificar que `/data/logs` tenga suficiente espacio

### Problema: Sesiones no se borran

**Solución:**
- Las sesiones se borran automáticamente después de 48 horas sin actividad
- La limpieza corre al startup y cada 24 horas
- Verificar logs: buscar `[SESSION_TTL]`

### Problema: Health check muestra "degraded"

**Causas comunes:**
- Memoria RSS > 1GB o heap > 512MB
- Espacio en disco < 10% libre
- Conectividad OpenAI falla (no crítico)

**Solución:**
- Revisar uso de recursos en el dashboard
- Considerar escalar el servicio si es necesario

## Simulaciones

### Guard Rails de Simulación

El sistema tiene guard rails que previenen que las simulaciones afecten producción:

- **Redis:** No escribe en producción (usa prefijo SIM_)
- **Tickets:** No crea tickets reales (solo logs)
- **WhatsApp:** No genera links reales (placeholder SIM_WHATSAPP)
- **Métricas:** No actualiza métricas reales

### Ejecutar Simulaciones

Desde `admin.php` (requiere autenticación):

```javascript
// Ejemplo de request
fetch('/api/simulations/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_TOKEN}`
  },
  body: JSON.stringify({
    count: 10,
    locale: 'es-AR',
    maxSteps: 50
  })
});
```

## Monitoreo

### Health Check

El endpoint `/api/health` proporciona:

- Estado del servidor (healthy/degraded)
- Uptime
- Uso de memoria
- Espacio en disco (si disponible)
- Estado de conectividad OpenAI (si configurado)

### Logs

- **server.log:** Logs principales del servidor
- **telemetry.log:** Telemetría y métricas (formato JSONL)
- **Rotación:** Diaria, mantiene últimos 7 días

### Rate Limits

- `/api/chat`: 50 requests/5min por IP
- `/api/greeting`: 20 sesiones/15min por IP
- `/api/simulations/run`: 10 simulaciones/hora por IP

## Seguridad

### En Producción

1. **ADMIN_TOKEN obligatorio:** Todos los endpoints administrativos requieren token
2. **CORS configurado:** Solo origines permitidos pueden hacer requests
3. **Rate limiting:** Previene abuso y DoS
4. **Validación de inputs:** Todos los inputs se validan y sanitizan
5. **No exponer secretos:** Nunca loguear tokens o API keys

### Consideraciones

- Nunca committear `.env` al repositorio
- Usar tokens seguros y únicos para `ADMIN_TOKEN`
- Rotar tokens periódicamente
- Monitorear logs de seguridad

## Soporte

Para problemas o preguntas, contactar al equipo de desarrollo.

---

**Última actualización:** 2025-01-XX
**Versión:** 2.0.0

