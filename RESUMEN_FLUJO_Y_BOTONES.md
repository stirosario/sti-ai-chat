# Resumen Técnico: Flujo y Botones en server.js

## 1. Estructura Principal del Flujo

### 1.1 Flujo Cronológico Completo

El sistema implementa un flujo secuencial que guía al usuario desde el consentimiento inicial hasta la resolución del problema o escalamiento a técnico:

```
1. ASK_LANGUAGE (Consentimiento GDPR + Selección de Idioma)
   ↓
2. ASK_NAME (Captura de Nombre)
   ↓
3. ASK_USER_LEVEL (Nivel Técnico: Básico/Intermedio/Avanzado)
   ↓
4. ASK_NEED (Pregunta Abierta - Sin Botones)
   ↓
5. ASK_PROBLEM (Validación con OpenAI - Detecta Intent y Faltantes)
   ↓
6. ASK_DEVICE (Selección de Dispositivo - Si falta información)
   ↓
7. ASK_OS (Sistema Operativo - Opcional, solo si realmente se necesita)
   ↓
8. DIAGNOSTIC_STEP (Diagnóstico Paso a Paso con Memoria)
   ↓
9. FEEDBACK_REQUIRED (Feedback Obligatorio: 👍 / 👎)
   ↓
10. FEEDBACK_REASON (Motivo del Feedback Negativo - Si aplica)
   ↓
11. ENDED (Conversación Finalizada)
```

### 1.2 Puntos de Decisión en el Flujo

#### Punto de Decisión 1: ASK_PROBLEM → ASK_DEVICE o DIAGNOSTIC_STEP
- **Criterio**: OpenAI analiza si falta información del dispositivo
- **Si falta dispositivo**: Avanza a `ASK_DEVICE` (obligatorio)
- **Si no falta**: Avanza directamente a `DIAGNOSTIC_STEP`

#### Punto de Decisión 2: ASK_DEVICE → ASK_OS o DIAGNOSTIC_STEP
- **Criterio**: OpenAI determina si realmente se necesita el OS para el siguiente paso
- **Si se necesita OS**: Avanza a `ASK_OS` (opcional, puede elegir "No lo sé")
- **Si no se necesita**: Avanza directamente a `DIAGNOSTIC_STEP`

#### Punto de Decisión 3: DIAGNOSTIC_STEP → FEEDBACK_REQUIRED
- **Criterio 1**: Usuario hace clic en "BTN_SOLVED" (problema resuelto)
- **Criterio 2**: Se alcanzan 10 pasos de diagnóstico (5 básicos + 5 avanzados)
- **Criterio 3**: Dos "BTN_PERSIST" seguidos (problema no se resuelve)
- **Resultado**: Avanza a `FEEDBACK_REQUIRED`

#### Punto de Decisión 4: FEEDBACK_REQUIRED → FEEDBACK_REASON o ENDED
- **Si feedback positivo (👍)**: Avanza directamente a `ENDED`
- **Si feedback negativo (👎)**: Avanza a `FEEDBACK_REASON`
- **Después de FEEDBACK_REASON**: Avanza a `ENDED`

### 1.3 Tipos de Stages

#### Stages Determinísticos
- **ASK_LANGUAGE**: Siempre muestra los mismos botones de idioma
- **ASK_NAME**: No tiene botones (solo input de texto)
- **ASK_USER_LEVEL**: Siempre muestra 3 botones (Básico/Intermedio/Avanzado)
- **ASK_DEVICE**: Siempre muestra 3 botones (PC escritorio/Notebook/All In One)
- **ASK_OS**: Siempre muestra 4 botones (Windows/macOS/Linux/No lo sé)
- **FEEDBACK_REQUIRED**: Siempre muestra 2 botones (👍 Sí / 👎 No)
- **FEEDBACK_REASON**: Siempre muestra 5 botones (motivos específicos)
- **ENDED**: No tiene botones (conversación finalizada)

