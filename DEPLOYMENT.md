# Deployment Guide

## Scripts de Deployment Automático

Este proyecto incluye scripts automatizados para facilitar el deployment a Render.

### 📁 Scripts disponibles

#### Windows
- **`update.bat`** ⭐ - Script principal de deployment con backup automático (existente)
  - Crea backups timestamped del `server.js`
  - Agrega todos los archivos modificados al staging
  - Hace commit automático con timestamp como mensaje
  - Push a GitHub en la rama **main** (hardcoded)
  - Render detecta el cambio y redeploya automáticamente

- **`update1.bat`** - Script interactivo de deployment (existente)
  - Similar a `update.bat` pero pide mensaje de commit personalizado
  - Útil cuando querés un mensaje descriptivo en vez del timestamp

- **`coyserver.bat`** - Solo backups (existente)
  - Crea backups locales sin hacer deployment
  - Útil para guardar versiones antes de hacer cambios

#### Linux/macOS
- **`deploy.sh`** ⭐ - Script de deployment Unix (nuevo)
  - Hace commit automático con timestamp
  - Push a GitHub en la **rama actual** (detección dinámica)
  - Render detecta el cambio y redeploya automáticamente
  - **Nota:** No incluye backups locales (las rutas son específicas de Windows)

**Diferencia importante:** El script de Windows (`update.bat`) siempre hace push a la rama `main`, mientras que el script Unix (`deploy.sh`) detecta y usa la rama actual automáticamente para mayor flexibilidad.

### 🚀 Uso

#### Windows
```cmd
REM Deployment automático con timestamp
update.bat

REM Deployment con mensaje personalizado
update1.bat

REM Solo crear backup sin deployment
coyserver.bat
```

#### Linux/macOS
```bash
# Asegurarse de que el script sea ejecutable
chmod +x deploy.sh

# Ejecutar deployment
./deploy.sh
```

### ⚙️ Configuración de Render

Para que el deployment automático funcione, asegurate de tener configurado en Render:

1. **Auto-Deploy** activado
   - **Windows (update.bat)**: Configurá Auto-Deploy desde la rama `main`
   - **Linux/macOS (deploy.sh)**: Configurá Auto-Deploy desde tu rama de trabajo (el script usa la rama actual)
2. Variables de entorno configuradas:
   - `OPENAI_API_KEY` - Tu API key de OpenAI
   - `PORT` - Puerto del servidor (ej: 3001)

**Nota importante:** Si usás el script Unix (`deploy.sh`) en una rama diferente a `main`, asegurate de configurar Auto-Deploy en Render para esa rama también, o cambiá a la rama `main` antes de ejecutar el script.

### 📝 Formato de commits automáticos

Los scripts generan commits con el formato:
```
DDMMYYYY-HHMM
```

Ejemplo: `02122025-2058` (2 de diciembre de 2025 a las 20:58)

### 🔍 Monitoreo del deployment

Después de hacer push, podés ver el progreso del deployment en:
- Dashboard de Render: https://render.com/dashboard
- Logs del servicio: https://dashboard.render.com

### ⚠️ Solución de problemas

**Error al hacer push:**
- Verificá tu conexión a internet
- Asegurate de no tener conflictos locales: `git status`
- Resolvé conflictos antes de volver a ejecutar el script

**Render no detecta el cambio:**
- Verificá que Auto-Deploy esté activado en Render
- Revisá que el push se haya realizado correctamente: `git log`
- Chequeá los logs en el dashboard de Render

### 💡 Buenas prácticas

1. **Antes de deployar:**
   - Probá los cambios localmente
   - Ejecutá `coyserver.bat` (Windows) para crear un backup

2. **Durante el deployment:**
   - Esperá a que Render complete el deployment antes de hacer más cambios
   - Monitoreá los logs para detectar errores

3. **Después del deployment:**
   - Verificá que la aplicación funcione correctamente
   - Probá el endpoint `/health` para confirmar que el servidor está activo
