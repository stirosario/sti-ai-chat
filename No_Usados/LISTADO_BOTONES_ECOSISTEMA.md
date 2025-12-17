# 📋 Listado Completo de Botones del Ecosistema del Chat

**Fecha de actualización**: 2025-01-XX  
**Objetivo**: Documentar todos los botones del sistema, su ubicación, función y descripción visible para el usuario.

---

## 📍 Ubicación de Definiciones

Los botones están definidos principalmente en:
- **`server.js`** (líneas 1457-1514): Definición de tokens y etiquetas en `EMBEDDED_CHAT.ui.buttons`
- **Handlers especializados**: `handlers/basicTestsHandler.js`, `handlers/escalateHandler.js`, `handlers/advancedTestsHandler.js`, `handlers/deviceHandler.js`

---

## 🔘 Botones por Categoría

### 1. Botones de Idioma

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_LANG_ES_AR` | `server.js:1460` | Seleccionar español de Argentina | 🇦🇷 Español (Argentina) |
| `BTN_LANG_EN` | `server.js:1461` | Seleccionar inglés | 🇬🇧 English |

**Handler**: `handleAskLanguageStage()` en `handlers/stageHandlers.js`

**Nota**: `BTN_LANG_ES_ES` fue eliminado ya que no se utilizaba en el flujo actual. Solo se usan `BTN_LANG_ES_AR` y `BTN_LANG_EN`.

---

### 2. Botones de Dispositivo

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_DEV_PC_DESKTOP` | `server.js:1507` | Seleccionar PC de escritorio | 🖥️ PC de escritorio |
| `BTN_DEV_PC_ALLINONE` | `server.js:1508` | Seleccionar PC All-in-One | 🖥️ PC All in One |
| `BTN_DEV_NOTEBOOK` | `server.js:1509` | Seleccionar Notebook | 💼 Notebook |

**Handlers**: 
- `handleDeviceStage()` en `handlers/deviceHandler.js`
- `src/core/integrationPatch.js` (detección inteligente de dispositivos)

**Nota**: Los botones `BTN_DESKTOP`, `BTN_ALLINONE`, `BTN_NOTEBOOK` (líneas 1476-1478) son legacy y están deshabilitados.

---

### 3. Botones de Sistema Operativo (Instalaciones)

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_OS_WINDOWS` | `server.js:1295` | Seleccionar Windows para instalación | 🪟 Windows |
| `BTN_OS_MACOS` | `server.js:1296` | Seleccionar macOS para instalación | 🍏 macOS |
| `BTN_OS_LINUX` | `server.js:1297` | Seleccionar Linux para instalación | 🐧 Linux |

**Handler**: `server.js:5931-5963` (selección de OS en flujo de instalación)

---

### 4. Botones de Acción Principal (Diagnóstico)

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_SOLVED` | `server.js:1479` | Confirmar que el problema se solucionó | 👍 Ya lo solucioné |
| `BTN_PERSIST` | `server.js:1480` | Indicar que el problema persiste | ❌ Todavía no funciona |

**Handlers**:
- `handlers/basicTestsHandler.js:218-256` (BTN_SOLVED)
- `handlers/basicTestsHandler.js:257-270` (BTN_PERSIST)
- `handlers/escalateHandler.js` (ambos botones)
- `handlers/advancedTestsHandler.js` (ambos botones)

---

### 5. Botones de Pruebas Avanzadas

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_ADVANCED_TESTS` | `server.js:1483` | Solicitar pruebas avanzadas | 🔬 Pruebas Avanzadas |
| `BTN_MORE_TESTS` | `server.js:1484` | Solicitar más pruebas | 🔍 Más pruebas |

**Handlers**:
- `handlers/basicTestsHandler.js:194-216` (transición a pruebas avanzadas)
- `handlers/escalateHandler.js` (cuando el problema persiste)

---

### 6. Botones de Ayuda por Paso

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_HELP_STEP_0` | Generado dinámicamente | Ayuda para paso 1 | 🆘🛠️ Ayuda paso 1️⃣ |
| `BTN_HELP_STEP_1` | Generado dinámicamente | Ayuda para paso 2 | 🆘🛠️ Ayuda paso 2️⃣ |
| `BTN_HELP_STEP_2` | Generado dinámicamente | Ayuda para paso 3 | 🆘🛠️ Ayuda paso 3️⃣ |
| `BTN_HELP_STEP_3` | Generado dinámicamente | Ayuda para paso 4 | 🆘🛠️ Ayuda paso 4️⃣ |
| `BTN_HELP_STEP_X` | Generado dinámicamente | Ayuda para paso X | 🆘🛠️ Ayuda paso X️⃣ |