#### Stages Gobernados por IA
- **ASK_NEED**: Pregunta abierta, sin botones (el usuario escribe libremente)
- **ASK_PROBLEM**: OpenAI valida y clasifica el problema (no muestra botones al usuario)
- **DIAGNOSTIC_STEP**: OpenAI genera pasos de diagnóstico (muestra botones de resultado)

### 1.4 Orquestación del Flujo

El endpoint `/api/chat` procesa cada mensaje del usuario:

1. **Identifica el stage actual** de la sesión
2. **Selecciona el handler correspondiente** según el stage
3. **El handler procesa** la entrada (texto o botón clickeado)
4. **Determina el próximo stage** y genera la respuesta
5. **Sanea los botones** según el contrato del stage
6. **Valida que reply no esté vacío** (protección crítica)
7. **Guarda el turno completo** en historial (JSONL)
8. **Retorna respuesta al frontend** con botones en formato legacy

---

## 2. Sistema de Botones

### 2.1 Catálogo de Botones (BUTTON_CATALOG)

El catálogo define todos los botones disponibles con etiquetas bilingües (español/inglés):

#### Botones DEPRECATED (No se usan en stages activos)
- `BTN_PROBLEMA`: "Tengo un problema" / "I have a problem"
- `BTN_CONSULTA`: "Es una consulta" / "It's a question"
- `BTN_NO_ENCIENDE`: "No enciende" / "Won't turn on"
- `BTN_NO_INTERNET`: "Sin internet" / "No internet"
- `BTN_LENTITUD`: "Lentitud" / "Slowness"
- `BTN_BLOQUEO`: "Bloqueos" / "Freezes"
- `BTN_PERIFERICOS`: "Periféricos" / "Peripherals"
- `BTN_VIRUS`: "Virus o malware" / "Virus or malware"

**Nota**: Estos botones están marcados como `deprecated: true` y NO están permitidos en ningún stage activo. Se mantienen solo por compatibilidad legacy si es necesario.

#### Botones Activos - Navegación y Control
- `BTN_BACK`: "Volver atrás" / "Go back"
- `BTN_CLOSE`: "Cerrar chat" / "Close chat"
- `BTN_CONNECT_TECH`: "Hablar con técnico" / "Talk to technician"
- `BTN_ADVANCED_TESTS`: "Pruebas avanzadas" / "Advanced tests"

#### Botones Activos - Resultados de Diagnóstico
- `BTN_SOLVED`: "Listo, se arregló" / "Done, it's fixed"
- `BTN_PERSIST`: "Sigue igual" / "Still the same"
- `BTN_HELP_CONTEXT`: "¿Cómo hago esto?" / "How do I do this?"

#### Botones Activos - Dispositivo
- `BTN_DEVICE_DESKTOP`: "PC de escritorio" / "Desktop PC"
- `BTN_DEVICE_NOTEBOOK`: "Notebook" / "Notebook"
- `BTN_DEVICE_ALLINONE`: "All In One" / "All In One"

#### Botones Activos - Sistema Operativo
- `BTN_OS_WINDOWS`: "Windows" / "Windows"
- `BTN_OS_MACOS`: "macOS" / "macOS"
- `BTN_OS_LINUX`: "Linux" / "Linux"
- `BTN_OS_UNKNOWN`: "No lo sé" / "I don't know"

#### Botones Activos - Feedback
- `BTN_FEEDBACK_YES`: "👍 Sí, me sirvió" / "👍 Yes, it helped"
- `BTN_FEEDBACK_NO`: "👎 No, no me sirvió" / "👎 No, it didn't help"
- `BTN_REASON_NOT_RESOLVED`: "No resolvió el problema" / "Didn't resolve the problem"
- `BTN_REASON_HARD_TO_UNDERSTAND`: "Fue difícil de entender" / "Hard to understand"
- `BTN_REASON_TOO_MANY_STEPS`: "Demasiados pasos" / "Too many steps"
- `BTN_REASON_WANTED_TECH`: "Prefería hablar con un técnico" / "Wanted to talk to a technician"
- `BTN_REASON_OTHER`: "Otro motivo" / "Other reason"

