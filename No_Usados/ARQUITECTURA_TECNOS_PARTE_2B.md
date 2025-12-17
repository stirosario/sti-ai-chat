# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 2B)

**Fecha:** 6 de diciembre de 2025  
**Complemento de:** ARQUITECTURA_TECNOS_PARTE_1.md, ARQUITECTURA_TECNOS_PARTE_2A.md  
**Enfoque:** Máquina de Estados Avanzada

---

## 6. Máquina de Estados Avanzada

### 6.1 CLASSIFY_NEED

**Qué lo activa:**
- Usuario responde a la pregunta "¿En qué puedo ayudarte?"
- Transición automática desde `ASK_NEED` cuando el sistema inteligente está habilitado

**Archivo que lo maneja:**
- `src/core/intelligentChatHandler.js` (función `handleIntelligentChat`)
- `src/core/intentEngine.js` (función `analyzeIntent`)

**Qué hace el bot:**
- Analiza el mensaje del usuario con OpenAI para detectar la intención (problema técnico, instalación, consulta general)
- Clasifica automáticamente sin preguntar "¿es problema o consulta?"
- Transiciona a `ASK_PROBLEM` si detecta problema técnico
- Transiciona a `ASK_HOWTO_DETAILS` si detecta solicitud de instalación/configuración

---

### 6.2 ASK_DEVICE

**Qué lo activa:**
- Usuario menciona dispositivo ambiguo ("mi compu", "el equipo")
- Sistema detecta que necesita aclaración de tipo de dispositivo

**Archivo que lo maneja:**
- `server.js` (líneas 6700+)

**Qué hace el bot:**
- Muestra botones para aclarar tipo de dispositivo:
  - PC de escritorio
  - PC All in One
  - Notebook
- Guarda `session.device` y `session.pcType`
- Transiciona a `ASK_PROBLEM` o genera pasos diagnósticos

---

### 6.3 ASK_PROBLEM

**Qué lo activa:**
- Usuario selecciona "🔧 Solucionar / Diagnosticar Problema"
- Sistema inteligente detecta intent `INTENT_TYPES.TECHNICAL_PROBLEM`

**Archivo que lo maneja:**
- `server.js` (líneas 6011-6150)

**Qué hace el bot:**
- Pregunta "¿Qué problema tenés?" si no hay problema registrado
- Ofrece botones de problemas frecuentes (no enciende, sin internet, lentitud, etc.)
- Guarda `session.problem` con la descripción del usuario
- Si hay imagen, llama a OpenAI Vision para analizar el problema
- Transiciona a `BASIC_TESTS` para generar pasos diagnósticos

---

### 6.4 DETECT_DEVICE

**Qué lo activa:**
- Sistema detecta que el dispositivo mencionado es ambiguo
- Mensaje del usuario contiene términos como "compu", "equipo", "máquina"

**Archivo que lo maneja:**
- `src/utils/deviceDetection.js` (función `detectAmbiguousDevice`)
- `server.js` (integración con lógica de detección)

**Qué hace el bot:**
- Analiza el mensaje con regex y patrones para detectar tipo de dispositivo
- Marca `session.pendingDeviceGroup` si necesita aclaración
- Transiciona a `ASK_DEVICE` si la detección es ambigua
- Si detecta dispositivo claramente, lo guarda y continúa al siguiente estado

---

### 6.5 ASK_HOWTO_DETAILS

**Qué lo activa:**
- Sistema inteligente detecta intent `INTENT_TYPES.INSTALLATION_HELP` o `INTENT_TYPES.CONFIGURATION_HELP`
- Usuario quiere instalar/configurar algo pero no especificó OS o modelo

**Archivo que lo maneja:**
- `server.js` (líneas 6555-6680)

**Qué hace el bot:**
- Pregunta "¿Qué sistema operativo y modelo de dispositivo tenés?"
- Parsea la respuesta del usuario para extraer OS (Windows 10/11, macOS, Linux) y modelo
- Guarda `session.userOS` y `session.deviceModel`
- Llama a OpenAI para generar guía paso a paso personalizada
- Transiciona a `BASIC_TESTS` (reutiliza el flujo de pasos)

---

### 6.6 GENERATE_HOWTO

**Qué lo activa:**
- Estado intermedio después de recibir detalles en `ASK_HOWTO_DETAILS`
- No es un estado explícito en el código, es parte del procesamiento

**Archivo que lo maneja:**
- `server.js` (dentro del handler de `ASK_HOWTO_DETAILS`, líneas 6590-6650)

**Qué hace el bot:**
- Genera prompt para OpenAI con OS y modelo específicos
- Solicita guía con 5-8 pasos concretos
- Formatea respuesta con enlaces oficiales si aplica
- Muestra guía completa al usuario con botones "Funcionó" / "No funcionó"

---

### 6.7 BASIC_TESTS

**Qué lo activa:**
- Transición automática desde `ASK_PROBLEM` después de recopilar problema y dispositivo
- Usuario describe problema y el sistema genera pasos diagnósticos

**Archivo que lo maneja:**
- `server.js` (función `generateAndShowSteps`, líneas 4369-4480)
- `server.js` (función `aiQuickTests`, líneas 1943+)

**Qué hace el bot:**
- Genera 3-4 pasos básicos de diagnóstico usando OpenAI (o playbooks locales)
- Muestra pasos numerados con emojis
- Ofrece botones de ayuda por cada paso individual
- Guarda `session.tests.basic` con los pasos generados
- Espera respuesta del usuario: "Funcionó ✔️" o "Persiste ❌"
- Si funcionó → transiciona a `ENDED`
- Si persiste → transiciona a `ADVANCED_TESTS` o `ESCALATE`

