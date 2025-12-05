# ✅ CHECKLIST DE COMPATIBILIDAD - Refactor Modular

**Usar este checklist para verificar compatibilidad antes de activar `USE_MODULAR_ARCHITECTURE=true`**

---

## 📍 ESTADO ACTUAL: 38/68 ítems compatibles (56%)

---

## 1️⃣ ENDPOINTS (25/25 ✅)

- [x] `GET /api/health`
- [x] `ALL /api/greeting`
- [x] `POST /api/chat`
- [x] `POST /api/reset`
- [x] `POST /api/whatsapp-ticket`
- [x] `POST /api/ticket/create`
- [x] `GET /api/ticket/:tid`
- [x] `GET /api/tickets`
- [x] `DELETE /api/ticket/:tid`
- [x] `GET /ticket/:tid`
- [x] `GET /api/transcript/:sid`
- [x] `GET /api/logs`
- [x] `GET /api/logs/stream`
- [x] `GET /api/sessions`
- [x] `GET /api/flow-audit`
- [x] `GET /api/flow-audit/:sessionId`
- [x] `GET /api/flow-audit/export`
- [x] `GET /api/metrics`
- [x] `POST /api/upload-image`
- [x] `POST /api/session/validate`
- [x] `GET /api/gdpr/my-data/:sessionId`
- [x] `DELETE /api/gdpr/delete-me/:sessionId`
- [x] `POST /api/csp-report`
- [x] `POST /api/cleanup`
- [x] `GET /` (root)

---

## 2️⃣ FORMATO JSON RESPONSE (4/11 🔴)

### Campos Presentes ✅
- [x] `reply` (mapeado desde `text`)
- [x] `stage` (requiere uppercase)
- [x] `options` (requiere conversión)
- [x] `session` (estructura parcial)

### Campos FALTANTES ❌
- [ ] `ok` - Flag de éxito/error
- [ ] `sid` - Session ID
- [ ] `ui.buttons` - Estructura completa de botones
- [ ] `allowWhatsapp` - Flag de escalamiento
- [ ] `endConversation` - Flag de fin
- [ ] `help` - Ayuda contextual por step
- [ ] `steps` - Array de pasos diagnóstico
- [ ] `imageAnalysis` - Resultado Vision API

---

## 3️⃣ STATES/STAGES (3/15 🔴)

### Parcialmente Compatible 🟠
- [x] `ASK_NAME` (requiere uppercase)
- [x] `ASK_NEED` (requiere uppercase)
- [x] `ESCALATE` (requiere uppercase)

### Stages FALTANTES ❌
- [ ] `ASK_LANGUAGE` - Selección idioma + GDPR
- [ ] `CLASSIFY_NEED` - Clasificar problema vs consulta
- [ ] `ASK_DEVICE` - Preguntar tipo dispositivo
- [ ] `ASK_PROBLEM` - Describir problema
- [ ] `DETECT_DEVICE` - Desambiguar dispositivo
- [ ] `ASK_HOWTO_DETAILS` - Detalles de consulta
- [ ] `GENERATE_HOWTO` - Generar guía
- [ ] `BASIC_TESTS` - Pruebas básicas
- [ ] `ADVANCED_TESTS` - Pruebas avanzadas
- [ ] `CREATE_TICKET` - Crear ticket
- [ ] `TICKET_SENT` - Confirmar ticket
- [ ] `ENDED` - Conversación finalizada

---

## 4️⃣ TOKENS DE BOTONES (0/11 🔴)

### Idiomas ❌
- [ ] `BTN_LANG_ES_AR` → "Español (Argentina)"
- [ ] `BTN_LANG_ES_ES` → "Español (Latinoamérica)"
- [ ] `BTN_LANG_EN` → "English"
- [ ] `BTN_NO_NAME` → "Prefiero no decirlo"

### Tipo de Necesidad ❌
- [ ] `BTN_PROBLEMA` → "tengo un problema"
- [ ] `BTN_CONSULTA` → "tengo una consulta"

### Dispositivos ❌
- [ ] `BTN_DESKTOP` → "desktop"
- [ ] `BTN_ALLINONE` → "all in one"
- [ ] `BTN_NOTEBOOK` → "notebook"

### Feedback Steps ❌
- [ ] `BTN_SOLVED` → "lo pude solucionar"
- [ ] `BTN_PERSIST` → "el problema persiste"
- [ ] `BTN_ADVANCED_TESTS` → "pruebas avanzadas"
- [ ] `BTN_MORE_TESTS` → "más pruebas"
- [ ] `BTN_TECH` → "hablar con técnico"

### Ayuda Dinámica ❌
- [ ] `BTN_HELP_1`, `BTN_HELP_2`, ... → "ayuda paso N"

---

## 5️⃣ FLUJOS ESPECIALES (6/6 ✅)

### Tickets ✅
- [x] Crear ticket con `createTicket()`
- [x] Generar link WhatsApp
- [x] Guardar ticket en disco
- [x] Retornar `ticketId` y URL pública
- [x] Actualizar `session.stage = TICKET_SENT`
- [x] Endpoint `/api/whatsapp-ticket` funcional

### WhatsApp ✅
- [x] Generar link con número + mensaje pre-llenado
- [x] Validar `session.waEligible`
- [x] Incluir datos de ticket en mensaje

