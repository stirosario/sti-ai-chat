# TASKS_MASTER - Lista de Tareas STI Chat

## ✅ DONE (Verificado en Render)

### PR #3 (A) - Fix de inicialización: CONVERSATION_IDS_FILE
- [x] Mover `loadUsedConversationIds()` después de inicializar paths y directorios
- [x] Eliminar error "Cannot access 'CONVERSATION_IDS_FILE' before initialization"
- [x] Verificado: arranque limpio sin errores
- [x] Verificado: `/api/health` responde OK

### PR #4 (B) - Fix ENOENT en GET / por falta de public/index.html
- [x] Agregar fallback cuando `public/index.html` no existe
- [x] Responder 200 con mensaje texto plano en lugar de error
- [x] Verificado: Render ya no loguea ENOENT por `/public/index.html`
- [x] Verificado: root "/" responde 200 sin romper
## 🔄 NEXT (prioridad)

### PR #5 — Cierre (pendiente pruebas manuales)
- [ ] Subir imagen (upload-image): confirmar respuesta incluye `usedVision` y `probe`
- [ ] Probar chat reutilizando imagen (imageRefs): confirmar logs `[CHAT:VISION_PLAN]`
- [ ] Verificar en Render logs que NO aparece `data:image/...base64`

### PR #6 — Validaciones backend (Etapa 1) — En progreso
- [x] Definir límites configurables por env (MAX_TEXT_LEN, MAX_UPLOAD_BYTES, etc.)
- [x] Crear helpers reutilizables (asString, clampLen, isSafeId, safeSessionId, badRequest, tooLarge, isHttpUrl)
- [x] Validar en `/api/chat`: texto, buttonToken, sid (soft), imageRefs, arrays
- [x] Validar en `/api/upload-image`: sid (soft), file, tamaño, mimetype
- [x] Validar en endpoints sensibles: `/api/gdpr/my-data/:sessionId`, `/api/gdpr/delete-me/:sessionId`, `/api/transcript/:sid`, `/api/flow-audit/:sessionId`
- [ ] Pruebas manuales: Chat texto demasiado largo (413)
- [ ] Pruebas manuales: Chat imageRefs inválido (400 BAD_IMAGE_REF)
- [ ] Pruebas manuales: Upload-image mimetype inválido (400 BAD_MIMETYPE)
- [ ] Pruebas manuales: Upload-image grande (413 FILE_TOO_LARGE)
- [ ] Pruebas manuales: GDPR endpoint con ID inválido (400 BAD_SESSION_ID)
