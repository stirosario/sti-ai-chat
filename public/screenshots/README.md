# Screenshots PWA - ChatSTI

## 📸 Screenshots Opcionales

Este directorio puede contener capturas de pantalla para mejorar la presentación de la PWA en las tiendas de apps.

### Tamaños Recomendados:

**Mobile (Narrow)**
- [ ] chat-mobile.png (540x720 o 1080x1920)
- Captura del chat en dispositivo móvil
- Mostrar conversación típica con Tecnos

**Desktop (Wide)**
- [ ] chat-desktop.png (1280x720 o 1920x1080)
- Captura del chat en desktop
- Mostrar interfaz completa

### ¿Cómo Capturar?

1. **Mobile:**
   - Abrir ChatSTI en Chrome/Safari móvil
   - Iniciar conversación de prueba
   - Usar herramienta de captura del OS
   - Recortar a 540x720 o similar

2. **Desktop:**
   - Abrir ChatSTI en navegador desktop
   - Ajustar ventana a 1280x720
   - DevTools → F12 → Screenshot (Cmd+Shift+P → "Capture screenshot")
   
### Actualizar Manifest

Si agregás screenshots, actualizar en `manifest.json`:

```json
"screenshots": [
  {
    "src": "/screenshots/chat-mobile.png",
    "sizes": "540x720",
    "type": "image/png",
    "form_factor": "narrow",
    "label": "Chat principal con Tecnos"
  },
  {
    "src": "/screenshots/chat-desktop.png",
    "sizes": "1280x720",
    "type": "image/png",
    "form_factor": "wide",
    "label": "Vista de escritorio del chat"
  }
]
```

**Nota:** Screenshots son opcionales pero mejoran la apariencia en Google Play Store y otros marketplaces.
