# Guía de Generación de Íconos para PWA ChatSTI
# Los íconos deben generarse desde el logo de STI

## IMPORTANTE: Usar herramienta online o script Python

### Opción 1: Herramienta Online (Recomendada)
1. Ir a: https://realfavicongenerator.net/
2. Subir logo de STI (preferiblemente SVG o PNG de alta resolución, mínimo 512x512)
3. Configurar:
   - iOS: Usar color de fondo #0a1f44
   - Android: Usar tema #0a1f44
   - Generar todos los tamaños
4. Descargar y extraer en: c:\sti-ai-chat\public\icons\

### Opción 2: ImageMagick (Línea de comandos)
```bash
# Instalar ImageMagick: https://imagemagick.org/

# Generar todos los tamaños desde logo original
convert logo.png -resize 72x72 icons/icon-72x72.png
convert logo.png -resize 96x96 icons/icon-96x96.png
convert logo.png -resize 128x128 icons/icon-128x128.png
convert logo.png -resize 144x144 icons/icon-144x144.png
convert logo.png -resize 152x152 icons/icon-152x152.png
convert logo.png -resize 192x192 icons/icon-192x192.png
convert logo.png -resize 384x384 icons/icon-384x384.png
convert logo.png -resize 512x512 icons/icon-512x512.png
```

### Opción 3: Script Python con Pillow
```python
from PIL import Image
import os

# Configurar ruta del logo original
logo_path = "logo.png"
output_dir = "public/icons"

# Tamaños requeridos
sizes = [72, 96, 128, 144, 152, 192, 384, 512]

# Crear directorio si no existe
os.makedirs(output_dir, exist_ok=True)

# Abrir logo original
logo = Image.open(logo_path)

# Generar todos los tamaños
for size in sizes:
    resized = logo.resize((size, size), Image.LANCZOS)
    output_path = f"{output_dir}/icon-{size}x{size}.png"
    resized.save(output_path, "PNG", optimize=True)
    print(f"✓ Generado: {output_path}")

print("\n✅ Todos los íconos generados exitosamente!")
```

### Tamaños Requeridos:
- 72x72   → Android Chrome (mínimo)
- 96x96   → Android Chrome
- 128x128 → Android Chrome
- 144x144 → Windows tiles
- 152x152 → iOS
- 192x192 → Android Chrome (estándar)
- 384x384 → Android Chrome (high-res)
- 512x512 → Android splash screen

### Screenshots (Opcional pero recomendado):
1. Mobile (540x720): Captura del chat en móvil
2. Desktop (1280x720): Captura del chat en escritorio
3. Guardar en: c:\sti-ai-chat\public\screenshots\

### Verificación:
Después de generar los íconos, verificar que existan todos:
```
public/
  icons/
    icon-72x72.png
    icon-96x96.png
    icon-128x128.png
    icon-144x144.png
    icon-152x152.png
    icon-192x192.png
    icon-384x384.png
    icon-512x512.png
  screenshots/ (opcional)
    chat-mobile.png
    chat-desktop.png
```
