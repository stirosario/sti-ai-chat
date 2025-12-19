# Implementación: Barra de Progreso para Carga de Imágenes

## 🎯 Problema Resuelto

**Antes:** 
- Las imágenes no se subían al servidor
- No había feedback visual del estado de carga
- El límite de `express.json` era 2MB (muy pequeño para imágenes en base64)

**Ahora:**
- ✅ Límite aumentado a 10MB
- ✅ Barra de progreso visual debajo de cada imagen
- ✅ Estados claros: ⏳ Listo → 📤 Subiendo → ✅ Subida / ❌ Error
- ✅ Manejo de errores específicos (payload muy grande)

---

## 🔧 Cambios Implementados

### **1. Frontend (index.php)**

#### **Estructura de datos actualizada**
```javascript
selectedImages.push({
  file: file,
  dataUrl: event.target.result,
  name: file.name,
  uploadStatus: 'pending',  // pending, uploading, success, error
  uploadProgress: 0         // 0-100
});
```

#### **Barra de progreso visual**
Cada imagen ahora tiene una barra de estado debajo:

```javascript
// Estados:
⏳ Listo       → Gris (0%)
📤 Subiendo... → Naranja (30-60%)
✅ Subida      → Verde (100%)
❌ Error       → Rojo (100%)
```

**Código visual:**
- Barra de 80px x 20px con fondo negro
- Progreso animado con `transition: width 0.3s ease`
- Texto centrado sobre la barra
- Colores:
  - Naranja `#ffaa00` durante subida
  - Verde `#00ff88` cuando exitoso
  - Rojo `#ff4444` cuando falla

#### **Actualización de estado durante envío**
```javascript
// 1. Al comenzar fetch
selectedImages.forEach((img, idx) => {
  updateImageUploadStatus(idx, 'uploading', 30);
});

// 2. Durante fetch
selectedImages.forEach((img, idx) => {
  updateImageUploadStatus(idx, 'uploading', 60);
});

// 3. Respuesta exitosa
if (r.ok) {
  selectedImages.forEach((img, idx) => {
    updateImageUploadStatus(idx, 'success', 100);
  });
  await new Promise(resolve => setTimeout(resolve, 1500)); // Mostrar éxito 1.5s
}

// 4. Error
else {
  selectedImages.forEach((img, idx) => {
    updateImageUploadStatus(idx, 'error', 100);
  });
}
```

#### **Manejo de error 413 (Payload Too Large)**
```javascript
if (r.status === 413) {
  const errorData = await r.json().catch(() => ({}));
  removeTyping();
  addMsg(errorData.reply || '❌ Las imágenes son muy grandes...', 'bot');
  return; // No continuar
}
```

---

### **2. Backend (server.js)**

#### **Límite aumentado a 10MB**
```javascript
// ANTES: limit: '2mb'
// AHORA: limit: '10mb'

app.use(express.json({
  limit: '10mb', // Soporta ~7MB de imagen JPG en base64
  strict: true,
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));
```

**Por qué 10MB:**
- Imagen JPG de 5MB → ~6.7MB en base64 (33% más grande)
- Permite enviar 1-2 imágenes de alta calidad
- Protege contra payloads excesivos

#### **Error handler específico**
```javascript
// Middleware para capturar PayloadTooLargeError
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: 'payload_too_large',
      reply: '❌ Las imágenes son muy grandes. El tamaño total no puede superar 10MB.'
    });
  }
  next(err);
});
```

#### **Logging mejorado**
```javascript
// Detectar si hay imágenes en el payload
if (bodyWithoutImages.images && Array.isArray(bodyWithoutImages.images)) {
  console.log('[DEBUG /api/chat] 🖼️ Body tiene', bodyWithoutImages.images.length, 'imagen(es)');
  console.log('[DEBUG /api/chat] 🖼️ Primera imagen:', {
    name: bodyWithoutImages.images[0]?.name,
    hasData: !!bodyWithoutImages.images[0]?.data,
    dataLength: bodyWithoutImages.images[0]?.data?.length,
    dataPreview: bodyWithoutImages.images[0]?.data?.substring(0, 100)
  });
} else {
  console.log('[DEBUG /api/chat] ⚠️ NO hay imágenes en el body');
}
```

