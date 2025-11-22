# ChatSTI PWA - Guía de Implementación Completa

## 📱 ¿Qué es una PWA?

Una Progressive Web App (PWA) es una aplicación web que puede instalarse como una app nativa en dispositivos móviles y de escritorio, funcionando offline y con actualizaciones automáticas.

---

## ✅ Archivos Creados

### 1. Core PWA Files (c:\sti-ai-chat\public\)
- ✅ `manifest.json` - Configuración de la app (nombre, íconos, tema)
- ✅ `sw.js` - Service Worker (cache, offline, actualizaciones)
- ✅ `pwa-install.js` - Manejador de instalación e interacción
- ✅ `offline.html` - Página mostrada cuando no hay conexión
- ✅ `browserconfig.xml` - Configuración para Windows

### 2. Scripts de Generación
- ✅ `generate-icons.js` - Script Node.js para generar íconos
- ✅ `GENERAR_ICONOS.md` - Guía detallada de generación de íconos

### 3. Integración
- ✅ `PWA_INTEGRATION.html` - Código HTML para agregar al index.php
- ✅ `server.js` actualizado - Sirve archivos estáticos de PWA

---

## 🚀 Pasos de Instalación

### Paso 1: Generar Íconos

**Opción A: Online (Más fácil)**
1. Ir a https://realfavicongenerator.net/
2. Subir logo de STI (mínimo 512x512)
3. Configurar colores: `#0a1f44`
4. Descargar y extraer en `c:\sti-ai-chat\public\icons\`

**Opción B: Script Node.js**
```bash
cd c:\sti-ai-chat
npm install sharp
node generate-icons.js
```

**Verificar que existan:**
```
public/
  icons/
    ✓ icon-72x72.png
    ✓ icon-96x96.png
    ✓ icon-128x128.png
    ✓ icon-144x144.png
    ✓ icon-152x152.png
    ✓ icon-192x192.png
    ✓ icon-384x384.png
    ✓ icon-512x512.png
```

### Paso 2: Integrar en index.php

Abrir el archivo index.php y agregar en el `<head>`:

```html
<!-- PWA Manifest -->
<link rel="manifest" href="/manifest.json">

<!-- Apple Touch Icons -->
<link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png">

<!-- iOS Meta Tags -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ChatSTI">

<!-- Android/Chrome -->
<meta name="mobile-web-app-capable" content="yes">
```

Antes del cierre de `</body>`:

```html
<!-- PWA Installation Handler -->
<script src="/pwa-install.js" defer></script>

<!-- Botón de instalación (opcional) -->
<button id="pwa-install-btn" style="display:none;">
  📱 Instalar App
</button>
```

Ver detalles completos en: `PWA_INTEGRATION.html`

### Paso 3: Reiniciar Servidor

```bash
cd c:\sti-ai-chat
node server.js
```

O si está corriendo:
```bash
# Ctrl+C para detener
node server.js
```

### Paso 4: Verificar

1. Abrir Chrome: `http://localhost:3001`
2. Abrir DevTools (F12) → Application → Manifest
3. Verificar que aparece "ChatSTI - Servicio Técnico Inteligente"
4. En Service Workers: Verificar que sw.js está registrado

---

## 📱 Testing en Dispositivos

### Android (Chrome)
1. Abrir: `https://sti-rosario-ai.onrender.com`
2. Esperar banner "Agregar a pantalla de inicio"
3. O usar menú: ⋮ → "Instalar app"
4. Verificar ícono en home screen

### iOS (Safari)
1. Abrir: `https://sti-rosario-ai.onrender.com`
2. Tocar botón compartir (⎙)
3. Desplazar y tocar "Agregar a pantalla de inicio"
4. Verificar ícono en home screen

### Desktop (Chrome/Edge)
1. Abrir: `https://sti-rosario-ai.onrender.com`
2. Ver ícono de instalación en barra de URL (➕)
3. Clic en "Instalar"
4. App se abre en ventana standalone

---

## 🔧 Características Implementadas