### 2.2 Asignación de Botones por Stage

#### ASK_LANGUAGE
- **Tipo**: Determinístico
- **Botones**: 
  - `BTN_LANG_ES_AR` (Español Argentina)
  - `BTN_LANG_EN` (English)
- **Especial**: También muestra botones temporales `si`/`no` para consentimiento GDPR

#### ASK_NAME
- **Tipo**: Determinístico
- **Botones**: Ninguno (solo input de texto)

#### ASK_USER_LEVEL
- **Tipo**: Determinístico
- **Botones**:
  - `BTN_USER_LEVEL_BASIC` (Básico)
  - `BTN_USER_LEVEL_INTERMEDIATE` (Intermedio)
  - `BTN_USER_LEVEL_ADVANCED` (Avanzado)

#### ASK_NEED
- **Tipo**: AI-gobernado, pero sin botones
- **Botones**: Ninguno (pregunta abierta)
- **Protección**: Múltiples capas aseguran que nunca se muestren botones:
  1. `allowButtons: false` en contrato
  2. `allowedTokens: []` vacío
  3. Protección en `generateAIResponse` que fuerza `buttons: []` para ASK_NEED
  4. Validación final que respeta `allowButtons === false`

#### ASK_PROBLEM
- **Tipo**: AI-gobernado (validación interna)
- **Botones**: Ninguno mostrado al usuario (procesamiento interno con OpenAI)

#### ASK_DEVICE
- **Tipo**: Determinístico
- **Botones**:
  - `BTN_DEVICE_DESKTOP` (PC de escritorio)
  - `BTN_DEVICE_NOTEBOOK` (Notebook)
  - `BTN_DEVICE_ALLINONE` (All In One)

#### ASK_OS
- **Tipo**: Determinístico
- **Botones**:
  - `BTN_OS_WINDOWS` (Windows)
  - `BTN_OS_MACOS` (macOS)
  - `BTN_OS_LINUX` (Linux)
  - `BTN_OS_UNKNOWN` (No lo sé)

#### DIAGNOSTIC_STEP
- **Tipo**: AI-gobernado (generación de pasos)
- **Botones** (estructura fija por paso):
  - `BTN_SOLVED` (Listo, se arregló) - Orden 1
  - `BTN_PERSIST` (Sigue igual) - Orden 2
  - `BTN_HELP_CONTEXT` (¿Cómo hago esto?) - Orden 3
  - `BTN_BACK` (Volver atrás) - Orden 4 (solo si hay pasos anteriores)

#### FEEDBACK_REQUIRED
- **Tipo**: Determinístico
- **Botones**:
  - `BTN_FEEDBACK_YES` (👍 Sí, me sirvió) - Orden 1
  - `BTN_FEEDBACK_NO` (👎 No, no me sirvió) - Orden 2

#### FEEDBACK_REASON
- **Tipo**: Determinístico
- **Botones**:
  - `BTN_REASON_NOT_RESOLVED` (No resolvió el problema) - Orden 1
  - `BTN_REASON_HARD_TO_UNDERSTAND` (Fue difícil de entender) - Orden 2
  - `BTN_REASON_TOO_MANY_STEPS` (Demasiados pasos) - Orden 3
  - `BTN_REASON_WANTED_TECH` (Prefería hablar con un técnico) - Orden 4
  - `BTN_REASON_OTHER` (Otro motivo) - Orden 5

#### ENDED
- **Tipo**: Determinístico
- **Botones**: Ninguno (conversación finalizada)

### 2.3 Saneamiento de Botones

El sistema implementa un proceso de saneamiento en múltiples capas:

#### Capa 1: Contrato del Stage (STAGE_CONTRACT)
- Define `allowButtons`: Si el stage permite botones
- Define `allowedTokens`: Lista de tokens permitidos para ese stage
- Define `defaultButtons`: Botones por defecto (solo para stages determinísticos)

