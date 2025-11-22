# 📸 Funcionalidad de Subida de Imágenes - Chat STI

## ✅ Implementación Completa

Se ha implementado exitosamente la funcionalidad para que los usuarios puedan subir imágenes (fotos, capturas de pantalla) durante la conversación con el chatbot.

---

## 🎯 Características Implementadas

### 1. **Backend - Endpoint de Subida**
- **Ruta:** `POST /api/upload-image`
- **Biblioteca:** Multer para procesamiento de archivos multipart
- **Validaciones:**
  - ✅ Tamaño máximo: 5MB
  - ✅ Formatos permitidos: JPEG, PNG, GIF, WebP
  - ✅ Nombres únicos: `{sessionId}-{timestamp}-{random}.ext`
- **Almacenamiento:** `/data/uploads/` (configurable vía `UPLOADS_DIR`)
- **Servicio estático:** `/uploads/` para acceder a las imágenes

### 2. **Análisis con IA - OpenAI Vision**
Cuando se sube una imagen, GPT-4o-mini con capacidad de visión analiza:
- 🔍 Tipo de problema o dispositivo mostrado
- ⚠️ Mensajes de error visibles
- 📊 Información técnica relevante
- 💡 Recomendaciones inmediatas

**Respuesta JSON del análisis:**
```json
{
  "deviceType": "tipo de dispositivo",
  "problemDetected": "descripción del problema",
  "errorMessages": ["mensaje1", "mensaje2"],
  "technicalDetails": "detalles técnicos",
  "recommendations": "recomendaciones"
}
```

### 3. **Integración con Diagnóstico**
- Las imágenes se almacenan en `session.images[]`
- El análisis se incluye en el transcript
- El contexto de la imagen se usa para generar pasos más precisos
- Los pasos de diagnóstico consideran errores detectados en la imagen

### 4. **Frontend - Interfaz de Usuario**
**Nuevo archivo:** `public/index.html`

**Características:**
- 📎 Botón de adjuntar imagen junto al input de texto
- 🖼️ Preview de imagen antes de enviar
- 🗑️ Opción de remover imagen antes de enviar
- 🔍 Modal para ver imágenes en tamaño completo
- 📱 Responsive - funciona en móvil y desktop
- ⚡ Interfaz moderna con animaciones

---

## 🚀 Cómo Usar

### Usuario Final

1. **Iniciar conversación:**
   - Abrir http://localhost:3002 (o el dominio configurado)
   - El chatbot saludará automáticamente

2. **Subir imagen:**
   - Click en el botón 📎 junto al campo de texto
   - Seleccionar imagen (máx 5MB)
   - Ver preview de la imagen
   - Presionar "Enviar" para subir

3. **Análisis automático:**
   - El bot analizará la imagen con IA
   - Mostrará problemas detectados
   - Sugerirá pasos específicos basados en la imagen

4. **Continuar diagnóstico:**
   - El bot usará el contexto de la imagen
   - Los pasos serán más precisos
   - Las recomendaciones considerarán errores visibles

### Ejemplos de Uso

**Caso 1: Pantalla azul de Windows**
```
Usuario: Sube imagen de BSOD
Bot: ✅ Imagen recibida correctamente.

🔍 Análisis de la imagen:
Error de pantalla azul (BSOD) detectado

Errores detectados:
• CRITICAL_PROCESS_DIED
• Error 0x000000EF

Recomendación:
Este error suele estar relacionado con drivers o software incompatible...
```

**Caso 2: Mensaje de error de impresora**
```
Usuario: Sube foto del panel de error
Bot: ✅ Imagen recibida correctamente.

🔍 Análisis de la imagen:
Impresora HP mostrando error de atasco de papel

Recomendación:
1. Apagá la impresora
2. Abrí la tapa trasera...
```

---

## 🛠️ Configuración Técnica

### Variables de Entorno

```env
# Directorio de subidas (opcional)
UPLOADS_DIR=/data/uploads

# OpenAI (requerido para análisis de imágenes)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# URL pública (para links de imágenes)
PUBLIC_BASE_URL=https://sti-rosario-ai.onrender.com
```

### Estructura de Sesión

```javascript
session = {
  sessionId: "srv-123456",
  userName: "Juan",
  problem: "La impresora no funciona",
  images: [
    {
      url: "https://domain.com/uploads/srv-123-abc.jpg",
      filename: "srv-123-abc.jpg",
      originalName: "foto-impresora.jpg",
      size: 245680,
      uploadedAt: "2025-11-22T...",
      analysis: {
        deviceType: "Impresora HP",
        problemDetected: "Error de atasco de papel",
        errorMessages: ["Paper Jam", "E3"],
        technicalDetails: "Panel mostrando código E3",
        recommendations: "Revisar bandeja trasera"
      }
    }
  ],
  transcript: [
    { who: "user", text: "[Imagen subida]", imageUrl: "...", ts: "..." },
    { who: "bot", text: "✅ Imagen recibida...", ts: "..." }
  ]
}
```

