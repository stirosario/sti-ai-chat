# 🔍 MODO VISIÓN INTELIGENTE - Guía Técnica

## 📋 Resumen Ejecutivo

**Estado:** ✅ **ACTIVADO Y FUNCIONAL**

Tecnos ahora tiene **visión artificial completa** mediante GPT-4 Vision API. Puede analizar, interpretar y responder basándose en imágenes que los usuarios envían.

---

## 🚫 REGLA ABSOLUTA

**TECNOS NUNCA DIRÁ "NO PUEDO VER IMÁGENES"**

Si un usuario envía una imagen, Tecnos:
1. ✅ La analiza automáticamente
2. ✅ Lee texto visible (OCR)
3. ✅ Detecta errores y problemas
4. ✅ Identifica dispositivos
5. ✅ Responde basándose en lo que VIO

---

## 🔧 Implementación Técnica

### Función Principal: `analyzeUserMessage()`

**Ubicación:** `server.js` línea ~150

**Comportamiento:**

```javascript
// SI HAY IMÁGENES → Modo Visión
if (imageUrls.length > 0) {
  // Usa GPT-4o con Vision API
  // Analiza TODAS las imágenes
  // Extrae: dispositivo, problema, texto, errores
  return { analyzed: true, hasVision: true, ...análisis }
}

// SI NO HAY IMÁGENES → Modo Texto
else {
  // Usa GPT-4o-mini para análisis de texto
  return { analyzed: true, hasVision: false, ...análisis }
}
```

### Datos Extraídos del Análisis Visual

```json
{
  "imagesAnalyzed": true,
  "hasVision": true,
  "visualContent": {
    "description": "Pantalla de Windows mostrando BSOD con código 0x000000D1",
    "textDetected": "DRIVER_IRQL_NOT_LESS_OR_EQUAL\ntcpip.sys\n0xFFFFF80002A3C4E8",
    "errorMessages": [
      "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
      "tcpip.sys"
    ],
    "technicalDetails": "Error relacionado con driver de red en modo kernel"
  },
  "device": {
    "detected": true,
    "type": "desktop",
    "brand": "Dell",
    "confidence": 0.92
  },
  "problem": {
    "detected": true,
    "summary": "pantalla azul por driver de red corrupto",
    "category": "software",
    "urgency": "high",
    "possibleCauses": [
      "Driver tcpip.sys corrupto o desactualizado",
      "Conflicto con software de seguridad",
      "Problema en adaptador de red"
    ]
  },
  "nextSteps": [
    "Reiniciar en Modo Seguro",
    "Actualizar driver de red",
    "Verificar Windows Update"
  ],
  "suggestedResponse": "Veo que tenés una pantalla azul..."
}
```

### Modelo y Configuración

```javascript
model: 'gpt-4o',  // GPT-4 con capacidad multimodal
temperature: 0.4,  // Baja temperatura = respuestas técnicas precisas
max_tokens: 1200,  // Suficiente para análisis detallado
detail: 'high'     // Máxima calidad de análisis visual
```

---

## 🎨 Capacidades Visuales

### 1. **OCR (Reconocimiento Óptico de Caracteres)**
- Lee texto en pantallas
- Extrae códigos de error
- Transcribe mensajes del sistema
- Identifica configuraciones

### 2. **Detección de Errores**
- Pantallas azules (BSOD)
- Mensajes de error de software
- Alertas del sistema
- Pop-ups de advertencia

### 3. **Identificación de Dispositivos**
- Tipo: notebook, desktop, monitor, etc.
- Marca: Dell, HP, Lenovo, etc.
- Modelo (si es visible)
- Estado físico

### 4. **Diagnóstico Visual**
- Problemas de hardware visibles
- Estado de LEDs indicadores
- Conexiones físicas
- Daños aparentes

### 5. **Análisis Contextual**
- Configuraciones del sistema
- Paneles de control
- Task Manager
- Reportes de diagnóstico

---

## 🔄 Flujo de Procesamiento

```
Usuario envía imagen
       ↓
Frontend → /api/chat con payload.images[]
       ↓
Backend guarda imagen en /uploads/
       ↓
savedImageUrls[] → URLs públicas de imágenes
       ↓
analyzeUserMessage(text, session, savedImageUrls)
       ↓
¿Hay URLs de imágenes?
       ↓
    SÍ → GPT-4o Vision API
         · Analiza TODAS las imágenes
         · Extrae información visual
         · Genera diagnóstico
       ↓
    NO → GPT-4o-mini (texto)
       ↓
generateSmartResponse(análisis, session)
       ↓
Respuesta basada en LO QUE VIO
       ↓
Usuario recibe diagnóstico visual
```

---

## 📊 Ejemplos de Uso Real

### Caso 1: Pantalla Azul

**Input:**
- Imagen: Screenshot de BSOD
- Texto: "ayuda!!!"

**Análisis Visual:**
- Error: `DRIVER_IRQL_NOT_LESS_OR_EQUAL`
- Driver: `tcpip.sys`
- Código: `0x000000D1`

**Respuesta:**
```
"Veo tu pantalla azul 🔍

Error detectado: DRIVER_IRQL_NOT_LESS_OR_EQUAL
Driver problemático: tcpip.sys (driver de red)

Esto indica un problema con el controlador de red de Windows.

Solución inmediata:
1. Reiniciá en Modo Seguro
2. Administrador de Dispositivos → Adaptadores de red
3. Desinstalá/Actualizá el driver de red

¿Te guío paso a paso?"
```

### Caso 2: Mensaje de Error de Software

