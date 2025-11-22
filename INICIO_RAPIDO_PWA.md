# 🚀 ChatSTI PWA - Inicio Rápido

## ✅ Checklist de Implementación

### 1️⃣ Verificar Archivos (5 min)
```bash
cd c:\sti-ai-chat
node pwa-validate.js
```

### 2️⃣ Generar Íconos (10 min)
**Opción Rápida - Online:**
- Ir a: https://realfavicongenerator.net/
- Subir logo STI (512x512 mínimo)
- Color: #0a1f44
- Descargar y extraer en `public/icons/`

**Opción Script:**
```bash
npm install sharp
node generate-icons.js
```

### 3️⃣ Integrar en index.php (5 min)
Copiar contenido de `PWA_INTEGRATION.html` y pegar en:
- `<head>` → Meta tags y manifest
- Antes de `</body>` → Scripts PWA

### 4️⃣ Reiniciar Servidor
```bash
node server.js
```

### 5️⃣ Testear (5 min)
1. Abrir: http://localhost:3001
2. DevTools (F12) → Application → Manifest
3. Verificar que todo carga sin errores

### 6️⃣ Deploy
```bash
git add .
git commit -m "feat: PWA completa implementada"
git push origin main
```

---

## 🧪 Testing en Dispositivos

### Android
1. Abrir en Chrome: https://sti-rosario-ai.onrender.com
2. Banner "Agregar a pantalla de inicio" debe aparecer
3. O menú ⋮ → "Instalar app"

### iOS
1. Abrir en Safari: https://sti-rosario-ai.onrender.com
2. Botón compartir ⎙ → "Agregar a pantalla de inicio"

### Desktop
1. Abrir en Chrome: https://sti-rosario-ai.onrender.com
2. Ícono ➕ en barra de URL → "Instalar"

---

## 📊 Verificación Lighthouse

```bash
# Chrome DevTools → Lighthouse
# Run PWA audit
# Objetivo: 100/100
```

**Criterios:**
- ✅ Installable
- ✅ PWA optimizada
- ✅ Funciona offline
- ✅ Service Worker registrado
- ✅ Manifest válido
- ✅ Íconos correctos

---

## 🔧 Comandos Útiles

```bash
# Validar configuración PWA
node pwa-validate.js

# Generar íconos
node generate-icons.js

# Ver logs del servidor
tail -f data/logs/server.log

# Limpiar cache de Service Worker
# Chrome: chrome://serviceworker-internals
# Unregister all
```

---

## 📁 Estructura de Archivos

```
c:\sti-ai-chat\
├── public/
│   ├── manifest.json          ← Config PWA
│   ├── sw.js                  ← Service Worker
│   ├── pwa-install.js         ← Instalador
│   ├── offline.html           ← Página offline
│   ├── browserconfig.xml      ← Windows config
│   ├── icons/
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png   ← CRÍTICO
│   │   ├── icon-384x384.png
│   │   └── icon-512x512.png   ← CRÍTICO
│   └── screenshots/           ← Opcional
│       ├── chat-mobile.png
│       └── chat-desktop.png
│
├── server.js                  ← Actualizado (sirve static)
├── PWA_README.md              ← Guía completa
├── PWA_INTEGRATION.html       ← Código para index.php
├── GENERAR_ICONOS.md          ← Guía de íconos
├── generate-icons.js          ← Script generador
└── pwa-validate.js            ← Validador
```

---

## 🎯 Objetivos Cumplidos

- ✅ App instalable en Android, iOS y Desktop
- ✅ Funciona offline con Service Worker
- ✅ Actualizaciones automáticas
- ✅ Caché inteligente
- ✅ Splash screen
- ✅ Tema personalizado (#0a1f44)
- ✅ Shortcuts rápidos
- ✅ Standalone mode (sin browser UI)

---

## 🆘 Problemas Comunes

### "No aparece prompt de instalación"
- Android: Requiere HTTPS (OK en Render)
- iOS: No hay prompt automático, instrucciones manuales
- Desktop: Buscar ícono ➕ en URL bar

### "Service Worker no registra"
- Verificar console de DevTools
- HTTPS requerido en producción
- Verificar que /sw.js responde 200

### "Íconos no cargan"
- Verificar que existen en public/icons/
- Verificar tamaños correctos
- Formato PNG requerido

---

## 📞 Soporte

1. Revisar logs: `data/logs/server.log`
2. DevTools → Console (errores)
3. DevTools → Application (estado PWA)
4. Lighthouse audit (diagnóstico completo)

---

## 🚀 ¡Listo!

Tu ChatSTI ya es una Progressive Web App profesional, instalable en cualquier dispositivo y con soporte offline.

**Próximo paso:** Generar íconos y testear en dispositivos reales.

Ver documentación completa en: `PWA_README.md`
