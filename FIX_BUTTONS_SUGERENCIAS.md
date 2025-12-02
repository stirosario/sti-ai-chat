# Fix: Botones con Sugerencias de Problemas

## Problema
Los botones con sugerencias de problemas no se mostraban después de que el usuario ingresaba su nombre o seleccionaba "Prefiero no decirlo". Los botones deberían mostrar:
- Título del botón
- Descripción del tipo de problema
- Ejemplo de casos de uso

## Causa Raíz
El problema tenía dos causas:

### 1. Backend: `buildUiButtonsFromTokens()` no incluía campos necesarios
La función `buildUiButtonsFromTokens()` en `server.js` (línea 510) solo retornaba:
```javascript
{ token: String(t), label, text }
```

Faltaban los campos `description`, `example`, e `icon` que el frontend necesita para renderizar los botones completos.

### 2. Frontend: `normalizeButtons()` no procesaba objetos en `options`
La función `normalizeButtons()` en `public/index.php` (línea 870-873) solo manejaba strings en el array `options`:
```javascript
if (Array.isArray(payload.options) && payload.options.length) {
  payload.options.forEach(it => {
    if (typeof it === 'string') out.push({ label: it, value: it });
  });
}
```

No procesaba objetos con propiedades `description` y `example`.

## Solución Implementada

### 1. Backend: Actualización de `buildUiButtonsFromTokens()`
**Archivo:** `server.js` (línea 510-546)

Se modificó la función para incluir `description`, `example`, e `icon` para los botones BTN_PROBLEMA y BTN_CONSULTA:

```javascript
function buildUiButtonsFromTokens(tokens = [], locale = 'es-AR') {
  if (!Array.isArray(tokens)) return [];
  const norm = (locale || '').toLowerCase();
  const isEn = norm.startsWith('en');
  
  return tokens.map(t => {
    if (!t) return null;
    const def = getButtonDefinition(t);
    const deviceLabel = getDeviceButtonLabel(String(t), locale);
    const label = deviceLabel || def?.label || def?.text || (typeof t === 'string' ? t : String(t));
    const text = def?.text || label;
    
    const btn = { token: String(t), label, text };
    
    if (String(t) === 'BTN_PROBLEMA') {
      btn.description = isEn 
        ? 'If you have a technical issue with a device or system' 
        : 'Si tenés un inconveniente técnico con un dispositivo o sistema';
      btn.example = isEn 
        ? 'Example: "My laptop won\'t turn on", "Windows error", "No internet"' 
        : 'Ejemplo: "Mi notebook no enciende", "Windows da un error", "No tengo internet"';
      btn.icon = '🔧';
    } else if (String(t) === 'BTN_CONSULTA') {
      btn.description = isEn 
        ? 'If you need to learn how to configure or get guidance on technology tools' 
        : 'Si necesitás aprender a configurar o recibir orientación sobre el uso de herramientas tecnológicas';
      btn.example = isEn 
        ? 'Example: "Install Microsoft Office", "Help downloading AnyDesk", "Install WhatsApp"' 
        : 'Ejemplo: "Quiero instalar Microsoft Office", "Ayuda para descargar AnyDesk", "Instalar WhatsApp"';
      btn.icon = '💡';
    }
    
    return btn;
  }).filter(Boolean);
}
```

### 2. Frontend: Actualización de `normalizeButtons()`
**Archivo:** `public/index.php` (línea 869-884)

Se modificó para procesar objetos con propiedades adicionales:

```javascript
// legacy: array de strings en payload.options
if (Array.isArray(payload.options) && payload.options.length) {
  payload.options.forEach(it => {
    if (typeof it === 'string') {
      out.push({ label: it, value: it });
    } else if (it && (it.text || it.label)) {
      // Soportar objetos con text/label/description/example
      const label = it.text || it.label;
      const value = it.value || it.token || label;
      const icon = it.icon || '';
      const description = it.description || '';
      const example = it.example || '';
      out.push({ label, value, text: label, icon, description, example });
    }
  });
}
```

## Flujo de Datos Actualizado

1. Usuario completa GDPR y selección de idioma
2. Usuario ingresa nombre o selecciona "Prefiero no decirlo"
3. Backend llama `buildUiButtonsFromTokens(['BTN_PROBLEMA', 'BTN_CONSULTA'], locale)`
4. Backend retorna respuesta con `options` array:
```json
{
  "ok": true,
  "reply": "¿Qué necesitás hoy?",
  "stage": "ASK_NEED",
  "options": [
    {
      "token": "BTN_PROBLEMA",
      "label": "🔧 Solucionar / Diagnosticar Problema",
      "text": "tengo un problema",
      "description": "Si tenés un inconveniente técnico con un dispositivo o sistema",
      "example": "Ejemplo: \"Mi notebook no enciende\", \"Windows da un error\", \"No tengo internet\"",
      "icon": "🔧"
    },
    {
      "token": "BTN_CONSULTA",
      "label": "💡 Consulta / Asistencia Informática",
      "text": "tengo una consulta",
      "description": "Si necesitás aprender a configurar o recibir orientación sobre el uso de herramientas tecnológicas",
      "example": "Ejemplo: \"Quiero instalar Microsoft Office\", \"Ayuda para descargar AnyDesk\", \"Instalar WhatsApp\"",
      "icon": "💡"
    }
  ]
}
```
5. Frontend llama `normalizeButtons(data.ui || data.options || data.buttons)`
6. `normalizeButtons` procesa el array `options` y extrae todos los campos
7. `renderButtons()` crea elementos HTML con título, descripción y ejemplo

## Archivos Modificados
- `server.js`: Línea 510-546 (función `buildUiButtonsFromTokens`)
- `public/index.php`: Línea 869-884 (función `normalizeButtons`)

## Verificación
Para verificar que el fix funciona:

1. Abrir el chat en el sitio web
2. Aceptar términos GDPR
3. Seleccionar idioma (Español o English)
4. Ingresar nombre o seleccionar "Prefiero no decirlo"
5. Verificar que aparecen 2 botones con:
   - ✅ Ícono emoji (🔧 o 💡)
   - ✅ Título en negrita
   - ✅ Descripción del tipo de problema
   - ✅ Ejemplo de casos de uso en cursiva

## Notas de Deployment

### Para `public_html` (auto-deploy)
Los cambios en `public/index.php` se actualizan automáticamente en el host web.

### Para `sti-ai-chat` (manual deploy)
Ejecutar `update.bat` para deployar cambios del backend (`server.js`) a Render:
```batch
cd C:\sti-ai-chat
update.bat
```

El script automáticamente:
1. Hace backup del código
2. Commit de cambios
3. Push a GitHub
4. Render detecta y redeploya automáticamente

## Impacto
- ✅ Mejora la UX al mostrar descripciones claras de cada opción
- ✅ Reduce confusión del usuario sobre qué botón seleccionar
- ✅ Mantiene compatibilidad con flujos existentes
- ✅ Soporte para español e inglés

## Testing Realizado
- ✅ Verificado endpoint `/api/greeting` retorna botones GDPR
- ✅ Verificado flujo completo hasta ASK_NEED con botones de problema
- ✅ Verificado que `buildUiButtonsFromTokens` incluye todos los campos
- ✅ Verificado que `normalizeButtons` procesa correctamente los objetos
- ✅ Probado con "Prefiero no decirlo" y nombre válido
- ✅ Probado con 5+ intentos fallidos de nombre

## Autor
GitHub Copilot Agent + STI Development Team
Fecha: 2025-12-02
