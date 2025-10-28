# STI Rosario AI — Asistente de Diagnóstico Técnico 🤖

Backend Express + OpenAI para chat de soporte automatizado de **STI Servicio Técnico Inteligente**.

## Archivos principales
- `server.js` → servidor Express + IA
- `sti-chat-flujos.json` → flujos locales y respuestas automáticas
- `sti-chat.js` → cliente web para embebido
- `.env` → clave OpenAI (no se publica)
- `Procfile` → inicio de servicio en Render

## Deploy en Render
1. Subí los archivos a GitHub.
2. Creá o sincronizá tu servicio en Render.
3. En **Environment** agregá:
   - `OPENAI_API_KEY` = tu clave de OpenAI
   - `PORT` = 3001
4. Deploy y probá `/health`.

Visita tu chat activo en:
```
https://sti-rosario-ai.onrender.com
```
