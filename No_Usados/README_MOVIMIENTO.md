# Archivos Movidos a No_Usados

Este directorio contiene archivos y carpetas que NO están siendo utilizados por el `server.js` actual ni por el frontend/admin activo.

## Criterio de Movimiento

Los archivos fueron movidos si cumplían AL MENOS UNA de estas condiciones:

1. **Backups de server.js**: Versiones antiguas o backups (server_bk.js, server_gp.js, serverold.js, etc.)
2. **Scripts de eliminación**: Scripts temporales para limpiar código (eliminar-*.js)
3. **Tests**: Todos los archivos de prueba (test-*.js, test_*.js, test_*.py, etc.)
4. **Simulaciones**: Scripts de simulación (simulacion-*.js, simulaciones_*.js, simulacros_*.js)
5. **Análisis**: Scripts de análisis de datos (analysis-*.js)
6. **Training**: Scripts de entrenamiento (training-*.js) y carpetas de resultados
7. **Frontend obsoleto**: Archivos marcados como no aplicables (frontend-snippet._YA NO APLICA.js)
8. **Documentación obsoleta**: Archivos .md de auditorías, análisis, correcciones, fases, refactors, etc.
9. **Archivos .txt**: Todos los archivos de texto (logs, reportes, etc.)
10. **Scripts .bat no usados**: Scripts de inicio/actualización excepto start-production.bat
11. **Carpetas no usadas**: tests/, docs/, training-results/, tecnos-2d-demo/

## Archivos NO Movidos (Mantenidos en Raíz)

- `server.js` - Servidor principal activo
- `package.json` / `package-lock.json` - Dependencias
- `Procfile` - Configuración de Render
- `Dockerfile` - Configuración de Docker
- `README.md`, `README_DEPLOY.md`, `README_CURSOR.md` - Documentación principal
- `DEPLOYMENT_GUIDE.md`, `TESTING_GUIDE.md` - Guías activas
- `start-production.bat` - Script de producción
- Carpetas activas: `handlers/`, `utils/`, `services/`, `routes/`, `core/`, `src/`, `config/`, `flows/`, `public/`, `public_html/`, `data/`, `logs/`, `transcripts/`

## Validación

- ✅ `server.js` pasa validación de sintaxis (`node --check server.js`)
- ✅ No se modificó la lógica de `server.js`
- ✅ Solo se movieron archivos, no se borraron

## Archivos .md Movidos

Se movieron archivos .md adicionales que no son esenciales para el funcionamiento:
- Guías de implementación y correcciones (GUIA_*.md excepto GUIA_ACTIVACION_RENDER.md)
- Documentación de Codex (CODEX_*.md)
- Documentación de orquestador y mejoras premium
- Documentación de activación/autoevolución/autolearning

**Archivos .md mantenidos (documentación activa):**
- README.md, README_DEPLOY.md, README_CURSOR.md
- DEPLOYMENT_GUIDE.md, TESTING_GUIDE.md, SMOKE_TESTS.md
- FLOW_AUDIT_README.md, TYPO_NORMALIZATION_README.md
- PWA_README.md, INICIO_RAPIDO_PWA.md
- FEATURE_FLAGS.md, VISION_MODE_GUIDE.md
- OPENAI_STREAMING_DEVICES.md, INTEGRATION_GUIDE.md
- INTELLIGENT_SYSTEM_README.md, CONVERSATIONAL_SYSTEM_README.md
- SMART_MODE_README.md, IMAGE_UPLOAD_FEATURE.md
- GUIA_ACTIVACION_RENDER.md

## Fecha de Movimiento

16 de diciembre de 2025

## Nota

Si necesitas recuperar algún archivo, está disponible en esta carpeta. Si un archivo se necesita en el futuro, muévelo de vuelta a la raíz del proyecto.

