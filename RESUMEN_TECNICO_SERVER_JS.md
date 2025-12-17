# Resumen Técnico: server.js - Sistema Híbrido de Diagnóstico STI Chat

## 1. Arquitectura General

### 1.1 Estructura Modular

El archivo `server.js` implementa un servidor Express.js que orquesta un sistema de chat de soporte técnico híbrido. La arquitectura se organiza en los siguientes módulos funcionales:

#### 1.1.1 Módulo de Configuración y Constantes
- Define variables de entorno (puerto, tokens, directorios de datos)
- Configura instancia de OpenAI (opcional, puede funcionar sin IA)
- Establece directorios para conversaciones, tickets y logs
- Gestiona registro de IDs únicos (AA0000-ZZ9999)

#### 1.1.2 Módulo de Gestión de IDs Únicos
- Sistema de registro de IDs usados para evitar duplicados
- Generación de IDs con formato AA0000-ZZ9999 (dos letras sin Ñ + cuatro dígitos)
- Persistencia del registro en archivo JSON
- Verificación de disponibilidad de IDs

#### 1.1.3 Módulo de Persistencia de Conversaciones
- Guardado de turnos en formato JSONL (un objeto JSON por línea)
- Cada turno incluye: timestamp, stages (before/after), evento del usuario, respuesta del bot, botones mostrados, razón, violaciones, pasos de diagnóstico y metadata
- Función de carga de historial completo para uso como memoria operativa
- Extracción de pasos de diagnóstico ejecutados para evitar repeticiones

#### 1.1.4 Módulo de Contrato de Stages (STAGE_CONTRACT)
- Define la estructura y comportamiento de cada stage del flujo
- Para cada stage especifica: tipo (DETERMINISTIC o AI_GOVERNED), si permite botones, tokens permitidos, botones por defecto, y prompts
- Funciona como fuente única de verdad para validaciones

#### 1.1.5 Módulo de Catálogo de Botones (BUTTON_CATALOG)
- Define todos los botones disponibles con etiquetas bilingües (español/inglés)
- Incluye botones de dispositivo, OS, feedback, ayuda contextual y navegación
- Se utiliza para generar etiquetas según el idioma del usuario

#### 1.1.6 Módulo de Saneamiento de Botones
- Valida que los botones sugeridos por la IA estén permitidos para el stage actual
- Normaliza formatos de botones entrantes
- Filtra botones no autorizados
- Convierte a formato legacy para compatibilidad con frontend

#### 1.1.7 Módulo de Respuesta de IA (generateAIResponse)
- Genera respuestas usando OpenAI cuando está disponible
- Adapta el lenguaje según el nivel técnico del usuario (básico/intermedio/avanzado)
- Proporciona contexto sobre botones permitidos y reglas de formato
- Implementa fallback cuando OpenAI no está disponible

#### 1.1.8 Módulo de Handlers de Stages Determinísticos
- `handleAskLanguageStage`: Maneja consentimiento GDPR y selección de idioma
- `handleAskNameStage`: Captura y valida nombre del usuario
- `handleAskUserLevelStage`: Captura nivel técnico (básico/intermedio/avanzado)
- `handleAskNeedStage`: Procesa pregunta abierta inicial
- `handleAskProblemStage`: Valida descripción del problema con OpenAI
- `handleAskDeviceStage`: Captura tipo de dispositivo
- `handleAskOsStage`: Captura sistema operativo (opcional)
- `handleDiagnosticStepStage`: Orquesta diagnóstico paso a paso
- `handleFeedbackRequiredStage`: Gestiona feedback obligatorio
- `handleFeedbackReasonStage`: Captura motivo del feedback negativo

#### 1.1.9 Módulo de Endpoints Express
- `/api/health`: Health check del servidor
- `/api/greeting`: Crea sesión inicial y presenta consentimiento GDPR
- `/api/chat`: Endpoint principal que procesa mensajes y botones
- `/api/historial/:sessionId`: Entrega historial para panel admin
- `/api/reset`: Resetea sesión

### 1.2 Orquestación del Flujo