**Input:**
- Imagen: Pop-up de error de Office
- Texto: "no puedo abrir word"

**Análisis Visual:**
- Software: Microsoft Word
- Error: "mso.dll not found"
- Versión: Office 2019

**Respuesta:**
```
"Veo el error de Word 📄

Detecté: 'mso.dll not found'

Este es un archivo crítico de Office que falta o está corrupto.

Soluciones:
1. Repará Office desde Panel de Control → Programas
2. Si no funciona, reinstalá Office
3. Verificá que no haya antivirus bloqueando

¿Probamos reparar primero?"
```

### Caso 3: Captura de Configuración

**Input:**
- Imagen: Panel de Sistema de Windows
- Texto: "está lenta mi pc"

**Análisis Visual:**
- RAM: 4GB (100% uso)
- CPU: Intel i3 6th Gen
- Disco: HDD 500GB (95% lleno)

**Respuesta:**
```
"Veo tu configuración 🖥️

Detecté 3 problemas:
1. RAM al 100% (solo 4GB) ⚠️
2. Disco casi lleno (95%) 📊
3. Procesador antiguo pero funcional

La lentitud se debe principalmente a:
- Falta de RAM (4GB es poco para Windows 10)
- Disco lleno ralentiza el sistema

Soluciones inmediatas:
1. Liberá espacio del disco (mínimo 20%)
2. Cerrá programas que no usás
3. Considerá expandir RAM a 8GB

¿Te ayudo a liberar espacio ahora?"
```

---

## ⚙️ Variables de Entorno

```bash
# Modo Visión está incluido en SMART_MODE
SMART_MODE=true

# API Key de OpenAI (OBLIGATORIA)
OPENAI_API_KEY=sk-...

# Modelo con visión (NO cambiar)
OPENAI_MODEL=gpt-4o

# URL base para imágenes
PUBLIC_BASE_URL=https://sti-rosario-ai.onrender.com
```

---

## 🐛 Troubleshooting

### Problema: "No puedo ver imágenes"

**Causa:** Las URLs de imágenes no se están pasando correctamente.

**Solución:**
```javascript
// Verificar en logs:
[IMAGE] File saved successfully: X bytes
[IMAGE] ✅ Guardada: filename -> URL

// Si no aparecen URLs:
console.log('[DEBUG] savedImageUrls:', savedImageUrls);
```

### Problema: Análisis incorrecto

**Causa:** Calidad de imagen baja o muy borrosa.

**Solución:**
- Usar `detail: 'high'` en image_url
- Pedir al usuario mejor calidad
- Comprimir menos las imágenes

### Problema: API Error 400

**Causa:** URL de imagen no accesible públicamente.

**Solución:**
- Verificar `PUBLIC_BASE_URL` en .env
- Asegurar carpeta `/uploads` servida estáticamente
- Verificar permisos de lectura

---

## 📈 Métricas y Logs

```
[VISION_MODE] 🔍 Modo visión activado - 1 imagen(es) detectada(s)
[VISION_MODE] 🖼️ Procesando imágenes con GPT-4 Vision...
[VISION_MODE] 📸 Agregada imagen al análisis: https://...
[VISION_MODE] ✅ Análisis visual completado: {
  imagesAnalyzed: true,
  device: 'notebook',
  problem: 'pantalla negra al encender',
  textDetected: 'SÍ'
}
[VISION_MODE] 🎨 Generando respuesta basada en análisis visual
```

---

## 🔒 Seguridad

### Imágenes Almacenadas

```javascript
// Nombre seguro con session + timestamp + random
filename = `${sid.substring(0, 20)}_${timestamp}_${random}.jpg`

// Ubicación
/data/uploads/web-abc123_1234567890_a1b2c3d4.jpg

// URL pública
https://sti-rosario-ai.onrender.com/uploads/web-abc123_...jpg
```

### Validaciones

✅ Tamaño máximo de imagen (configurado en multer)  
✅ Tipos de archivo permitidos (.jpg, .jpeg, .png, .webp)  
✅ Rate limiting por sesión  
✅ Sanitización de nombres de archivo  
✅ Token CSRF en cada request  

---

## 🚀 Performance

- **Análisis de 1 imagen:** ~3-5 segundos
- **Análisis de 3 imágenes:** ~8-12 segundos
- **Cache:** No implementado (cada análisis es único)
- **Compresión:** Automática con Sharp

**Optimización:**
- Usar `gpt-4o-mini` si no se necesita visión
- Limitar a 3 imágenes máximo por mensaje
- Comprimir imágenes antes de enviar (frontend)

---

## 📚 Documentación Oficial

- [OpenAI Vision API](https://platform.openai.com/docs/guides/vision)
- [GPT-4 Vision Examples](https://platform.openai.com/docs/guides/vision/quick-start)

---

## ✅ Checklist de Implementación

- [x] Función `analyzeUserMessage()` con modo visión
- [x] Procesamiento de URLs de imágenes
- [x] Análisis con GPT-4o Vision
- [x] Extracción de texto (OCR)
- [x] Detección de errores
- [x] Identificación de dispositivos
- [x] Generación de respuestas basadas en visión
- [x] Manejo de errores y fallbacks
- [x] Logs detallados
- [x] Documentación completa

---

**✨ Tecnos ahora puede VER y ENTENDER lo que los usuarios le muestran.**

**🎯 Resultado:** Diagnósticos más precisos, respuestas más útiles, mejor experiencia de usuario.

---

*Última actualización: 4 de Diciembre, 2025*  
*Versión: 2.0.0 (VISION)*
