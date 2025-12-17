# Lista Completa de Botones en server.js

## Resumen General

Este documento lista todos los botones definidos en `server.js`, su funcionalidad, en qué stage se usan, y sus propiedades.

---

## 1. Botones de Consentimiento GDPR (Especiales)

Estos botones NO están en el catálogo `BUTTON_CATALOG` porque son temporales y solo aparecen en el stage `ASK_LANGUAGE` antes de que el usuario acepte los términos.

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `si` | Sí Acepto ✔️ | Yes, I Accept ✔️ | `ASK_LANGUAGE` | Determinístico | 1 | Acepta los términos de privacidad y continúa al flujo de selección de idioma |
| `no` | No Acepto ❌ | No, I Do Not Accept ❌ | `ASK_LANGUAGE` | Determinístico | 2 | Rechaza los términos y termina la conversación |

**Detalles:**
- Aparecen en el mensaje inicial de GDPR (antes de seleccionar idioma)
- Bilingües: el mismo botón muestra ambos idiomas
- Si el usuario acepta (`si`), se guarda `session.gdprConsent = true` y se muestran los botones de idioma
- Si el usuario rechaza (`no`), se termina la conversación

---

## 2. Botones de Idioma (ASK_LANGUAGE)

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `BTN_LANG_ES_AR` | 🇦🇷 Español (Argentina) | 🇦🇷 Español (Argentina) | `ASK_LANGUAGE` | Determinístico | 1 | Selecciona español argentino como idioma del usuario y avanza a `ASK_NAME` |
| `BTN_LANG_EN` | 🇬🇧 English | 🇬🇧 English | `ASK_LANGUAGE` | Determinístico | 2 | Selecciona inglés como idioma del usuario y avanza a `ASK_NAME` |

**Detalles:**
- Definidos en `STAGE_CONTRACT.ASK_LANGUAGE.defaultButtons`
- Son botones **determinísticos**: siempre aparecen en este stage
- El token se guarda en `session.userLocale` (`'es-AR'` o `'en-US'`)
- Después de seleccionar idioma, el sistema avanza al stage `ASK_NAME`

---

## 3. Botones de Nivel de Usuario (ASK_USER_LEVEL)

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `BTN_USER_LEVEL_BASIC` | Básico | Basic | `ASK_USER_LEVEL` | Determinístico | 1 | Marca al usuario como nivel básico y ajusta las explicaciones del bot a lenguaje simple |
| `BTN_USER_LEVEL_INTERMEDIATE` | Intermedio | Intermediate | `ASK_USER_LEVEL` | Determinístico | 2 | Marca al usuario como nivel intermedio y ajusta las explicaciones a términos técnicos comunes |
| `BTN_USER_LEVEL_ADVANCED` | Avanzado | Advanced | `ASK_USER_LEVEL` | Determinístico | 3 | Marca al usuario como nivel avanzado y ajusta las explicaciones a lenguaje técnico y preciso |

**Detalles:**
- Definidos en `STAGE_CONTRACT.ASK_USER_LEVEL.defaultButtons`
- Son botones **determinísticos**: siempre aparecen en este stage
- El token se guarda en `session.userLevel` (`'basic'`, `'intermediate'`, o `'advanced'`)
- Después de seleccionar nivel, el sistema avanza al stage `ASK_NEED`
- El nivel afecta el prompt de la IA:
  - **Básico**: lenguaje simple, guía paso a paso, sin jerga técnica
  - **Intermedio**: términos técnicos comunes, detalle moderado
  - **Avanzado**: lenguaje técnico preciso, directo al grano

---

## 4. Botones de Necesidad/Consulta (ASK_NEED)