El flujo se orquesta a través del endpoint `/api/chat`, que:

1. Recibe el mensaje del usuario (texto o botón clickeado)
2. Identifica el stage actual de la sesión
3. Selecciona el handler correspondiente según el stage
4. El handler procesa la entrada y determina la respuesta y el próximo stage
5. Los botones se sanean según el contrato del stage
6. Se guarda el turno completo en el historial (JSONL)
7. Se retorna la respuesta al frontend con botones en formato legacy

El sistema mantiene el estado de la sesión en memoria (Map), incluyendo: ID, stage actual, idioma, nombre, nivel técnico, consentimiento GDPR, tipo de dispositivo, OS, problema validado, intent detectado, feedback y otras propiedades necesarias.

---

## 2. Sistema Híbrido Implementado

### 2.1 Puntos de Consulta a OpenAI

El sistema consulta a OpenAI en los siguientes momentos:

#### 2.1.1 Validación de Descripción del Problema (ASK_PROBLEM)
- **Cuándo**: Después de que el usuario describe su problema
- **Qué se envía**: Descripción textual del problema
- **Qué se solicita**: Análisis JSON con:
  - `valid`: Si es un problema técnico válido
  - `intent`: Intent canónico (wont_turn_on, no_internet, slow, freezes, peripherals, virus, general_question, etc.)
  - `missing_device`: Si falta información del tipo de dispositivo
  - `missing_os`: Si falta información del OS (opcional, solo si realmente se necesita)
  - `needs_clarification`: Si el problema necesita más detalles
- **Decisión local**: El backend decide si avanzar a ASK_DEVICE, ASK_OS, o iniciar diagnóstico basándose en el análisis

#### 2.1.2 Generación de Pasos de Diagnóstico (DIAGNOSTIC_STEP)
- **Cuándo**: Cuando se necesita generar un nuevo paso de diagnóstico
- **Qué se envía**: 
  - Descripción del problema
  - Tipo de dispositivo
  - OS (si está disponible)
  - Lista de pasos anteriores ejecutados
  - Nivel técnico del usuario
  - Número de paso actual (básico o avanzado)
- **Qué se solicita**: Objeto JSON con:
  - `action`: Una sola acción que el usuario debe realizar
  - `explanation`: Explicación breve de por qué este paso es necesario, adaptada al nivel del usuario
- **Decisión local**: El backend estructura el mensaje, genera los botones correspondientes y guarda el paso en el historial

#### 2.1.3 Ayuda Contextual (BTN_HELP_CONTEXT)
- **Cuándo**: Cuando el usuario solicita ayuda sobre el paso actual
- **Qué se envía**: Acción del paso actual y nivel técnico del usuario
- **Qué se solicita**: Instrucciones detalladas para realizar la acción, adaptadas al nivel
- **Decisión local**: El backend NO avanza el flujo, solo proporciona ayuda adicional sobre el paso actual

### 2.2 Decisiones Locales (sin OpenAI)

Las siguientes decisiones se toman localmente sin consultar a OpenAI:

- **Stages determinísticos**: ASK_LANGUAGE, ASK_NAME, ASK_USER_LEVEL, ASK_DEVICE, ASK_OS, FEEDBACK_REQUIRED, FEEDBACK_REASON
- **Transiciones de stage**: El backend decide el próximo stage según el resultado de los handlers
- **Validación de botones**: Solo se permiten botones autorizados según el contrato del stage
- **Política de límites**: El backend cuenta pasos ejecutados y determina cuándo recomendar técnico
- **Detección de repetición**: El backend identifica si un paso similar ya fue ejecutado usando el historial
- **Formato de respuesta**: El backend estructura respuestas, botones y metadata sin consultar IA

### 2.3 Evitar Repetición de Consultas usando Historial

El sistema implementa las siguientes estrategias para evitar repetir consultas:

1. **Carga de Historial como Memoria**: Antes de generar un nuevo paso de diagnóstico, se carga todo el historial de la conversación y se extraen los pasos ya ejecutados.