#### Capa 2: Función `sanitizeButtonsForStage()`
- Valida que el stage permita botones (`allowButtons === true`)
- Filtra botones que no estén en `allowedTokens`
- Normaliza formatos de botones entrantes
- Si es determinístico y quedó vacío, usa `defaultButtons`

#### Capa 3: Validación Final en `/api/chat`
- Verifica `allowButtons === false` y fuerza array vacío
- Aplica saneamiento antes de guardar en historial
- Convierte a formato legacy para frontend

#### Capa 4: Protección Específica en `generateAIResponse()`
- Para ASK_NEED, fuerza `buttons: []` incluso si la IA sugiere botones
- Respeta `allowedTokens` del contrato del stage

### 2.4 Formato de Botones

#### Formato Interno (en memoria y historial)
```javascript
{
  token: "BTN_XXX",
  label: "Etiqueta visible",
  order: 1
}
```

#### Formato Legacy (para frontend)
```javascript
{
  text: "Etiqueta visible",
  value: "BTN_XXX",
  label: "Etiqueta visible",
  order: 1
}
```

La conversión se realiza mediante `toLegacyButtons()` antes de enviar al frontend.

---

## 3. Flujo Detallado por Stage

### 3.1 ASK_LANGUAGE

**Propósito**: Consentimiento GDPR y selección de idioma.

**Flujo**:
1. Usuario ve mensaje bilingüe de consentimiento
2. Usuario hace clic en "Sí Acepto" (`si`) o "No Acepto" (`no`)
3. Si acepta: Se muestra selección de idioma
4. Usuario selecciona `BTN_LANG_ES_AR` o `BTN_LANG_EN`
5. Se guarda `session.userLocale` y avanza a `ASK_NAME`

**Botones**:
- Temporales: `si` / `no` (GDPR)
- Permanentes: `BTN_LANG_ES_AR` / `BTN_LANG_EN`

### 3.2 ASK_NAME

**Propósito**: Capturar nombre del usuario.

**Flujo**:
1. Usuario escribe su nombre (texto libre)
2. Sistema valida (2-30 caracteres)
3. Se guarda `session.userName`
4. Avanza a `ASK_USER_LEVEL`

**Botones**: Ninguno

### 3.3 ASK_USER_LEVEL

**Propósito**: Determinar nivel técnico para adaptar lenguaje.

**Flujo**:
1. Usuario selecciona nivel: `BTN_USER_LEVEL_BASIC`, `BTN_USER_LEVEL_INTERMEDIATE`, o `BTN_USER_LEVEL_ADVANCED`
2. Se guarda `session.userLevel` (basic/intermediate/advanced)
3. Avanza a `ASK_NEED`

**Botones**:
- `BTN_USER_LEVEL_BASIC`
- `BTN_USER_LEVEL_INTERMEDIATE`
- `BTN_USER_LEVEL_ADVANCED`

**Impacto**: El nivel afecta SOLO el lenguaje de las respuestas, NO el orden del diagnóstico.

### 3.4 ASK_NEED

**Propósito**: Pregunta abierta inicial (sin menú de opciones).

**Flujo**:
1. Usuario escribe libremente su necesidad/problema
2. Sistema guarda texto en `session.problem_raw`
3. Inmediatamente avanza a `ASK_PROBLEM` para validación

**Botones**: Ninguno (pregunta abierta)

**Protecciones**:
- `allowButtons: false` en contrato
- `allowedTokens: []` vacío
- Protección en `generateAIResponse` que fuerza array vacío
- Validación final que respeta `allowButtons === false`

### 3.5 ASK_PROBLEM

**Propósito**: Validar y clasificar el problema con OpenAI.

