# STI Rosario AI — Asistente de Diagnóstico Técnico 🤖

Backend Express + OpenAI para chat de soporte automatizado de **STI Servicio Técnico Inteligente**.

## Archivos principales
- `server.js` → servidor Express + IA
- `sti-chat-flujos.json` → flujos locales y respuestas automáticas
- `sti-chat.js` → cliente web para embebido
- `.env` → clave OpenAI (no se publica)
- `Procfile` → inicio de servicio en Render

## Deploy en Render

### Configuración inicial
1. Subí los archivos a GitHub.
2. Creá o sincronizá tu servicio en Render.
3. En **Environment** agregá:
   - `OPENAI_API_KEY` = tu clave de OpenAI
   - `PORT` = 3001
4. Deploy y probá `/health`.

### Deployment automático

#### Windows
Ejecutá el script de deploy:
```cmd
update.bat
```
Este script:
- Crea backups timestamped del `server.js`
- Hace commit automático con timestamp
- Push a GitHub (Render detecta el cambio y redeploya automáticamente)

#### Linux/macOS
Ejecutá el script de deploy:
```bash
./deploy.sh
```
Este script:
- Hace commit automático con timestamp
- Push a GitHub en la rama actual (Render detecta el cambio y redeploya automáticamente)

**Nota:** Los backups locales solo están disponibles en el script de Windows ya que usan rutas específicas del sistema.

Visita tu chat activo en:
```
https://sti-rosario-ai.onrender.com
```