2. **Verificación de Pasos Existentes**: La función `getExecutedDiagnosticSteps()` extrae todos los pasos de diagnóstico guardados en el historial, incluyendo su ID, acción, número de paso y timestamp.

3. **Lógica de Generación Condicional**: El sistema solo genera un nuevo paso si:
   - Es el primer paso (no hay pasos ejecutados)
   - El usuario hizo clic en "BTN_PERSIST" (sigue igual), indicando que necesita el siguiente paso
   - Si hay pasos ejecutados y el usuario no hizo clic en un botón de resultado, se muestra el último paso nuevamente en lugar de generar uno nuevo

4. **Reutilización de Pasos Anteriores**: Cuando el usuario hace clic en "BTN_BACK" (volver atrás), el sistema busca el paso anterior en el historial y lo reutiliza sin generar una nueva consulta a OpenAI.

5. **Registro de Pasos**: Cada paso generado se guarda en el historial con un ID único, número de paso, acción y explicación, permitiendo identificar qué pasos ya fueron presentados al usuario.

---

## 3. Manejo de Estado y Memoria

### 3.1 Contenido del Historial

Cada turno guardado en el historial (formato JSONL) contiene:

- `ts`: Timestamp ISO del turno
- `sessionId`: ID único de la sesión
- `stage_before`: Stage antes de procesar el turno
- `stage_after`: Stage después de procesar el turno
- `user_event`: Entrada del usuario (texto o token de botón)
- `bot_reply`: Respuesta del bot
- `buttons_shown`: Array de botones mostrados (formato interno: token, label, order)
- `reason`: Razón del turno (user_interaction, error, etc.)
- `violations`: Array de violaciones detectadas (si las hay)
- `diagnostic_step`: Objeto con información del paso de diagnóstico (si aplica):
  - `step_id`: ID único del paso
  - `step_number`: Número del paso (1-5 para básicos, 6-10 para avanzados)
  - `action`: Acción a realizar
  - `explanation`: Explicación del paso
  - `is_basic`: Si es paso básico o avanzado
- `metadata`: Objeto con información adicional (solo en evento final):
  - `result`: Resultado del feedback (positive/negative/unknown)
  - `feedback_reason`: Motivo del feedback negativo (si aplica)
  - `problem`: Descripción del problema
  - `device_type`: Tipo de dispositivo
  - `os`: Sistema operativo
  - `user_level`: Nivel técnico del usuario
  - `diagnostic_steps_count`: Cantidad de pasos ejecutados
  - `ended_at`: Timestamp de finalización

### 3.2 Reutilización de Pasos Anteriores

El sistema reutiliza pasos anteriores en dos escenarios:

1. **Botón "Volver Atrás" (BTN_BACK)**:
   - El sistema busca en el historial el paso anterior al actual
   - Encuentra el turn correspondiente usando el step_id
   - Retorna la misma respuesta (bot_reply) y botones (buttons_shown) del paso anterior
   - NO genera nueva consulta a OpenAI
   - NO avanza el contador de pasos

2. **Mostrar Paso Actual Nuevamente**:
   - Si el usuario envía texto sin hacer clic en un botón de resultado, y ya existe un paso ejecutado, el sistema muestra el último paso nuevamente
   - Esto permite al usuario releer las instrucciones sin avanzar

### 3.3 Funcionamiento de "Volver Atrás"

El mecanismo de "volver atrás" funciona de la siguiente manera:

1. El sistema carga el historial completo de la conversación
2. Extrae todos los pasos de diagnóstico ejecutados en orden cronológico
3. Si hay al menos 2 pasos ejecutados, el usuario puede volver al paso anterior
4. Al hacer clic en "BTN_BACK", el sistema:
   - Identifica el paso actual (último en la lista)
   - Selecciona el paso anterior (penúltimo)
   - Busca en el historial el turn que contiene ese paso anterior
   - Retorna exactamente la misma respuesta y botones de ese turn
   - NO modifica el contador de pasos (el número de paso sigue siendo el mismo)
   - NO genera nueva consulta a OpenAI

Este mecanismo permite al usuario revisar pasos anteriores sin consumir nuevos pasos del límite y sin generar costos adicionales de OpenAI.