**Flujo**:
1. Sistema llama a OpenAI con timeout de 12 segundos
2. OpenAI analiza y retorna JSON con:
   - `valid`: Si es problema técnico válido
   - `intent`: Intent canónico (wont_turn_on, no_internet, slow, etc.)
   - `missing_device`: Si falta información del dispositivo
   - `missing_os`: Si falta información del OS (opcional)
   - `needs_clarification`: Si necesita más detalles
3. Si `missing_device === true`: Avanza a `ASK_DEVICE`
4. Si `missing_device === false`: Avanza a `DIAGNOSTIC_STEP`
5. Si OpenAI falla o hay timeout: Fallback a `ASK_DEVICE`

**Botones**: Ninguno mostrado al usuario (procesamiento interno)

**Timeout**: 12 segundos máximo

### 3.6 ASK_DEVICE

**Propósito**: Identificar tipo de dispositivo (obligatorio si falta).

**Flujo**:
1. Usuario selecciona: `BTN_DEVICE_DESKTOP`, `BTN_DEVICE_NOTEBOOK`, o `BTN_DEVICE_ALLINONE`
2. Se guarda `session.device_type` (desktop/notebook/allinone)
3. Avanza a `DIAGNOSTIC_STEP`

**Botones**:
- `BTN_DEVICE_DESKTOP`
- `BTN_DEVICE_NOTEBOOK`
- `BTN_DEVICE_ALLINONE`

### 3.7 ASK_OS

**Propósito**: Identificar sistema operativo (opcional, solo si realmente se necesita).

**Flujo**:
1. Usuario selecciona: `BTN_OS_WINDOWS`, `BTN_OS_MACOS`, `BTN_OS_LINUX`, o `BTN_OS_UNKNOWN`
2. Se guarda `session.os` (windows/macos/linux/unknown)
3. Avanza a `DIAGNOSTIC_STEP`

**Botones**:
- `BTN_OS_WINDOWS`
- `BTN_OS_MACOS`
- `BTN_OS_LINUX`
- `BTN_OS_UNKNOWN` (permite continuar sin conocer el OS)

### 3.8 DIAGNOSTIC_STEP

**Propósito**: Guiar al usuario paso a paso para resolver el problema.

**Flujo**:
1. Sistema carga historial como memoria
2. Extrae pasos ya ejecutados (para no repetir)
3. Si es primer paso (`executedSteps.length === 0`): Genera automáticamente
4. Si hay pasos y usuario hace clic en `BTN_PERSIST`: Genera siguiente paso
5. OpenAI genera paso con timeout de 12 segundos
6. Cada paso incluye:
   - Acción única a realizar
   - Explicación adaptada al nivel del usuario
   - Botones de resultado + ayuda + volver
7. Usuario hace clic en `BTN_SOLVED` o `BTN_PERSIST`
8. Si `BTN_SOLVED`: Avanza a `FEEDBACK_REQUIRED`
9. Si `BTN_PERSIST`: Genera siguiente paso (hasta límite)
10. Si se alcanza límite o 2 "BTN_PERSIST" seguidos: Avanza a `FEEDBACK_REQUIRED`

**Botones por Paso**:
- `BTN_SOLVED` (Listo, se arregló) - Orden 1
- `BTN_PERSIST` (Sigue igual) - Orden 2
- `BTN_HELP_CONTEXT` (¿Cómo hago esto?) - Orden 3
- `BTN_BACK` (Volver atrás) - Orden 4 (solo si hay pasos anteriores)

**Política de Pasos**:
- Máximo 5 pasos básicos (números 1-5)
- Máximo 5 pasos avanzados (números 6-10)
- Total máximo: 10 pasos

**Memoria**:
- Carga historial completo antes de generar cada paso
- No repite pasos ya ejecutados
- Reutiliza pasos anteriores cuando usuario hace clic en `BTN_BACK`

**Timeout**: 12 segundos máximo para generación de paso

### 3.9 FEEDBACK_REQUIRED

**Propósito**: Capturar feedback obligatorio antes de cerrar.