---

## 🖥️ UX/UI

### **Preview antes de enviar**
```
┌──────────────────────────────┐
│  [📷]  80x80  [✕]            │
│  ┌──────────────────┐        │
│  │ ⏳ Listo         │        │
│  └──────────────────┘        │
└──────────────────────────────┘
```

### **Durante subida**
```
┌──────────────────────────────┐
│  [📷]  80x80  [✕]            │
│  ┌──────────────────┐        │
│  │▓▓▓▓▓░░░░░░░░░░░░│ 60%    │
│  │  📤 Subiendo...  │        │
│  └──────────────────┘        │
└──────────────────────────────┘
```

### **Exitoso**
```
┌──────────────────────────────┐
│  [📷]  80x80  [✕]            │
│  ┌──────────────────┐        │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 100%   │
│  │   ✅ Subida      │ (verde)│
│  └──────────────────┘        │
└──────────────────────────────┘
```

---

## 🧪 Pruebas Recomendadas

1. **Imagen pequeña (< 500KB)**
   - Debe subir sin problemas
   - Barra verde "✅ Subida"

2. **Imagen mediana (1-3MB)**
   - Debe subir correctamente
   - Barra naranja → verde

3. **Imagen grande (> 7MB)**
   - Debe rechazar con error 413
   - Mensaje: "Las imágenes son muy grandes..."
   - Barra roja "❌ Error"

4. **Múltiples imágenes**
   - Cada una con su propia barra de progreso
   - Estados independientes

5. **Error de red**
   - Todas las barras rojas
   - Mensaje "problema de red"

---

## 📋 Próximos Pasos

1. **Reiniciar servidor Node.js** para aplicar cambios en límites
2. **Limpiar caché del navegador** (Ctrl + Shift + R)
3. **Probar subida de imagen**
4. **Verificar logs del servidor** para confirmar recepción
5. **Validar que OpenAI Vision API recibe las imágenes**

---

## 🐛 Debugging

### **Si la barra muestra "❌ Error":**

**En consola del navegador buscar:**
```
❌ Error al subir imágenes - Respuesta del servidor: 413
```

**En logs del servidor buscar:**
```
[DEBUG /api/chat] 🖼️ Body tiene X imagen(es)
[IMAGE_UPLOAD] Received X image(s) from session...
[IMAGE] Processing image 1/X...
[IMAGE] ✅ Guardada: filename -> URL
```

### **Si no aparecen logs de imágenes:**
```
[DEBUG /api/chat] ⚠️ NO hay imágenes en el body
```
→ El payload no incluye imágenes, revisar frontend

### **Si aparece error 413:**
```
[requestId] PayloadTooLargeError: request entity too large
```
→ Imágenes superan 10MB, reducir calidad o cantidad

---

## 📊 Comparación

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Límite body** | 2MB | 10MB |
| **Feedback visual** | ❌ Ninguno | ✅ Barra de progreso |
| **Estados** | N/A | ⏳📤✅❌ |
| **Error handling** | Genérico | Específico por código |
| **Logs** | Básicos | Detallados con metadata |

---

## ✅ Checklist de Implementación

- [x] Aumentar límite `express.json` a 10MB
- [x] Agregar middleware error handler 413
- [x] Actualizar estructura `selectedImages` con estados
- [x] Crear barra de progreso visual
- [x] Implementar `updateImageUploadStatus()`
- [x] Actualizar estado durante `sendMsg()`
- [x] Manejo específico error 413 en frontend
- [x] Logs detallados en backend
- [x] Marcar error en catch general
- [ ] Reiniciar servidor
- [ ] Probar subida real
- [ ] Verificar Vision API

---

**Documentado:** 3 de diciembre de 2025
**Autor:** GitHub Copilot (Claude Sonnet 4.5)
