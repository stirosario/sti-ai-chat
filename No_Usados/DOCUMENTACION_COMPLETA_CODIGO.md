# DOCUMENTACIÓN COMPLETA DEL CÓDIGO - server.js

## ÍNDICE
1. [Estructura General](#estructura-general)
2. [Imports y Configuración](#imports-y-configuración)
3. [Funciones Críticas del Flujo](#funciones-críticas-del-flujo)
4. [Handlers de Stages](#handlers-de-stages)
5. [Sistema de Botones](#sistema-de-botones)
6. [Sistema de Sesiones](#sistema-de-sesiones)
7. [Endpoints API](#endpoints-api)

---

## ESTRUCTURA GENERAL

El archivo `server.js` es el corazón del sistema Tecnos. Contiene:

- **Servidor Express**: Maneja todas las requests HTTP
- **Flujo Conversacional**: 6 etapas principales (ASK_LANGUAGE → ASK_NAME → ASK_USER_LEVEL → ASK_NEED → ASK_DEVICE → BASIC_TESTS)
- **Sistema de Sesiones**: Guarda y carga el estado de cada conversación
- **Sistema de Botones**: Define y procesa todos los botones interactivos
- **Integración OpenAI**: Genera respuestas técnicas inteligentes
- **Sistema de Tickets**: Crea tickets cuando se necesita escalar a técnico humano

---

## IMPORTS Y CONFIGURACIÓN

### Librerías Externas

**express**: Framework web para Node.js
- ✅ SE PUEDE MODIFICAR: Versión de Express (pero mantener compatibilidad)
- ❌ NO MODIFICAR: La estructura básica de la app Express

**cors**: Permite requests desde el frontend
- ✅ SE PUEDE MODIFICAR: Orígenes permitidos (ALLOWED_ORIGINS)
- ❌ NO MODIFICAR: Debe estar habilitado o el frontend no funcionará

**rateLimit**: Protege contra abuso
- ✅ SE PUEDE MODIFICAR: Límites (100/15min, 50/5min, etc.)
- ❌ NO MODIFICAR: Debe estar activo en producción

**helmet**: Headers de seguridad HTTP
- ✅ SE PUEDE MODIFICAR: Configuración de CSP
- ❌ NO MODIFICAR: Debe estar activo en producción

**pino**: Logger de alto rendimiento
- ✅ SE PUEDE MODIFICAR: Nivel de log (info, debug, warn, error)
- ❌ NO MODIFICAR: Estructura básica del logger

**openai**: Cliente de OpenAI API
- ✅ SE PUEDE MODIFICAR: Modelo (gpt-4o-mini, gpt-4, etc.)
- ❌ NO MODIFICAR: Timeout de 30s (crítico para no bloquear)

---

## FUNCIONES CRÍTICAS DEL FLUJO

### 1. `changeStage(session, newStage)`

**PROPÓSITO**: Controla TODAS las transiciones de estado en el flujo conversacional.

**CUÁNDO SE USA**: Cada vez que se necesita cambiar el stage de la sesión.

**QUÉ PREVIENE**:
- Transiciones inválidas (ej: ASK_LANGUAGE → BASIC_TESTS sin pasar por etapas intermedias)
- Estados inexistentes o corruptos
- Retrocesos sin justificación

**QUÉ SE PUEDE MODIFICAR**:
- Los mensajes de log cuando hay transición inválida
- La lógica de detección de retrocesos

**QUÉ NO SE DEBE MODIFICAR**:
- La validación de transiciones válidas (VALID_TRANSITIONS)
- La validación de estados existentes (STATES)
- El retorno de false cuando la transición es inválida

**DEPENDENCIAS**:
- `STATES`: Define todos los estados posibles
- `VALID_TRANSITIONS`: Define qué transiciones están permitidas
- Si modificas STATES, DEBES actualizar VALID_TRANSITIONS también

**UBICACIÓN**: Línea ~2442

---

### 2. `faltanDatosMinimos(session, caseType, locale)`

**PROPÓSITO**: Valida que la sesión tenga los datos mínimos necesarios antes de generar pasos de diagnóstico.

**CUÁNDO SE USA**:
- Antes de generar pasos en `handleAskDeviceStage()`
- Antes de regenerar pasos en `handleBasicTestsStage()`
- Cuando se necesita validar contexto mínimo para un tipo de caso específico

**QUÉ PREVIENE**:
- Mostrar pasos sin saber el sistema operativo (cuando es requerido)
- Generar diagnósticos sin tipo de dispositivo
- Dar instrucciones genéricas cuando se necesita información específica

**QUÉ SE PUEDE MODIFICAR**:
- Los mensajes de las preguntas que se hacen al usuario
- Los requisitos mínimos por tipo de caso
- Agregar nuevos tipos de casos

**QUÉ NO SE DEBE MODIFICAR**:
- La estructura del objeto retornado `{ missing, questions }`
- La lógica que determina qué datos son obligatorios vs opcionales
- Debe retornar siempre un objeto, nunca null o undefined

**DEPENDENCIAS**:
- `session.contextMinima`: Objeto que contiene el contexto mínimo validado
- Si modificas los requisitos, DEBES actualizar donde se construye `contextMinima`

**UBICACIÓN**: Línea ~5017

---

### 3. `shouldAsk(questionKey, session)`

**PROPÓSITO**: Evita preguntar al usuario información que ya se obtuvo previamente.

**CUÁNDO SE USA**: Antes de hacer cualquier pregunta al usuario.

**QUÉ PREVIENE**:
- Preguntar el SO si ya está en `session.os`
- Preguntar el dispositivo si ya está en `session.device`
- Repetir preguntas ya respondidas

**QUÉ SE PUEDE MODIFICAR**:
- La lógica de detección de si ya se tiene la respuesta
- Agregar más tipos de preguntas al switch

**QUÉ NO SE DEBE MODIFICAR**:
- Debe retornar boolean (true = preguntar, false = no preguntar)
- Debe verificar `diagnosis.preguntasRealizadas` antes de retornar

**DEPENDENCIAS**:
- `ensureDiagnosisStructure(session)`: Asegura que existe la estructura de diagnóstico
- `registerQuestionAsked()`: Registra cuando se hace una pregunta
- Si modificas la lógica, DEBES actualizar `registerQuestionAsked()` también

**UBICACIÓN**: Línea ~1562

---

### 4. `shouldExplainStep(stepId, session)`

**PROPÓSITO**: Evita explicar el mismo paso múltiples veces al usuario.

**CUÁNDO SE USA**: Antes de generar explicación detallada de un paso (BTN_HELP_STEP_X).

**QUÉ PREVIENE**:
- Explicar el mismo paso varias veces en la misma sesión
- Generar respuestas repetitivas que frustran al usuario

**QUÉ SE PUEDE MODIFICAR**:
- La lógica de cuándo se considera que ya fue explicado
- Permitir re-explicar si el contexto cambió significativamente

**QUÉ NO SE DEBE MODIFICAR**:
- Debe retornar boolean (true = explicar, false = no explicar)
- Debe verificar `diagnosis.pasos.explicados` antes de retornar

**DEPENDENCIAS**:
- `ensureDiagnosisStructure(session)`: Asegura que existe la estructura de diagnóstico
- `registerStepExplained()`: Registra cuando se explica un paso
- Si modificas la lógica, DEBES actualizar `registerStepExplained()` también

**UBICACIÓN**: Línea ~1505

---

## HANDLERS DE STAGES

### `handleAskLanguageStage()`

**PROPÓSITO**: Primera etapa del flujo. Muestra política de privacidad (GDPR) y permite seleccionar idioma.

**FLUJO**:
1. Si no hay sesión o está en ASK_LANGUAGE, mostrar GDPR
2. Si usuario acepta (buttonToken='si'), mostrar botones de idioma
3. Si usuario selecciona idioma, guardar en sesión y avanzar a ASK_NAME
4. Si usuario rechaza (buttonToken='no'), cerrar chat

**QUÉ SE PUEDE MODIFICAR**:
- El texto de la política de privacidad
- Los mensajes de respuesta
- Los botones mostrados

**QUÉ NO SE DEBE MODIFICAR**:
- Debe avanzar a ASK_NAME después de seleccionar idioma
- Debe guardar `session.userLocale` antes de avanzar
- Debe usar `changeStage()` para cambiar de estado

**DEPENDENCIAS**:
- `buildLanguageSelectionGreeting()`: Genera el mensaje inicial
- `changeStage()`: Cambia el estado de la sesión
- Si modificas el flujo, DEBES actualizar `VALID_TRANSITIONS` también

**UBICACIÓN**: Línea ~2685

---

### `handleAskNameStage()`

**PROPÓSITO**: Segunda etapa. Pide el nombre del usuario y valida que sea válido.

**FLUJO**:
1. Si no hay nombre, pedirlo
2. Validar que el nombre sea válido (2-20 caracteres, solo letras)
3. Si es válido, guardar y avanzar a ASK_USER_LEVEL
4. Si no es válido, pedir de nuevo (máximo 5 intentos)

**QUÉ SE PUEDE MODIFICAR**:
- Las reglas de validación del nombre
- Los mensajes de error
- El límite de intentos (MAX_NAME_ATTEMPTS)

**QUÉ NO SE DEBE MODIFICAR**:
- Debe avanzar a ASK_USER_LEVEL después de obtener nombre válido
- Debe guardar `session.userName` antes de avanzar
- Debe usar `changeStage()` para cambiar de estado

**DEPENDENCIAS**:
- `validateUserText()`: Valida el texto del nombre
- `changeStage()`: Cambia el estado de la sesión
- Si modificas la validación, DEBES actualizar `validateUserText()` también

**UBICACIÓN**: Línea ~3575

---

### `handleAskUserLevelStage()`

**PROPÓSITO**: Tercera etapa. Pide el nivel de experiencia del usuario (básico, intermedio, avanzado).

**FLUJO**:
1. Mostrar botones de nivel de usuario
2. Si usuario selecciona nivel, guardar en `session.userLevel`
3. Avanzar a ASK_NEED

**QUÉ SE PUEDE MODIFICAR**:
- Los textos de los botones de nivel
- La lógica de detección desde texto libre

**QUÉ NO SE DEBE MODIFICAR**:
- Debe avanzar a ASK_NEED después de seleccionar nivel
- Debe guardar `session.userLevel` ('basic', 'intermediate', 'advanced')
- Debe usar `changeStage()` para cambiar de estado

**DEPENDENCIAS**:
- `changeStage()`: Cambia el estado de la sesión
- Si modificas los niveles, DEBES actualizar `getUserLevel()` también

**UBICACIÓN**: Línea ~3935

---

### `handleAskNeedStage()`

**PROPÓSITO**: Cuarta etapa. Pide al usuario que describa su problema.

**FLUJO**:
1. Mostrar botones de problemas frecuentes
2. Si usuario selecciona problema o lo escribe, guardar en `session.problem`
3. Avanzar a ASK_DEVICE

**QUÉ SE PUEDE MODIFICAR**:
- Los botones de problemas frecuentes
- El mapeo de texto libre a problemas
- Los mensajes de respuesta

**QUÉ NO SE DEBE MODIFICAR**:
- Debe avanzar a ASK_DEVICE después de detectar problema
- Debe guardar `session.problem` y `session.problemToken` antes de avanzar
- Debe usar `changeStage()` para cambiar de estado
- NO debe activar `allowWhatsapp` en esta etapa (guard rail)

**DEPENDENCIAS**:
- `getProblemFromButton()`: Mapea tokens de botones a problemas
- `changeStage()`: Cambia el estado de la sesión
- Si modificas los problemas, DEBES actualizar `getProblemFromButton()` también

**UBICACIÓN**: Línea ~4414

---

### `handleAskDeviceStage()`

**PROPÓSITO**: Quinta etapa. Pide el tipo de dispositivo y genera los pasos de diagnóstico.

**FLUJO**:
1. Mostrar botones de dispositivos (PC escritorio, PC All-in-One, Notebook)
2. Si usuario selecciona dispositivo, guardar en `session.device` y `session.pcType`
3. Validar datos mínimos con `faltanDatosMinimos()`
4. Si faltan datos, pedirlos antes de generar pasos
5. Generar pasos de diagnóstico con `generateDiagnosticSteps()`
6. Avanzar a BASIC_TESTS

**QUÉ SE PUEDE MODIFICAR**:
- Los botones de dispositivos
- La lógica de generación de pasos
- Los mensajes de respuesta

**QUÉ NO SE DEBE MODIFICAR**:
- Debe validar datos mínimos ANTES de generar pasos
- Debe avanzar a BASIC_TESTS después de generar pasos
- Debe guardar `session.device` y `session.pcType` antes de avanzar
- Debe usar `changeStage()` para cambiar de estado

**DEPENDENCIAS**:
- `faltanDatosMinimos()`: Valida datos mínimos
- `getDeviceFromButton()`: Mapea tokens de botones a dispositivos
- `generateDiagnosticSteps()`: Genera los pasos de diagnóstico
- `changeStage()`: Cambia el estado de la sesión
- Si modificas la validación, DEBES actualizar `faltanDatosMinimos()` también

**UBICACIÓN**: Línea ~6038

---

### `handleBasicTestsStage()`

**PROPÓSITO**: Sexta etapa (principal). Muestra pasos de diagnóstico y procesa interacciones del usuario.

**FLUJO COMPLEJO**:
1. Si no hay pasos, regenerarlos
2. Mostrar pasos pendientes (no confirmados)
3. Procesar interacciones:
   - BTN_CLOSE: Cerrar chat (con feedback si no se registró)
   - BTN_BACK_TO_STEPS: Volver a mostrar pasos
   - BTN_HELP_STEP_X: Explicar paso específico
   - BTN_SOLVED: Problema resuelto, mostrar feedback
   - BTN_PERSIST: Problema persiste, escalar si hay frustración
   - BTN_FEEDBACK_*: Guardar feedback y cerrar
   - Preguntas técnicas: Usar OpenAI para responder

**QUÉ SE PUEDE MODIFICAR**:
- Los mensajes de respuesta
- La lógica de escalación
- Los pasos mostrados

**QUÉ NO SE DEBE MODIFICAR**:
- Debe validar datos mínimos ANTES de regenerar pasos
- Debe filtrar pasos confirmados (no mostrarlos de nuevo)
- Debe usar `changeStage()` para cambiar de estado
- NO debe activar `allowWhatsapp` sin frustración real (guard rail)

**DEPENDENCIAS**:
- `faltanDatosMinimos()`: Valida datos mínimos
- `generateDiagnosticSteps()`: Genera los pasos
- `filterCompletedSteps()`: Filtra pasos confirmados
- `changeStage()`: Cambia el estado de la sesión
- `generateTechnicalResponse()`: Genera respuestas técnicas con OpenAI
- Si modificas la lógica, DEBES actualizar todas las dependencias también

**UBICACIÓN**: Línea ~7161

---

## SISTEMA DE BOTONES

### `EMBEDDED_CHAT.ui.buttons`

**PROPÓSITO**: Define TODOS los botones que el sistema puede usar.

**ESTRUCTURA**:
```javascript
{
  token: 'BTN_XXX',      // ID interno del botón (NO cambiar sin actualizar referencias)
  label: 'Texto visible', // Texto que ve el usuario
  text: 'texto interno',  // Texto que se procesa como si el usuario lo escribió
  status: 'active'        // 'active', 'legacy', o 'disabled'
}
```

**CLASIFICACIÓN**:
- **ACTIVOS**: Botones con handler implementado y en uso
- **LEGACY**: Botones antiguos (deprecated, usar versión nueva)
- **DESACTIVADOS**: Botones sin handler, NO se muestran al usuario

**QUÉ SE PUEDE MODIFICAR**:
- Agregar nuevos botones (pero actualizar todos los lugares que los usan)
- Cambiar las etiquetas (label) y textos (text)
- Cambiar el status de un botón

**QUÉ NO SE DEBE MODIFICAR**:
- Los tokens (value) sin actualizar TODOS los lugares que los usan
- La estructura del objeto (token, label, text, status)
- Si cambias un token, DEBES buscar y reemplazar en TODO el código

**DEPENDENCIAS**:
- `getButtonDefinition()`: Busca definición por token
- `buildUiButtonsFromTokens()`: Construye botones desde tokens
- Todos los handlers que procesan botones
- Si modificas un token, DEBES actualizar TODAS las referencias

**UBICACIÓN**: Línea ~3079

---

### `buildUiButtonsFromTokens(tokens, locale)`

**PROPÓSITO**: Construye un array de botones desde tokens.

**FLUJO**:
1. Recibe array de tokens (ej: ['BTN_YES', 'BTN_NO'])
2. Busca definición de cada botón en EMBEDDED_CHAT
3. Filtra botones DESACTIVADOS (status: 'disabled')
4. Convierte botones LEGACY a versión nueva
5. Retorna array de objetos { token, label, text }

**QUÉ SE PUEDE MODIFICAR**:
- El formato del objeto retornado (pero mantener token, label, text)
- Agregar más campos al objeto (description, example, etc.)

**QUÉ NO SE DEBE MODIFICAR**:
- Debe retornar un array de objetos
- Cada objeto debe tener al menos { token, label, text }
- NO debe incluir botones DESACTIVADOS
- NO debe incluir botones LEGACY (debe convertirlos)

**DEPENDENCIAS**:
- `getButtonDefinition()`: Busca definición de botón
- `EMBEDDED_CHAT.ui.buttons`: Fuente de verdad de botones
- Si modificas el formato, DEBES actualizar el frontend también

**UBICACIÓN**: Línea ~3214

---

## SISTEMA DE SESIONES

### `saveSession(sessionId, session)`

**PROPÓSITO**: Guarda una sesión en el sistema de archivos.

**FLUJO**:
1. Validar parámetros (sessionId y session)
2. Si es simulación, usar prefijo SIM_ y guardar en archivo separado
3. Construir ruta: `/data/transcripts/{sessionId}.json`
4. Guardar como JSON con formato legible

**QUÉ SE PUEDE MODIFICAR**:
- El formato del archivo (JSON, pero podría ser otro)
- La ubicación del archivo (TRANSCRIPTS_DIR)

**QUÉ NO SE DEBE MODIFICAR**:
- Debe guardar la sesión de forma persistente
- Debe respetar el modo simulación (prefijo SIM_)
- Debe usar operación asíncrona (fs.promises.writeFile)

**DEPENDENCIAS**:
- `TRANSCRIPTS_DIR`: Directorio donde se guardan las sesiones
- Si modificas la ubicación, DEBES actualizar `getSession()` también

**UBICACIÓN**: Línea ~2040

---

### `getSession(sessionId)`

**PROPÓSITO**: Carga una sesión desde el sistema de archivos.

**FLUJO**:
1. Validar sessionId
2. Construir ruta: `/data/transcripts/{sessionId}.json`
3. Verificar si el archivo existe
4. Leer y parsear JSON
5. Retornar sesión o null si no existe

**QUÉ SE PUEDE MODIFICAR**:
- El formato del archivo o la ubicación
- La lógica de validación

**QUÉ NO SE DEBE MODIFICAR**:
- Debe retornar null si la sesión no existe
- Debe usar operación asíncrona (fs.promises.readFile)

**DEPENDENCIAS**:
- `TRANSCRIPTS_DIR`: Directorio donde se guardan las sesiones
- Si modificas la ubicación, DEBES actualizar `saveSession()` también

**UBICACIÓN**: Línea ~2127

---

## ENDPOINTS API

### `POST /api/chat`

**PROPÓSITO**: Endpoint principal del chat. Procesa mensajes del usuario y retorna respuestas del bot.

**FLUJO**:
1. Obtener o crear sessionId
2. Cargar sesión existente o crear nueva
3. Validar userText y buttonToken
4. Normalizar texto del usuario
5. Determinar stage actual y llamar handler correspondiente
6. Guardar sesión actualizada
7. Retornar respuesta con reply, buttons, stage, etc.

**QUÉ SE PUEDE MODIFICAR**:
- Los mensajes de error
- La lógica de normalización de texto
- Los headers de respuesta

**QUÉ NO SE DEBE MODIFICAR**:
- Debe retornar objeto con { ok, reply, stage, buttons, ... }
- Debe guardar la sesión después de procesar
- Debe usar los handlers de stages correspondientes
- Debe aplicar rate limiting (chatRateLimiter)

**DEPENDENCIAS**:
- Todos los handlers de stages
- `getSession()` y `saveSession()`
- `validateUserText()` y `normalizeTextForTranscript()`
- Si modificas el formato de respuesta, DEBES actualizar el frontend también

**UBICACIÓN**: Línea ~10981

---

## REGLAS CRÍTICAS

### Guard Rails (Protecciones)

1. **Modo Simulación**: Si `session.simulation === true`, NO debe afectar datos de producción
2. **Rate Limiting**: Debe estar activo en producción para prevenir abuso
3. **Validación de Transiciones**: Solo transiciones válidas en `VALID_TRANSITIONS`
4. **Datos Mínimos**: Validar con `faltanDatosMinimos()` antes de generar pasos
5. **Escalación Prematura**: NO activar `allowWhatsapp` sin frustración real

### Dependencias Críticas

Si modificas:
- **STATES**: Debes actualizar `VALID_TRANSITIONS` también
- **Tokens de botones**: Debes buscar y reemplazar en TODO el código
- **Formato de sesión**: Debes actualizar `saveSession()` y `getSession()` también
- **Handlers de stages**: Debes actualizar `/api/chat` también

---

## FIN DE LA DOCUMENTACIÓN

Para más detalles, consulta los comentarios inline en el código fuente.