Estos botones pueden ser sugeridos por la IA o aparecer como opciones predeterminadas.

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `BTN_PROBLEMA` | Tengo un problema | I have a problem | `ASK_NEED` | IA-gobernado | Variable | Indica que el usuario tiene un problema técnico que necesita resolver |
| `BTN_CONSULTA` | Es una consulta | It's a question | `ASK_NEED` | IA-gobernado | Variable | Indica que el usuario tiene una pregunta o consulta (no un problema) |
| `BTN_NO_ENCIENDE` | No enciende | Won't turn on | `ASK_NEED` | IA-gobernado | Variable | Problema: el equipo no enciende |
| `BTN_NO_INTERNET` | Sin internet | No internet | `ASK_NEED` | IA-gobernado | Variable | Problema: falta conexión a internet |
| `BTN_LENTITUD` | Lentitud | Slowness | `ASK_NEED` | IA-gobernado | Variable | Problema: el sistema o equipo está lento |
| `BTN_BLOQUEO` | Bloqueos | Freezes | `ASK_NEED` | IA-gobernado | Variable | Problema: programas se bloquean o cuelgan |
| `BTN_PERIFERICOS` | Periféricos | Peripherals | `ASK_NEED` | IA-gobernado | Variable | Problema con dispositivos externos (impresoras, mouse, teclado, etc.) |
| `BTN_VIRUS` | Virus o malware | Virus or malware | `ASK_NEED` | IA-gobernado | Variable | Problema: sospecha de infección por virus o malware |

**Detalles:**
- Definidos en `BUTTON_CATALOG`
- Stage `ASK_NEED` es **IA-gobernado**: la IA decide qué botones mostrar (2-4 máximo)
- Los botones están en `STAGE_CONTRACT.ASK_NEED.allowedTokens` (tokens permitidos)
- Si la IA no sugiere botones, se muestran por defecto `BTN_PROBLEMA` y `BTN_CONSULTA`
- Etiquetas bilingües según `session.userLocale`

---

## 5. Botones de Problema/Consulta (ASK_PROBLEM)

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `BTN_BACK` | Volver atrás | Go back | `ASK_PROBLEM` | IA-gobernado | Variable | Regresa al stage anterior (generalmente `ASK_NEED`) |
| `BTN_CLOSE` | Cerrar chat | Close chat | `ASK_PROBLEM` | IA-gobernado | Variable | Cierra la conversación |
| `BTN_CONNECT_TECH` | Hablar con técnico | Talk to technician | `ASK_PROBLEM` | IA-gobernado | Variable | Solicita conexión con un técnico humano |

**Detalles:**
- Definidos en `BUTTON_CATALOG`
- Stage `ASK_PROBLEM` es **IA-gobernado**: la IA decide cuándo mostrar estos botones
- Los botones están en `STAGE_CONTRACT.ASK_PROBLEM.allowedTokens`
- Etiquetas bilingües según `session.userLocale`

---

## 6. Botones de Pruebas Básicas (BASIC_TESTS)

| Token | Label Español | Label Inglés | Stage | Tipo | Orden | Funcionalidad |
|-------|--------------|--------------|-------|------|-------|---------------|
| `BTN_SOLVED` | Listo, se arregló | Done, it's fixed | `BASIC_TESTS` | IA-gobernado | Variable | Indica que el problema se resolvió con los pasos sugeridos |
| `BTN_PERSIST` | Sigue igual | Still the same | `BASIC_TESTS` | IA-gobernado | Variable | Indica que el problema persiste después de seguir los pasos |
| `BTN_ADVANCED_TESTS` | Pruebas avanzadas | Advanced tests | `BASIC_TESTS` | IA-gobernado | Variable | Solicita pruebas más avanzadas o técnicas |
| `BTN_CONNECT_TECH` | Hablar con técnico | Talk to technician | `BASIC_TESTS` | IA-gobernado | Variable | Solicita conexión con un técnico humano |
| `BTN_CLOSE` | Cerrar chat | Close chat | `BASIC_TESTS` | IA-gobernado | Variable | Cierra la conversación |
| `BTN_BACK` | Volver atrás | Go back | `BASIC_TESTS` | IA-gobernado | Variable | Regresa al stage anterior |

**Detalles:**
- Definidos en `BUTTON_CATALOG`
- Stage `BASIC_TESTS` es **IA-gobernado**: la IA decide qué botones mostrar
- Los botones están en `STAGE_CONTRACT.BASIC_TESTS.allowedTokens`
- Etiquetas bilingües según `session.userLocale`

---

## 7. Catálogo Completo (BUTTON_CATALOG)

Referencia rápida de todos los botones que están en el catálogo:

```javascript
BUTTON_CATALOG = {
  'BTN_PROBLEMA': { label: { 'es-AR': 'Tengo un problema', 'en-US': 'I have a problem' } },
  'BTN_CONSULTA': { label: { 'es-AR': 'Es una consulta', 'en-US': 'It\'s a question' } },
  'BTN_NO_ENCIENDE': { label: { 'es-AR': 'No enciende', 'en-US': 'Won\'t turn on' } },
  'BTN_NO_INTERNET': { label: { 'es-AR': 'Sin internet', 'en-US': 'No internet' } },
  'BTN_LENTITUD': { label: { 'es-AR': 'Lentitud', 'en-US': 'Slowness' } },
  'BTN_BLOQUEO': { label: { 'es-AR': 'Bloqueos', 'en-US': 'Freezes' } },
  'BTN_PERIFERICOS': { label: { 'es-AR': 'Periféricos', 'en-US': 'Peripherals' } },
  'BTN_VIRUS': { label: { 'es-AR': 'Virus o malware', 'en-US': 'Virus or malware' } },
  'BTN_SOLVED': { label: { 'es-AR': 'Listo, se arregló', 'en-US': 'Done, it\'s fixed' } },
  'BTN_PERSIST': { label: { 'es-AR': 'Sigue igual', 'en-US': 'Still the same' } },
  'BTN_ADVANCED_TESTS': { label: { 'es-AR': 'Pruebas avanzadas', 'en-US': 'Advanced tests' } },
  'BTN_CONNECT_TECH': { label: { 'es-AR': 'Hablar con técnico', 'en-US': 'Talk to technician' } },
  'BTN_BACK': { label: { 'es-AR': 'Volver atrás', 'en-US': 'Go back' } },
  'BTN_CLOSE': { label: { 'es-AR': 'Cerrar chat', 'en-US': 'Close chat' } }
}
```

---

## 8. Resumen por Stage

### ASK_LANGUAGE (Determinístico)
- `si` / `no` (GDPR consent)
- `BTN_LANG_ES_AR`
- `BTN_LANG_EN`

### ASK_NAME (Sin botones)
- No tiene botones (solo input de texto)

### ASK_USER_LEVEL (Determinístico)
- `BTN_USER_LEVEL_BASIC`
- `BTN_USER_LEVEL_INTERMEDIATE`
- `BTN_USER_LEVEL_ADVANCED`

### ASK_NEED (IA-gobernado)
- `BTN_PROBLEMA`
- `BTN_CONSULTA`
- `BTN_NO_ENCIENDE`
- `BTN_NO_INTERNET`
- `BTN_LENTITUD`
- `BTN_BLOQUEO`
- `BTN_PERIFERICOS`
- `BTN_VIRUS`

### ASK_PROBLEM (IA-gobernado)
- `BTN_BACK`
- `BTN_CLOSE`
- `BTN_CONNECT_TECH`

### BASIC_TESTS (IA-gobernado)
- `BTN_SOLVED`
- `BTN_PERSIST`
- `BTN_ADVANCED_TESTS`
- `BTN_CONNECT_TECH`
- `BTN_CLOSE`
- `BTN_BACK`

---

## 9. Notas Importantes

1. **Botones Determinísticos vs IA-gobernados:**
   - **Determinísticos**: Siempre aparecen en su stage, no los decide la IA
   - **IA-gobernados**: La IA decide si mostrarlos y en qué orden (máximo 4 botones)

2. **Saneamiento de Botones:**
   - Todos los botones pasan por `sanitizeButtonsForStage()` antes de mostrarse
   - Solo se permiten botones que estén en `allowedTokens` del stage
   - Los botones se normalizan al formato `{token, label, order}`

3. **Formato Legacy:**
   - Los botones se convierten al formato legacy para el frontend: `{text, value, label, order}`

4. **Bilingüismo:**
   - Todos los botones del catálogo tienen etiquetas en español (`es-AR`) e inglés (`en-US`)
   - Se selecciona la etiqueta según `session.userLocale`

5. **Tokens Especiales:**
   - `si` / `no` no están en el catálogo, son temporales para GDPR
   - Los botones de idioma (`BTN_LANG_*`) están en el contrato pero no en el catálogo

---

## 10. Estadísticas

- **Total de botones únicos**: 17
- **Botones determinísticos**: 5 (idioma: 2, nivel: 3)
- **Botones IA-gobernados**: 14
- **Botones GDPR especiales**: 2 (`si`, `no`)
- **Stages con botones**: 5 (ASK_LANGUAGE, ASK_USER_LEVEL, ASK_NEED, ASK_PROBLEM, BASIC_TESTS)
- **Stage sin botones**: 1 (ASK_NAME)

---

**Última actualización**: Basado en `server.js` v8 (Híbrido + Escalable)