---

## 4. Stages Principales y su Rol

### 4.1 ASK_NAME

**Propósito**: Capturar el nombre del usuario.

**Comportamiento**:
- Stage determinístico (no usa IA)
- No muestra botones (solo input de texto)
- Valida que el nombre tenga entre 2 y 30 caracteres
- Guarda el nombre en `session.userName`
- Avanza automáticamente a ASK_USER_LEVEL después de capturar un nombre válido

**Validación**: Extrae el primer token del texto ingresado como nombre.

### 4.2 ASK_USER_LEVEL

**Propósito**: Determinar el nivel técnico del usuario para adaptar el lenguaje.

**Comportamiento**:
- Stage determinístico (no usa IA)
- Muestra 3 botones: Básico, Intermedio, Avanzado
- Guarda el nivel en `session.userLevel` (basic/intermediate/advanced)
- El nivel afecta SOLO el lenguaje de las respuestas, NO el orden del diagnóstico
- Avanza a ASK_NEED después de seleccionar nivel

**Impacto**: El nivel se utiliza en todas las consultas posteriores a OpenAI para adaptar el lenguaje:
- Básico: Lenguaje simple, paso a paso, sin jerga técnica
- Intermedio: Términos técnicos comunes, detalle moderado
- Avanzado: Lenguaje técnico preciso, directo al grano

### 4.3 ASK_NEED

**Propósito**: Pregunta abierta inicial para conocer la necesidad del usuario.

**Comportamiento**:
- Stage gobernado por IA, pero sin botones (pregunta abierta)
- NO muestra botones de problemas típicos (BTN_PROBLEMA, BTN_CONSULTA, etc.)
- El usuario debe describir libremente su necesidad
- Guarda la descripción en `session.problem_raw`
- Avanza automáticamente a ASK_PROBLEM después de recibir texto

**Diseño**: Se eligió pregunta abierta para no limitar al usuario a opciones predefinidas y permitir que OpenAI detecte el intent real del problema.

### 4.4 Selección de Dispositivo (ASK_DEVICE)

**Propósito**: Identificar el tipo de dispositivo afectado.

**Comportamiento**:
- Stage determinístico (no usa IA)
- Muestra 3 botones: PC de escritorio, Notebook, All In One
- Obligatorio: NO se inicia diagnóstico antes de este paso
- Se activa solo si OpenAI detecta que falta información del dispositivo en la descripción del problema
- Guarda el tipo en `session.device_type` (desktop/notebook/allinone)
- Avanza a DIAGNOSTIC_STEP después de seleccionar dispositivo

**Validación**: Acepta selección por botón o por texto (reconocimiento simple de palabras clave).

### 4.5 Diagnóstico Paso a Paso (DIAGNOSTIC_STEP)

**Propósito**: Guiar al usuario paso a paso para resolver el problema.

**Comportamiento**:
- Stage gobernado por IA para generar pasos
- Carga el historial como memoria antes de generar cada paso
- Solo genera nuevo paso si: es el primero, o el usuario hizo clic en "BTN_PERSIST"
- Cada paso incluye:
  - Instrucción principal (una sola acción)
  - Explicación adaptada al nivel del usuario
  - Botones de resultado: "Listo, se arregló" (BTN_SOLVED), "Sigue igual" (BTN_PERSIST)
  - Botón de ayuda contextual: "¿Cómo hago esto?" (BTN_HELP_CONTEXT)
  - Botón "Volver atrás" (BTN_BACK) si hay pasos anteriores
- Guarda cada paso en el historial con ID único y número de paso
- Detecta límites de pasos y dos "Sigue igual" seguidos para recomendar técnico
- Avanza a FEEDBACK_REQUIRED cuando el problema se resuelve o se alcanza el límite

**Política de Pasos**:
- Máximo 5 pasos básicos (números 1-5)
- Máximo 5 pasos avanzados (números 6-10)
- Si se alcanzan ambos límites, se recomienda técnico
- Si hay 2 "BTN_PERSIST" seguidos, se recomienda técnico

### 4.6 Selección de OS (ASK_OS)