---

## 6️⃣ FUNCIONALIDADES AVANZADAS (0/8 🔴)

### Vision API (Análisis de Imágenes) ❌
- [ ] Procesar imágenes con `processImagesWithVision()`
- [ ] Extraer texto y mensajes de error
- [ ] Identificar tipo de problema visualmente
- [ ] Retornar `imageAnalysis` en response

### Generación de Diagnósticos ❌
- [ ] Generar steps básicos (local + AI)
- [ ] Generar steps avanzados
- [ ] Diferenciar entre `tests.basic` y `tests.advanced`
- [ ] Actualizar `session.tests` correctamente

### Ayuda Contextual por Step ❌
- [ ] Detectar `BTN_HELP_N` o "ayuda paso N"
- [ ] Retornar help detail específico
- [ ] Trackear `session.lastHelpStep`
- [ ] Incluir `help` object en response

---

## 7️⃣ SEGURIDAD Y MIDDLEWARE (6/6 ✅)

- [x] CSRF validation (`validateCSRF`)
- [x] Rate limiting global (`express-rate-limit`)
- [x] Rate limiting por sesión (`checkSessionRateLimit`)
- [x] CORS configurado
- [x] Helmet (CSP, HSTS, etc.)
- [x] Input sanitization

---

## 8️⃣ LOGGING Y AUDITORÍA (2/4 🟠)

- [x] `flowLogger.logFlowInteraction()` llamado
- [x] Loop detection con `detectLoops()`
- [ ] Formato de log compatible con flowLogger
- [ ] Métricas Prometheus (`updateMetric()`)

---

## 9️⃣ UTILIDADES EXTERNAS (4/4 ✅)

- [x] `sessionStore.js` - Sesiones Redis/memory
- [x] `normalizarTexto.js` - Normalización NLP
- [x] `deviceDetection.js` - Detección dispositivos
- [x] `ticketing.js` - Sistema de tickets

---

## 🔟 EDGE CASES Y VALIDACIONES (0/6 🔴)

- [ ] Usuario escribe "no sé" → handler de confusión
- [ ] Usuario sube múltiples imágenes → procesamiento batch
- [ ] Sesión expira mid-conversation → recuperación
- [ ] OpenAI API falla → fallback local
- [ ] Usuario escribe texto muy largo → truncamiento
- [ ] Sentimiento negativo detectado → respuesta empática

---

## 📊 RESUMEN POR CATEGORÍA

| Categoría | ✅ OK | ❌ Falta | Total | % |
|-----------|-------|----------|-------|---|
| **Endpoints** | 25 | 0 | 25 | 100% |
| **JSON Response** | 4 | 7 | 11 | 36% |
| **STATES** | 3 | 12 | 15 | 20% |
| **Botones** | 0 | 14 | 14 | 0% |
| **Flujos Tickets** | 6 | 0 | 6 | 100% |
| **Funcionalidades Avanzadas** | 0 | 8 | 8 | 0% |
| **Seguridad** | 6 | 0 | 6 | 100% |
| **Logging** | 2 | 2 | 4 | 50% |
| **Utilidades** | 4 | 0 | 4 | 100% |
| **Edge Cases** | 0 | 6 | 6 | 0% |
| **TOTAL** | **50** | **49** | **99** | **51%** |

---

## 🎯 CRITERIO DE APROBACIÓN

Para activar `USE_MODULAR_ARCHITECTURE=true` en producción:

### ✅ Mínimo Requerido (Critical Path)
- [x] Todos los endpoints presentes (25/25) ✅
- [ ] JSON response completo (11/11) 🔴 - **BLOQUEADOR**
- [ ] STATES 100% compatibles (15/15) 🔴 - **BLOQUEADOR**
- [ ] Botones procesados (14/14) 🔴 - **BLOQUEADOR**
- [x] Tickets funcionando (6/6) ✅

### 🟡 Deseable (Enhanced Features)
- [ ] Vision API integrada (2/2)
- [ ] Generación diagnósticos (4/4)
- [ ] Ayuda contextual (3/3)
- [ ] Edge cases manejados (6/6)

### 🟢 Opcional (Nice to Have)
- [ ] Métricas Prometheus
- [ ] Logs formato mejorado
- [ ] Cache optimizado

---

## 🚨 DECISIÓN FINAL

**Estado Actual**: 50/99 ítems completados (51%)

### ❌ NO APTO PARA PRODUCCIÓN

**Bloqueadores críticos:**
1. JSON response incompleto (solo 36% compatible)
2. STATES incompatibles (solo 20% compatible)
3. Botones no procesados (0% compatible)

**Estimado para completar**: 8-12 horas de desarrollo + 2-3 horas de testing

---

## 📋 CÓMO USAR ESTE CHECKLIST

1. **Antes de activar refactor**: Verificar que todos los ítems con 🔴 estén resueltos
2. **Durante desarrollo**: Ir marcando `[x]` a medida que se completan
3. **En code review**: Verificar que checkboxes marcados realmente funcionen
4. **Post-deploy**: Re-verificar en staging antes de producción

---

**Última actualización**: 5 Diciembre 2025  
**Branch**: `refactor/modular-architecture`  
**Commit**: 950d39b