**Flujo**:
1. Usuario hace clic en `BTN_FEEDBACK_YES` o `BTN_FEEDBACK_NO`
2. Si `BTN_FEEDBACK_YES`: 
   - Se guarda `session.feedback = 'positive'`
   - Avanza a `ENDED`
3. Si `BTN_FEEDBACK_NO`:
   - Avanza a `FEEDBACK_REASON`

**Botones**:
- `BTN_FEEDBACK_YES` (👍 Sí, me sirvió)
- `BTN_FEEDBACK_NO` (👎 No, no me sirvió)

**Obligatoriedad**: Ningún chat se cierra sin pasar por este stage.

### 3.10 FEEDBACK_REASON

**Propósito**: Capturar motivo del feedback negativo.

**Flujo**:
1. Usuario selecciona motivo:
   - `BTN_REASON_NOT_RESOLVED`
   - `BTN_REASON_HARD_TO_UNDERSTAND`
   - `BTN_REASON_TOO_MANY_STEPS`
   - `BTN_REASON_WANTED_TECH`
   - `BTN_REASON_OTHER`
2. Se guarda `session.feedback = 'negative'` y `session.feedback_reason`
3. Avanza a `ENDED`

**Botones**:
- `BTN_REASON_NOT_RESOLVED`
- `BTN_REASON_HARD_TO_UNDERSTAND`
- `BTN_REASON_TOO_MANY_STEPS`
- `BTN_REASON_WANTED_TECH`
- `BTN_REASON_OTHER`

### 3.11 ENDED

**Propósito**: Conversación finalizada.

**Flujo**:
- No procesa más mensajes
- Guarda evento final en historial con metadata completa

**Botones**: Ninguno

---

## 4. Protecciones y Validaciones

### 4.1 Protección contra Reply Vacío

**Múltiples capas**:
1. Handlers nunca retornan `reply: ''` intencionalmente
2. Validación final antes de guardar turno: Si `reply` está vacío, se reemplaza por fallback
3. Log de advertencia cuando se detecta reply vacío

### 4.2 Protección contra Timeout de OpenAI

**Implementación**:
- Función `withTimeout()` envuelve todas las llamadas a OpenAI
- Timeout de 12 segundos para validación de problema
- Timeout de 12 segundos para generación de pasos de diagnóstico
- Si hay timeout: Fallback inmediato a selección de dispositivo

### 4.3 Protección contra Errores

**Try/Catch en handlers críticos**:
- `handleAskNeedStage`: Try/catch con fallback a `ASK_DEVICE`
- `handleAskProblemStage`: Try/catch con fallback a `ASK_DEVICE`
- `handleDiagnosticStepStage`: Try/catch con fallback a mensaje de error

**Try/Catch en endpoint principal**:
- `/api/chat` tiene try/catch global
- Si cualquier handler falla, se activa fallback absoluto
- Siempre se retorna JSON válido al frontend

### 4.4 Protección contra Botones No Permitidos

**Saneamiento en 4 capas**:
1. Contrato del stage define `allowedTokens`
2. `sanitizeButtonsForStage()` filtra botones no permitidos
3. Validación final respeta `allowButtons === false`
4. Protección específica en `generateAIResponse()` para ASK_NEED

---

## 5. Logs y Auditoría

### 5.1 Formato de Logs

Todos los logs incluyen `[sessionId]` para facilitar auditoría:

```
[HANDLER] [sessionId] Mensaje descriptivo
```

### 5.2 Logs por Handler

**ASK_NEED**:
- Texto recibido
- Avanzando a procesar

**ASK_PROBLEM**:
- Procesando problema (primeros 50 caracteres)
- Llamando a OpenAI con timeout 12s
- Análisis recibido (intent, missing_device, missing_os)
- Falta dispositivo / No falta dispositivo
- Usando fallback (si aplica)

**DIAGNOSTIC_STEP**:
- Iniciando (buttonToken, userText)
- Pasos ejecutados (cantidad)
- Llamando a OpenAI con timeout 12s para generar paso N
- Primer acceso, generando primer paso automáticamente
- Last turn reply vacío (si aplica)