---

### 6.8 ADVANCED_TESTS

**Qué lo activa:**
- Usuario hace clic en "🔬 Pruebas Avanzadas"
- Usuario indica que los pasos básicos no solucionaron el problema

**Archivo que lo maneja:**
- `server.js` (líneas 6035-6120, 7078-7150)

**Qué hace el bot:**
- Llama a `aiQuickTests()` pasando los pasos básicos ya probados para evitar repeticiones
- Filtra pasos avanzados para que no repitan los básicos (comparación normalizada)
- Genera 4 pasos más específicos y técnicos
- Guarda `session.tests.advanced`
- Ofrece botones: "Funcionó ✔️", "Persiste ❌", "Conectar con Técnico"
- Si no hay pasos nuevos distintos → transiciona directamente a `ESCALATE`

---

### 6.9 ESCALATE

**Qué lo activa:**
- Usuario hace clic en "🚀 Hablar con Técnico"
- Todas las pruebas fallaron y no hay más pasos avanzados disponibles
- Sistema detecta frustración o problema complejo que requiere humano

**Archivo que lo maneja:**
- `server.js` (líneas 7078-7160)

**Qué hace el bot:**
- Ofrece dos opciones:
  1. "Más pruebas" → genera `ADVANCED_TESTS` adicionales
  2. "Conectar con técnico" → crea ticket y link WhatsApp
- Si usuario elige técnico → transiciona a `CREATE_TICKET`
- Si no quedan más pruebas → fuerza transición a `CREATE_TICKET`

---

### 6.10 CREATE_TICKET

**Qué lo activa:**
- Usuario confirma que quiere hablar con técnico humano
- Usuario hace clic en "💚 Hablar con un técnico por WhatsApp"

**Archivo que lo maneja:**
- `server.js` (función `createTicketAndRespond`, líneas 4130-4250)
- `server.js` (endpoint `/api/whatsapp-ticket`, líneas 3217-3350)

**Qué hace el bot:**
- Genera ID único de ticket: `TCK-YYYYMMDD-XXXX` (con crypto.randomBytes)
- Recopila todo el historial de conversación con `maskPII()` para ocultar datos sensibles
- Guarda ticket en `/data/tickets/` en formato `.txt` y `.json`
- Construye mensaje de WhatsApp con:
  - Ticket ID
  - Resumen del problema
  - Dispositivo y OS detectados
  - Historial completo de la conversación
  - Link al ticket público
- Genera URL de WhatsApp: `https://wa.me/5493417422422?text=...`
- Transiciona a `TICKET_SENT`

---

### 6.11 TICKET_SENT

**Qué lo activa:**
- Inmediatamente después de crear ticket exitosamente
- Usuario recibe link de WhatsApp

**Archivo que lo maneja:**
- `server.js` (dentro de `createTicketAndRespond`, líneas 4250+)

**Qué hace el bot:**
- Muestra mensaje de confirmación: "✅ Ticket creado: TCK-XXXXXXXX"
- Provee botón con link de WhatsApp prellenado con toda la información
- Informa al usuario que el técnico ya tiene el contexto completo
- Ofrece opción de cerrar el chat
- Marca `session.stage = STATES.TICKET_SENT`

---

### 6.12 ENDED

**Qué lo activa:**
- Usuario confirma que el problema se solucionó ("Funcionó ✔️")
- Usuario cierra el chat explícitamente
- Ticket de WhatsApp fue enviado exitosamente

**Archivo que lo maneja:**
- `server.js` (múltiples ubicaciones: líneas 5430, 6221, 7042, 7203)

**Qué hace el bot:**
- Muestra mensaje de cierre personalizado con nombre del usuario
- Agradece por usar el servicio
- Informa que puede volver a abrir el chat si el problema reaparece
- Marca `session.waEligible = false` (no elegible para más tickets)
- Guarda `session.stage = STATES.ENDED`
- No ofrece más opciones (conversación terminada)

---

## Diagrama de Transiciones Simplificado

```
ASK_NEED
    ↓
CLASSIFY_NEED (análisis OpenAI)
    ↓
    ├─→ ASK_PROBLEM (si es problema técnico)
    │       ↓
    │   [¿dispositivo ambiguo?]
    │       ↓
    │   ASK_DEVICE (aclarar tipo)
    │       ↓
    │   BASIC_TESTS (generar pasos)
    │       ↓
    │   [¿funcionó?]
    │       ├─→ ENDED (✔️ sí)
    │       └─→ ADVANCED_TESTS (❌ no)
    │               ↓
    │           [¿funcionó?]
    │               ├─→ ENDED (✔️ sí)
    │               └─→ ESCALATE (❌ no)
    │                       ↓
    │                   CREATE_TICKET
    │                       ↓
    │                   TICKET_SENT
    │                       ↓
    │                   ENDED
    │
    └─→ ASK_HOWTO_DETAILS (si es instalación/config)
            ↓
        GENERATE_HOWTO (generar guía OpenAI)
            ↓
        BASIC_TESTS (mostrar pasos)
            ↓
        [¿funcionó?]
            ├─→ ENDED (✔️ sí)
            └─→ ESCALATE (❌ no)
```

---

**PARTE 2B COMPLETA**
