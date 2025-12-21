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

### PR #6 — Validaciones backend (Etapa 1)
- [ ] Definir puntos de entrada a validar (chat/upload/headers/query)
- [ ] Limitar tamaño de payload (texto + imágenes)
- [ ] Validar mimetype/size en `/api/upload-image`
- [ ] Validar `sessionId` y formatos esperados (`imageRefs`, `buttonToken`)
- [ ] Tests mínimos (válidos/invalidos) + criterios de aceptación