**CHAT (endpoint principal)**:
- Procesando [STAGE]
- Error en [HANDLER]
- ⚠️ Reply vacío detectado
- ✅ Turno completado: stage_before → stage_after, reply length

### 5.3 Información Registrada

Cada turno guardado en historial incluye:
- `ts`: Timestamp ISO
- `sessionId`: ID único de la sesión
- `stage_before`: Stage antes del turno
- `stage_after`: Stage después del turno
- `user_event`: Entrada del usuario (texto o token de botón)
- `bot_reply`: Respuesta del bot (nunca vacía)
- `buttons_shown`: Botones mostrados (formato interno)
- `reason`: Razón del turno
- `violations`: Violaciones detectadas (si las hay)
- `diagnostic_step`: Información del paso de diagnóstico (si aplica)
- `metadata`: Metadata adicional (solo en evento final)

---

## 6. Resumen de Botones por Categoría

### 6.1 Botones de Navegación
- `BTN_BACK`: Volver atrás
- `BTN_CLOSE`: Cerrar chat
- `BTN_CONNECT_TECH`: Hablar con técnico

### 6.2 Botones de Idioma y Nivel
- `BTN_LANG_ES_AR`: Español (Argentina)
- `BTN_LANG_EN`: English
- `BTN_USER_LEVEL_BASIC`: Básico
- `BTN_USER_LEVEL_INTERMEDIATE`: Intermedio
- `BTN_USER_LEVEL_ADVANCED`: Avanzado

### 6.3 Botones de Dispositivo y OS
- `BTN_DEVICE_DESKTOP`: PC de escritorio
- `BTN_DEVICE_NOTEBOOK`: Notebook
- `BTN_DEVICE_ALLINONE`: All In One
- `BTN_OS_WINDOWS`: Windows
- `BTN_OS_MACOS`: macOS
- `BTN_OS_LINUX`: Linux
- `BTN_OS_UNKNOWN`: No lo sé

### 6.4 Botones de Diagnóstico
- `BTN_SOLVED`: Listo, se arregló
- `BTN_PERSIST`: Sigue igual
- `BTN_HELP_CONTEXT`: ¿Cómo hago esto?
- `BTN_ADVANCED_TESTS`: Pruebas avanzadas

### 6.5 Botones de Feedback
- `BTN_FEEDBACK_YES`: 👍 Sí, me sirvió
- `BTN_FEEDBACK_NO`: 👎 No, no me sirvió
- `BTN_REASON_NOT_RESOLVED`: No resolvió el problema
- `BTN_REASON_HARD_TO_UNDERSTAND`: Fue difícil de entender
- `BTN_REASON_TOO_MANY_STEPS`: Demasiados pasos
- `BTN_REASON_WANTED_TECH`: Prefería hablar con un técnico
- `BTN_REASON_OTHER`: Otro motivo

### 6.6 Botones DEPRECATED (No se usan)
- `BTN_PROBLEMA`
- `BTN_CONSULTA`
- `BTN_NO_ENCIENDE`
- `BTN_NO_INTERNET`
- `BTN_LENTITUD`
- `BTN_BLOQUEO`
- `BTN_PERIFERICOS`
- `BTN_VIRUS`

---

## 7. Estadísticas del Sistema

- **Total de stages**: 11
- **Stages determinísticos**: 8
- **Stages gobernados por IA**: 3
- **Total de botones únicos**: 25
- **Botones activos**: 17
- **Botones deprecated**: 8
- **Stages con botones**: 8
- **Stages sin botones**: 3 (ASK_NAME, ASK_NEED, ENDED)
- **Timeout OpenAI**: 12 segundos
- **Máximo pasos de diagnóstico**: 10 (5 básicos + 5 avanzados)

---

**Última actualización**: Basado en `server.js` v8 (Híbrido + Escalable) con sistema de diagnóstico paso a paso y protecciones contra reply vacío y timeout.