**Propósito**: Identificar el sistema operativo cuando realmente se necesita.

**Comportamiento**:
- Stage determinístico (no usa IA)
- Muestra 4 botones: Windows, macOS, Linux, "No lo sé"
- OPCIONAL: NO bloquea el flujo si no se conoce el OS
- Solo se pregunta cuando OpenAI determina que realmente se necesita para el siguiente paso
- El botón "No lo sé" guarda `os = unknown` y permite continuar
- Guarda el OS en `session.os` (windows/macos/linux/unknown)
- Avanza a DIAGNOSTIC_STEP después de seleccionar OS (o unknown)

**Filosofía**: El OS no es obligatorio porque el usuario puede estar usando otro dispositivo o no conocerlo, y el diagnóstico debe poder avanzar de todas formas.

### 4.7 Cierre y Feedback (FEEDBACK_REQUIRED / FEEDBACK_REASON)

**Propósito**: Capturar feedback obligatorio antes de cerrar el chat.

**Comportamiento**:
- Stage FEEDBACK_REQUIRED: Muestra botones "👍 Sí, me sirvió" y "👎 No, no me sirvió"
- Si el usuario selecciona positivo: guarda feedback positivo y cierra inmediatamente
- Si el usuario selecciona negativo: avanza a FEEDBACK_REASON
- Stage FEEDBACK_REASON: Muestra opciones de motivo:
  - No resolvió el problema
  - Fue difícil de entender
  - Demasiados pasos
  - Prefería hablar con un técnico
  - Otro motivo
- Guarda feedback y motivo en la sesión
- Cierra el chat con stage ENDED
- Guarda evento final en historial con metadata completa

**Obligatoriedad**: Ningún chat se cierra sin pasar por feedback. El sistema siempre presenta estos botones antes de finalizar, ya sea porque el problema se resolvió o porque se alcanzó el límite de pasos.

---

## 5. Política de Límites

### 5.1 Cantidad Máxima de Pasos

El sistema implementa límites estrictos para prevenir loops infinitos y optimizar recursos:

- **Pasos Básicos**: Máximo 5 pasos (números 1-5)
- **Pasos Avanzados**: Máximo 5 pasos (números 6-10)
- **Total Máximo**: 10 pasos de diagnóstico por conversación

El sistema cuenta los pasos ejecutados cargando el historial y extrayendo los pasos de diagnóstico. Cada paso tiene un número secuencial que indica si es básico (≤5) o avanzado (>5).

### 5.2 Cuándo se Recomienda Técnico

El sistema recomienda hablar con un técnico en los siguientes casos:

1. **Límite de Pasos Alcanzado**:
   - Si se ejecutaron 5 pasos básicos Y 5 pasos avanzados (10 pasos totales)
   - El sistema detecta esto contando pasos en el historial y comparando con los límites

2. **Dos "Sigue Igual" Seguidos**:
   - Si el usuario hace clic en "BTN_PERSIST" (Sigue igual) dos veces consecutivas
   - El sistema revisa los últimos dos turnos en el historial para detectar este patrón
   - Indica que el problema no se está resolviendo con los pasos propuestos

Cuando se detecta alguna de estas condiciones, el sistema:
- Muestra un mensaje recomendando hablar con un técnico
- Avanza inmediatamente a FEEDBACK_REQUIRED (no permite más pasos)
- NO genera nuevos pasos de diagnóstico

### 5.3 Cuándo se Permite Cerrar el Chat

El chat se puede cerrar (stage ENDED) en los siguientes escenarios:

1. **Feedback Positivo**: Cuando el usuario selecciona "👍 Sí, me sirvió" en FEEDBACK_REQUIRED
2. **Feedback Negativo Completado**: Cuando el usuario selecciona un motivo en FEEDBACK_REASON después de dar feedback negativo

El sistema NO permite cerrar el chat sin pasar por el flujo de feedback. Esto asegura que todas las conversaciones tengan un resultado explícito (positivo o negativo) para medición y mejora.