**Handler**: `handlers/basicTestsHandler.js:54-138` (generación de explicación con IA)

**Nota**: Los botones `BTN_HELP_1`, `BTN_HELP_2`, `BTN_HELP_3`, `BTN_HELP_4` (líneas 1487-1490) son legacy y están deshabilitados.

---

### 7. Botones de Instalación/Configuración

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_SUCCESS` | `server.js:1515` | Confirmar que la instalación funcionó | ✅ Funcionó |
| `BTN_NEED_HELP` | `server.js:1516` | Solicitar ayuda con la instalación | ❓ Necesito ayuda |
| `BTN_YES` | `server.js:1517` | Confirmar (para guías de instalación) | ✅ Sí |
| `BTN_NO` | `server.js:1518` | Negar (para guías de instalación) | ❌ No |

**Handlers**:
- `server.js:5965-6004` (BTN_SUCCESS, BTN_NEED_HELP en instalaciones)
- `handlers/basicTestsHandler.js:146-185` (BTN_YES, BTN_NO para guías de instalación)

---

### 8. Botones de Escalación y Técnico

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_CONNECT_TECH` | `server.js:1494` | Conectar con un técnico | 👨‍🏭 Conectar con Técnico |
| `BTN_WHATSAPP_TECNICO` | `server.js:1495` | Hablar con técnico por WhatsApp | 💚 Hablar con un Técnico |
| `BTN_TECH` | `server.js:1485` | Técnico real (legacy) | 🧑‍💻 Técnico real |

**Handlers**:
- `server.js:4158-4347` (`createTicketAndRespond()`)
- `handlers/escalateHandler.js` (cuando el problema persiste)
- `handlers/basicTestsHandler.js:270-272` (BTN_CONNECT_TECH)

---

### 9. Botones de Navegación y Conversación

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_BACK_TO_STEPS` | `server.js:1510` | Volver a mostrar los pasos principales | ⏪ Volver a los pasos |
| `BTN_BACK` | `server.js:1511` | Volver a la respuesta anterior | ⏪ Volver atrás |
| `BTN_CHANGE_TOPIC` | `server.js:1512` | Cambiar de tema en la conversación | 🔄 Cambiar de tema |
| `BTN_MORE_INFO` | `server.js:1513` | Solicitar más información | ℹ️ Más información |

**Handlers**:
- `handlers/basicTestsHandler.js:49-51` (BTN_BACK_TO_STEPS)
- `server.js:5682-5796` (BTN_BACK - lógica de transcript)
- `server.js:5850-5929` (BTN_CHANGE_TOPIC, BTN_MORE_INFO)

---

### 10. Botones de Cierre y Finalización

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_CLOSE` | `server.js:1492` | Cerrar el chat | 🔚 Cerrar Chat |
| `BTN_CANCEL` | `server.js:1497` | Cancelar una acción | Cancelar ❌ |

**Handlers**: Múltiples ubicaciones según el contexto (finalización de conversación, cancelación de tickets, etc.)

---

