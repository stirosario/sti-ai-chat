# 🚀 CONFIGURACIÓN PARA PRODUCCIÓN - STI Chat v7

**Fecha**: 2025-12-07  
**Estado**: ✅ Listo para producción

---

## 📋 RESUMEN DE CONFIGURACIÓN

El bot está configurado para producción con las siguientes características:

### ✅ Características Implementadas

1. **Límite de 10 usuarios concurrentes**
   - Sistema de tracking de sesiones activas
   - Rechazo automático cuando se alcanza el límite
   - Limpieza automática de usuarios inactivos (30 minutos)

2. **Procesamiento directo de imágenes (sin cola)**
   - Las imágenes se procesan inmediatamente en el endpoint
   - Análisis con GPT-4 Vision de forma síncrona
   - Sin workers ni colas de procesamiento

3. **Funciones de IA avanzadas activadas**
   - `USE_INTELLIGENT_MODE=true` (activado por defecto)
   - `SMART_MODE=true` (activado por defecto)
   - Análisis inteligente de intención
   - Respuestas generadas con IA
   - Análisis visual de imágenes

4. **Flujo conversacional optimizado**
   - Prompts optimizados para conversación natural
   - Tono humano-humano (como hablar con un compañero)
   - Voseo argentino natural
   - Respuestas empáticas y conversacionales

---

## 🔧 CONFIGURACIÓN REQUERIDA

### Variables de Entorno Obligatorias

```bash
# Entorno
NODE_ENV=production
PORT=3001

# Seguridad (OBLIGATORIO)
LOG_TOKEN=GENERAR_TOKEN_SEGURO_AQUI

# OpenAI (OBLIGATORIO para IA)
OPENAI_API_KEY=sk-tu-api-key-aqui
OPENAI_MODEL=gpt-4o-mini

# CORS
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com

# Funciones de IA (activadas por defecto)
USE_INTELLIGENT_MODE=true
SMART_MODE=true

# WhatsApp
WHATSAPP_NUMBER=5493417422422

# URLs
PUBLIC_BASE_URL=https://tudominio.com
```

### Generar LOG_TOKEN Seguro

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 LÍMITES CONFIGURADOS

### Usuarios Concurrentes
- **Máximo**: 10 usuarios simultáneos
- **Timeout de inactividad**: 30 minutos
- **Limpieza automática**: Cada 5 minutos

### Rate Limiting
- **Chat**: 20 mensajes por sesión/minuto
- **IP**: 50 mensajes por IP/minuto
- **Greeting**: 5 inicios por IP/minuto
- **Uploads**: 3 imágenes por sesión/minuto

### Imágenes
- **Máximo por sesión**: 10 imágenes
- **Tamaño máximo**: 5MB por imagen
- **Procesamiento**: Directo (sin cola)

---

## 🧠 FUNCIONES DE IA ACTIVADAS

### Sistema Inteligente (`USE_INTELLIGENT_MODE`)
- ✅ Análisis de intención contextual
- ✅ Validación de acciones
- ✅ Respuestas dinámicas
- ✅ Prevención de saltos ilógicos

### Modo Super Inteligente (`SMART_MODE`)
- ✅ Análisis de mensajes con OpenAI
- ✅ Generación de respuestas naturales
- ✅ Análisis visual de imágenes (GPT-4 Vision)
- ✅ Detección de dispositivo y problema
- ✅ Análisis de sentimiento

### Optimizaciones de Conversación
- ✅ Prompts optimizados para tono natural
- ✅ Voseo argentino correcto
- ✅ Respuestas empáticas y conversacionales
- ✅ Evita sonar como bot o manual técnico

---

## 🔍 VERIFICACIÓN DE CONFIGURACIÓN

### Verificar Límite de Usuarios

El sistema automáticamente:
1. Rastrea usuarios activos en `activeUsers` Map
2. Rechaza nuevos usuarios cuando se alcanza el límite (10)
3. Limpia usuarios inactivos cada 5 minutos
4. Actualiza actividad en cada request de chat

### Verificar Procesamiento de Imágenes

Las imágenes se procesan:
- **Directamente** en el endpoint `/api/upload-image`
- **Sin cola** - procesamiento síncrono
- **Con análisis inmediato** usando GPT-4 Vision
- **Sin workers** - todo en el mismo proceso

### Verificar Funciones de IA

Las funciones están activadas si:
- `USE_INTELLIGENT_MODE !== 'false'` (activado por defecto)
- `SMART_MODE !== 'false'` (activado por defecto)
- `OPENAI_API_KEY` está configurado

---

## 📝 LOGS Y MONITOREO

### Logs Importantes

```
[CONCURRENT_USERS] ✅ New user accepted. Active: X/10
[CONCURRENT_USERS] ❌ Limit reached. Active: 10/10
[SMART_MODE] 🧠 Analizando mensaje con IA...
[SMART_MODE] ✅ Respuesta generada
[VISION_MODE] 🔍 Modo visión activado
```

### Métricas Disponibles

- Usuarios concurrentes activos
- Mensajes procesados
- Análisis de IA exitosos/fallidos
- Imágenes procesadas
- Tiempos de respuesta

---

## 🚨 TROUBLESHOOTING

### Usuario rechazado por límite

**Síntoma**: Error 503 con mensaje "Límite de 10 usuarios concurrentes alcanzado"

**Solución**: 
- Esperar a que un usuario se vuelva inactivo (30 min)
- O aumentar `MAX_CONCURRENT_USERS` en `constants.js` (requiere reinicio)

### Funciones de IA no funcionan

**Verificar**:
1. `OPENAI_API_KEY` está configurado
2. `USE_INTELLIGENT_MODE` no es `'false'`
3. `SMART_MODE` no es `'false'`
4. Revisar logs para errores de OpenAI

### Imágenes no se procesan

**Verificar**:
1. `UPLOADS_DIR` tiene permisos de escritura
2. Tamaño de imagen < 5MB
3. Formato permitido (jpg, png, gif, webp)
4. Límite de 10 imágenes por sesión no alcanzado

---

## 📚 ARCHIVOS MODIFICADOS

- `server.js` - Límite de usuarios, verificación en endpoints, prompts optimizados
- `constants.js` - Constantes de límites de producción
- `.env.production.example` - Template de configuración (si se creó)

---

## ✅ CHECKLIST DE DESPLIEGUE

- [ ] `LOG_TOKEN` generado y configurado
- [ ] `OPENAI_API_KEY` configurado
- [ ] `ALLOWED_ORIGINS` configurado correctamente
- [ ] `PUBLIC_BASE_URL` configurado
- [ ] Directorios de datos creados y con permisos
- [ ] `NODE_ENV=production` configurado
- [ ] Verificar que funciones de IA están activadas
- [ ] Probar límite de usuarios concurrentes
- [ ] Probar procesamiento de imágenes
- [ ] Verificar logs y métricas

---

**Última actualización**: 2025-12-07