### Transcript con Imágenes

Las imágenes se guardan en el transcript:
```javascript
{
  who: 'user',
  text: '[Imagen subida]',
  imageUrl: 'https://domain.com/uploads/imagen.jpg',
  ts: '2025-11-22T...'
}
```

---

## 📊 Flujo de Datos

```
Usuario selecciona imagen
    ↓
Preview en frontend
    ↓
Usuario presiona "Enviar"
    ↓
POST /api/upload-image
    ↓
Multer guarda en /data/uploads/
    ↓
OpenAI Vision analiza imagen
    ↓
Resultado guardado en session.images[]
    ↓
Bot responde con análisis
    ↓
Contexto usado en próximos pasos
```

---

## 🎨 Interfaz de Usuario

### Desktop
```
┌────────────────────────────────────────┐
│         💬 Chat STI                    │
│    Servicio Técnico Inteligente        │
├────────────────────────────────────────┤
│                                        │
│  [Bot] Hola! ¿En qué puedo ayudarte?  │
│                                        │
│        [Usuario] Mi impresora falló    │
│        📷 [imagen-preview]             │
│                                        │
│  [Bot] ✅ Imagen analizada...          │
│        🔍 Problema: Error E3           │
│                                        │
├────────────────────────────────────────┤
│  📎  [___Escribí tu mensaje___] Enviar │
└────────────────────────────────────────┘
```

### Móvil
- Diseño responsive
- Botones más grandes
- Preview optimizado
- Modal full-screen para imágenes

---

## 🔒 Seguridad

✅ **Validaciones implementadas:**
- Tamaño máximo: 5MB
- Solo formatos de imagen
- Nombres únicos (evita colisiones)
- Sesiones aisladas
- CSP configurado para imágenes

✅ **Protección contra:**
- Subida de archivos ejecutables
- Inyección de código
- Cross-site scripting (XSS)
- Acceso no autorizado a imágenes

---

## 📈 Mejoras Futuras (Opcionales)

1. **Múltiples imágenes por mensaje**
   - Permitir subir 2-3 imágenes a la vez
   - Comparar antes/después

2. **Compresión automática**
   - Reducir tamaño sin perder calidad
   - Optimizar almacenamiento

3. **OCR integrado**
   - Extraer texto de capturas de pantalla
   - Detectar códigos de error automáticamente

4. **Galería de imágenes**
   - Ver todas las imágenes de la sesión
   - Historial visual del problema

5. **Anotaciones**
   - Permitir dibujar sobre la imagen
   - Señalar áreas problemáticas

---

## 🐛 Troubleshooting

### Error: "Solo se permiten imágenes"
**Causa:** Formato de archivo no permitido
**Solución:** Usar JPEG, PNG, GIF o WebP

### Error: "La imagen es muy grande"
**Causa:** Archivo supera 5MB
**Solución:** Comprimir o tomar nueva foto con menor resolución

### Error: "No se pudo analizar la imagen"
**Causa:** OpenAI Vision no disponible
**Solución:** 
- Verificar `OPENAI_API_KEY`
- Verificar conexión a internet
- Revisar límites de API

### Imagen no se muestra
**Causa:** URL incorrecta o archivo eliminado
**Solución:**
- Verificar `PUBLIC_BASE_URL`
- Verificar que `/uploads` sea accesible
- Revisar permisos del directorio

---

## 📝 Testing

### Test Manual

1. **Subir imagen válida:**
   ```
   ✅ Se guarda en /data/uploads/
   ✅ Bot responde con análisis
   ✅ Imagen visible en chat
   ✅ Modal funciona
   ```

2. **Subir archivo muy grande:**
   ```
   ✅ Frontend muestra error
   ✅ No se envía al servidor
   ```

3. **Subir archivo no-imagen:**
   ```
   ✅ Multer rechaza
   ✅ Error mostrado al usuario
   ```

4. **Continuar conversación:**
   ```
   ✅ Contexto de imagen persiste
   ✅ Pasos consideran análisis
   ```

### Test Automatizado (Futuro)

```javascript
// Ejemplo con Jest + Supertest
test('Upload valid image', async () => {
  const response = await request(app)
    .post('/api/upload-image')
    .set('X-Session-Id', 'test-123')
    .attach('image', 'test-image.jpg')
    .expect(200);
  
  expect(response.body.ok).toBe(true);
  expect(response.body.imageUrl).toBeDefined();
  expect(response.body.analysis).toBeDefined();
});
```

---

## 📞 Contacto y Soporte

Para preguntas o issues:
- GitHub: stirosario/sti-ai-chat
- Email: soporte@stia.com.ar

---

## 📄 Changelog

### v1.1.0 - 2025-11-22
- ✅ Implementada subida de imágenes
- ✅ Integración con OpenAI Vision
- ✅ Frontend con preview y modal
- ✅ Contexto de imagen en diagnóstico
- ✅ Validaciones de seguridad
- ✅ Documentación completa

---

**¡La funcionalidad está lista para usar!** 🎉
