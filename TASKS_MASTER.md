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

## 🔄 NEXT

### PR #5 - Hardening IMÁGENES (auditabilidad + logs seguros + fallback)
- [x] Agregar flags `DEBUG_CHAT` y `DEBUG_IMAGES`
- [x] Crear helper `probePublicUrl(url)` con timeout
- [x] Mejorar `/api/upload-image`: logs seguros + usedVision + probe
- [x] Mejorar `/api/chat`: logs concluyentes sin base64 + gatear logs ruidosos
- [ ] Pruebas manuales: Upload-image OK
- [ ] Pruebas manuales: Chat con imageRefs
- [ ] Verificar que NO aparezca base64 en logs
- [ ] Commit y push branch `hardening/images-logs-safe`

### PR #6 - Validaciones (pendiente)
- [ ] TBD