Antes de cerrar, el sistema guarda un evento final en el historial con metadata completa que incluye: resultado del feedback, motivo (si aplica), problema, dispositivo, OS, nivel del usuario, cantidad de pasos ejecutados y timestamp de finalización.

---

## 6. Sistema de Feedback (👍 / 👎)

### 6.1 Cuándo Aparece el Feedback

El sistema de feedback aparece de manera obligatoria en los siguientes momentos:

1. **Problema Resuelto**: Cuando el usuario hace clic en "BTN_SOLVED" (Listo, se arregló) durante un paso de diagnóstico
2. **Límite de Pasos Alcanzado**: Cuando se alcanzan 10 pasos de diagnóstico (5 básicos + 5 avanzados)
3. **Dos "Sigue Igual" Seguidos**: Cuando el usuario indica dos veces consecutivas que el problema persiste

En todos estos casos, el sistema NO cierra el chat inmediatamente. En su lugar, avanza a FEEDBACK_REQUIRED y presenta los botones de feedback.

### 6.2 Qué se Guarda

Cuando el usuario completa el feedback, el sistema guarda la siguiente información:

**En la Sesión (memoria)**:
- `session.feedback`: Valor "positive" o "negative"
- `session.feedback_reason`: Motivo del feedback negativo (null si es positivo)

**En el Historial (persistencia)**:
En el último turn antes de cerrar (stage ENDED), se guarda un objeto `metadata` completo:
- `result`: "positive", "negative", o "unknown"
- `feedback_reason`: Motivo específico si es negativo:
  - "not_resolved": No resolvió el problema
  - "hard_to_understand": Fue difícil de entender
  - "too_many_steps": Demasiados pasos
  - "wanted_tech": Prefería hablar con un técnico
  - "other": Otro motivo
- `problem`: Descripción original del problema
- `device_type`: Tipo de dispositivo usado
- `os`: Sistema operativo (o "unknown")
- `user_level`: Nivel técnico del usuario (basic/intermediate/advanced)
- `diagnostic_steps_count`: Cantidad total de pasos ejecutados
- `ended_at`: Timestamp ISO de finalización

### 6.3 Impacto en Medición y Mejora Futura

El sistema de feedback está diseñado para proporcionar datos estructurados que permiten:

1. **Medición de Efectividad**:
   - Calcular tasa de resolución (feedback positivo vs negativo)
   - Identificar problemas que no se resuelven (motivo "not_resolved")
   - Medir complejidad percibida (motivo "hard_to_understand" o "too_many_steps")

2. **Análisis de Flujo**:
   - Correlacionar cantidad de pasos con satisfacción
   - Identificar si problemas específicos requieren más pasos
   - Detectar si ciertos niveles de usuario tienen más dificultades

3. **Mejora de Prompts**:
   - Los datos de feedback pueden usarse para ajustar los prompts de OpenAI
   - Identificar pasos que generan confusión (feedback negativo con razón específica)
   - Optimizar explicaciones según el nivel técnico del usuario

4. **Optimización de Límites**:
   - Los datos de "too_many_steps" pueden indicar si los límites son adecuados
   - El conteo de pasos ejecutados permite analizar si se necesita ajustar la política

5. **Detección de Patrones**:
   - Los datos completos permiten análisis cross-tab (problema × dispositivo × OS × nivel × resultado)
   - Identificar combinaciones problemáticas que requieren atención

El sistema garantiza que TODAS las conversaciones tengan feedback, proporcionando un dataset completo para análisis estadísticos sin sesgo de selección (todas las conversaciones tienen resultado, no solo las que terminan naturalmente).

---

## Conclusión

El sistema implementado en `server.js` es un sistema híbrido que combina lógica determinística para flujos controlados con inteligencia artificial para generación de contenido adaptativo. Utiliza el historial como memoria operativa para evitar repeticiones y optimizar recursos. Implementa límites estrictos y feedback obligatorio para garantizar calidad y proporcionar datos para mejora continua.

La arquitectura modular permite mantener separadas las responsabilidades, facilitando mantenimiento y extensión futura. El sistema está diseñado para ser auditable (todo queda registrado en historial) y medible (feedback estructurado obligatorio).