### 11. Botones de Problemas Frecuentes

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_NO_ENCIENDE` | `server.js:1498` | Seleccionar problema: equipo no enciende | 🔌 El equipo no enciende |
| `BTN_NO_INTERNET` | `server.js:1499` | Seleccionar problema: sin conexión a Internet | 📡 Problemas de conexión a Internet |
| `BTN_LENTITUD` | `server.js:1500` | Seleccionar problema: lentitud del sistema | 🐢 Lentitud del sistema operativo o del equipo |
| `BTN_BLOQUEO` | `server.js:1501` | Seleccionar problema: bloqueo de programas | ❄️ Bloqueo o cuelgue de programas |
| `BTN_PERIFERICOS` | `server.js:1502` | Seleccionar problema: periféricos externos | 🖨️ Problemas con periféricos externos |
| `BTN_VIRUS` | `server.js:1503` | Seleccionar problema: infecciones de malware | 🛡️ Infecciones de malware o virus |

**Handler**: `src/core/integrationPatch.js:77-110` (procesa botones en stage `ASK_NEED`)

**Cuándo se muestran**: Después de que el usuario proporciona su nombre, cuando Tecnos pregunta "¿En qué puedo ayudarte hoy?". Se muestran como opciones rápidas para facilitar la selección del problema.

**Funcionalidad**: Al hacer clic en cualquiera de estos botones, se guarda automáticamente el problema correspondiente en `session.problem` y el sistema continúa con el flujo normal (detección de dispositivo, generación de pasos de diagnóstico, etc.).

---

### 12. Botones de Acción Adicional (Legacy - Parcialmente Usados)

| Token | Archivo | Función | Descripción Usuario |
|-------|---------|---------|---------------------|
| `BTN_REPHRASE` | `server.js:1490` | Reformular el problema | Cambiar problema |
| `BTN_WHATSAPP` | `server.js:1493` | Enviar por WhatsApp | Enviar WhatsApp |
| `BTN_CONFIRM_TICKET` | `server.js:1496` | Confirmar generación de ticket | Sí, generar ticket ✅ |

**Estado**: ⚠️ **Algunos tienen handlers, otros no** - Revisar uso específico en el código.

**Nota**: `BTN_MORE_SIMPLE` fue eliminado ya que no tenía handler implementado y no se utilizaba en el flujo actual.

---

## 📊 Resumen por Estado

### ✅ Botones con Handlers Completos (40)
- Todos los botones de idioma (2)
- Todos los botones de dispositivo (3)
- Botones de sistema operativo (3)
- Botones de acción principal (2)
- Botones de pruebas avanzadas (2)
- Botones de ayuda por paso (dinámicos)
- Botones de instalación (4)
- Botones de escalación (2)
- Botones de navegación (4)
- Botones de cierre (2)
- **Botones de problemas frecuentes (6)** - ✅ **Implementados**

### ⚠️ Botones con Handlers Parciales o Sin Uso (14)
- Botones legacy/duplicados (6) - Parcialmente usados
- Botones de acción adicional (8) - Algunos sin handlers

**Nota**: `BTN_CONFIRM`, `BTN_EDIT` y `BTN_MORE` fueron eliminados ya que no tenían handlers implementados y no se utilizaban en el flujo actual. `BTN_MORE` era un duplicado de `BTN_MORE_TESTS`.

---

## 🔍 Búsqueda de Handlers

Para encontrar el handler de un botón específico, buscar en el código:
```javascript
// Patrón común de búsqueda
if (buttonToken === 'BTN_XXX') { ... }
// O
buttonToken === 'BTN_XXX' || /regex/.test(text)
```

---

## 📝 Notas Importantes

1. **Botones Dinámicos**: Los botones `BTN_HELP_STEP_X` se generan dinámicamente según la cantidad de pasos en `session.tests.basic` o `session.tests.advanced`.

2. **Botones Legacy**: Algunos botones están definidos pero no se usan activamente porque el sistema inteligente maneja esas funcionalidades automáticamente.

3. **Etiquetas Multilenguaje**: Las etiquetas de los botones se adaptan según `session.userLocale` usando `buildUiButtonsFromTokens()`.

4. **Funciones Helper**: 
   - `buildUiButtonsFromTokens()`: Construye botones desde tokens
   - `getButtonDefinition()`: Obtiene la definición de un botón
   - `getDeviceButtonLabel()`: Obtiene etiqueta de dispositivo según idioma

---

**Última revisión**: 2025-01-XX  
**Mantenido por**: Sistema de auditoría de botones

