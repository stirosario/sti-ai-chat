# 🚀 GUÍA DE IMPLEMENTACIÓN - Mejoras de Auditoría

## Paso 1: Instalar Dependencias Nuevas

```bash
npm install helmet@^7.1.0
```

## Paso 2: Verificar package.json

Asegúrate de que `package.json` contenga:

```json
{
  "dependencies": {
    "helmet": "^7.1.0"
  }
}
```

## Paso 3: Verificar Variables de Entorno

Crea/actualiza `.env` con:

```env
# Seguridad
ALLOWED_ORIGINS=https://stia.com.ar,https://www.stia.com.ar
SSE_TOKEN=tu_token_secreto_aqui_cambiar
NODE_ENV=production

# OpenAI
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_MODEL=gpt-4o-mini

# Configuración
PUBLIC_BASE_URL=https://sti-rosario-ai.onrender.com
WHATSAPP_NUMBER=5493417422422

# Directorios
DATA_BASE=./data
TRANSCRIPTS_DIR=./data/transcripts
TICKETS_DIR=./data/tickets
LOGS_DIR=./data/logs
UPLOADS_DIR=./data/uploads
```

## Paso 4: Crear Directorios Necesarios

```bash
mkdir -p data/transcripts data/tickets data/logs data/uploads
chmod 755 data/*
```

## Paso 5: Restart del Servidor

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Paso 6: Verificar Headers de Seguridad

Accede a tu sitio y verifica con las DevTools que los headers incluyan:

```
✅ Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
✅ X-Frame-Options: DENY
✅ X-Content-Type-Options: nosniff
✅ Content-Security-Policy: (completa)
✅ X-XSS-Protection: 1; mode=block
```

## Paso 7: Testing

### Test de Seguridad:

```bash
# Test de headers
curl -I https://tu-dominio.com

# Test de rate limiting
for i in {1..25}; do curl -X POST https://tu-dominio.com/api/chat; done

# Test de upload
curl -F "image=@test.jpg" https://tu-dominio.com/api/upload-image
```

### Test de Rendimiento:

```bash
# Con Apache Bench
ab -n 1000 -c 10 https://tu-dominio.com/api/health

# Con curl (timing)
curl -w "@curl-format.txt" -o /dev/null -s https://tu-dominio.com/
```

Archivo `curl-format.txt`:
```
time_namelookup:  %{time_namelookup}\n
time_connect:  %{time_connect}\n
time_starttransfer:  %{time_starttransfer}\n
time_total:  %{time_total}\n
```

## Paso 8: Monitoreo

### Logs en Tiempo Real:

```bash
# Ver logs del servidor
tail -f data/logs/server.log

# Ver reportes CSP
tail -f data/logs/csp-reports.log
```

### Endpoint de Health:

```bash
curl https://tu-dominio.com/api/health
```

Respuesta esperada:
```json
{
  "ok": true,
  "status": "online",
  "version": "v7",
  "timestamp": "2025-11-23T..."
}
```

### Endpoint de Métricas (con token):

```bash
curl -H "Authorization: Bearer tu_sse_token" \
  https://tu-dominio.com/api/metrics
```

## Paso 9: Checklist Post-Implementación

- [ ] ✅ Helmet instalado y configurado
- [ ] ✅ CSP headers presentes
- [ ] ✅ Rate limiting funcionando
- [ ] ✅ Validación de archivos mejorada
- [ ] ✅ Path traversal protegido
- [ ] ✅ Compresión gzip/brotli activa
- [ ] ✅ Session cache funcionando
- [ ] ✅ CORS restrictivo configurado
- [ ] ✅ Logs centralizados
- [ ] ✅ Health check respondiendo

## Paso 10: Optimizaciones Opcionales

### A. Configurar Redis (Recomendado para Producción)

```bash
npm install redis@^4.6.0
```

Actualizar `sessionStore.js`:
```javascript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

await redis.connect();

export async function getSession(sid) {
  const data = await redis.get(`session:${sid}`);
  return data ? JSON.parse(data) : null;
}

export async function saveSession(sid, data) {
  await redis.setEx(`session:${sid}`, 86400, JSON.stringify(data));
}
```

### B. Configurar CDN (Cloudflare)

1. Agregar dominio a Cloudflare
2. Activar "Always Use HTTPS"
3. Activar "Auto Minify" (JS, CSS, HTML)
4. Activar "Brotli" compression
5. Configurar Cache Rules:
   - Imágenes: 30 días
   - JS/CSS: 7 días
   - HTML: 2 horas

### C. Configurar Monitoring (New Relic)

```bash
npm install newrelic
```

Crear `newrelic.js`:
```javascript
exports.config = {
  app_name: ['STI AI Chat'],
  license_key: 'tu_license_key',
  logging: { level: 'info' },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization'
    ]
  }
};
```

## Troubleshooting

### Error: Cannot find module 'helmet'

```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: Permission denied en uploads

```bash
chmod 755 data/uploads
chown -R node:node data/
```

### Headers de seguridad no aparecen

Verificar que helmet esté antes de otros middlewares:

```javascript
app.use(helmet()); // PRIMERO
app.use(cors());   // DESPUÉS
```

### Rate limiting no funciona

Verificar que el servidor esté detrás de un proxy:

```javascript
app.set('trust proxy', 1);
```

---

## 📊 Métricas Esperadas Post-Implementación

| Métrica | Target |
|---------|--------|
| Tiempo de respuesta | < 150ms |
| Score Lighthouse | > 90 |
| Security Headers | A+ (securityheaders.com) |
| Uptime | > 99.5% |
| Error rate | < 0.1% |

---

## 🔄 Mantenimiento Continuo

### Semanal:
- Revisar logs de errores
- Verificar métricas de rendimiento
- Monitorear uso de recursos

### Mensual:
- Actualizar dependencias (`npm audit fix`)
- Revisar reportes CSP
- Analizar patrones de uso

### Trimestral:
- Auditoría de seguridad completa
- Pruebas de carga
- Revisión de código

---

## 📞 Soporte

¿Problemas con la implementación?

**Email**: soporte@stia.com.ar  
**GitHub Issues**: https://github.com/stirosario/sti-ai-chat/issues

---

**Última actualización**: 23/11/2025