### ✅ Instalación
- Detección automática de soporte PWA
- Prompt de instalación personalizado
- Instrucciones específicas para iOS
- Botón de instalación opcional

### ✅ Offline Support
- Service Worker con estrategia Network First
- Cache de archivos estáticos
- Página offline personalizada
- Auto-reconexión cuando vuelve internet

### ✅ Actualizaciones Automáticas
- Detección de nuevas versiones
- Notificación al usuario
- Actualización sin perder datos
- Verificación cada 1 hora

### ✅ Performance
- Caching inteligente (estático + dinámico)
- Timeouts de 30s en requests
- Límite de 100 clientes SSE
- Precarga de assets críticos

### ✅ Integración Nativa
- Splash screen automático
- Tema color: `#0a1f44`
- Modo standalone (sin browser UI)
- Atajos rápidos (shortcuts)

---

## 🎨 Personalización

### Cambiar Colores
Editar `manifest.json`:
```json
"background_color": "#0a1f44",
"theme_color": "#0a1f44"
```

### Cambiar Nombre
Editar `manifest.json`:
```json
"name": "Tu Nombre Aquí",
"short_name": "Nombre Corto"
```

### Agregar Shortcuts
Editar `manifest.json` → `shortcuts`:
```json
{
  "name": "Nuevo Chat",
  "url": "/?action=new-chat",
  "icons": [...]
}
```

---

## 📊 Analytics (Opcional)

Si tenés Google Analytics configurado, ya está integrado:

```javascript
// Eventos automáticos:
- pwa_installed (cuando se instala)
- pwa_install_accepted (usuario acepta)
- pwa_install_dismissed (usuario rechaza)
- pwa_standalone (corriendo como app)
```

---

## 🐛 Troubleshooting

### "Manifest no se carga"
- Verificar que `/manifest.json` responde (200)
- Verificar Content-Type: `application/manifest+json`
- Abrir DevTools → Console para ver errores

### "Service Worker falla"
- Verificar que `/sw.js` responde (200)
- HTTPS requerido en producción (localhost ok)
- Ver DevTools → Application → Service Workers

### "Íconos no aparecen"
- Verificar que existen en `/icons/`
- Verificar tamaños correctos (72, 96, 128, 144, 152, 192, 384, 512)
- Formato PNG requerido

### "No aparece prompt de instalación"
- Android: Solo en HTTPS (producción)
- iOS: No hay prompt automático, solo manual
- Desktop: Ícono en barra de URL

---

## 🚀 Deploy a Producción

### 1. Verificar HTTPS
PWA requiere HTTPS en producción (Render.com ya lo tiene)

### 2. Actualizar URLs
En `manifest.json` y `sw.js`, verificar que las rutas sean correctas

### 3. Generar Íconos Finales
Usar el logo oficial de STI en alta resolución

### 4. Deploy
```bash
git add .
git commit -m "feat: Implementar PWA completa"
git push origin main
```

### 5. Verificar en Producción
1. Abrir: https://sti-rosario-ai.onrender.com
2. DevTools → Application → Manifest
3. Lighthouse → PWA audit (debe pasar todos los checks)

---

## 📈 Métricas de Éxito

Una PWA bien implementada debe lograr:
- ✅ Lighthouse PWA Score: 100/100
- ✅ Instalable en Android/iOS/Desktop
- ✅ Funciona offline
- ✅ Actualiza automáticamente
- ✅ Carga en <3 segundos
- ✅ Service Worker activo

---

## 📞 Soporte

Si tenés problemas con la implementación:
1. Revisar DevTools → Console para errores
2. Verificar DevTools → Application → Manifest
3. Testear en dispositivo real (no solo emulador)
4. Usar Lighthouse para diagnóstico completo

---

## ✨ Próximas Mejoras (Opcional)

- [ ] Push Notifications
- [ ] Background Sync para mensajes offline
- [ ] Web Share API
- [ ] Screenshots para mejor preview
- [ ] Biometric authentication
- [ ] Badging API (contador de notificaciones)

---

¡ChatSTI está listo para ser una Progressive Web App! 🎉
