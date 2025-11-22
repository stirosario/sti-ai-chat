# Íconos PWA - ChatSTI

## ⚠️ ACCIÓN REQUERIDA: Generar Íconos

Este directorio debe contener los siguientes archivos PNG:

### Tamaños Requeridos:
- [ ] icon-72x72.png
- [ ] icon-96x96.png
- [ ] icon-128x128.png
- [ ] icon-144x144.png
- [ ] icon-152x152.png
- [ ] icon-192x192.png (CRÍTICO)
- [ ] icon-384x384.png
- [ ] icon-512x512.png (CRÍTICO)

### ¿Cómo Generar?

**Opción 1: Online (Recomendada - 5 minutos)**
1. Ir a: https://realfavicongenerator.net/
2. Subir logo de STI (mínimo 512x512, preferible SVG o PNG HD)
3. Configurar:
   - Background color: #0a1f44
   - Theme color: #0a1f44
4. Generar y descargar
5. Extraer todos los PNG en este directorio

**Opción 2: Script Automático**
```bash
cd c:\sti-ai-chat
npm install sharp
node generate-icons.js
```

**Opción 3: ImageMagick**
```bash
# Instalar: https://imagemagick.org/
convert logo.png -resize 72x72 icons/icon-72x72.png
convert logo.png -resize 96x96 icons/icon-96x96.png
# ... repetir para cada tamaño
```

### Verificar
```bash
node pwa-validate.js
```

Ver guía completa en: `../GENERAR_ICONOS.md`
