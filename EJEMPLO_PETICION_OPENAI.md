# Ejemplo de Petición a OpenAI para Diagnóstico

## Caso de Ejemplo
- **Usuario**: Nivel BÁSICO
- **Problema**: "mi pc no enciende"
- **Dispositivo**: desktop
- **Sistema Operativo**: unknown
- **Paso de diagnóstico**: 1
- **Session ID**: DO4000

---

## 1. Llamada a OpenAI (Código)

```javascript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini', // o el valor de OPENAI_MODEL
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ],
  temperature: 0.7,
  max_tokens: 800,
  response_format: { type: 'json_object' }
});
```

---

## 2. System Prompt (Mensaje del Sistema)

```
Sos Tecnos, técnico informático de STI — Servicio Técnico Inteligente. Respondé SOLO en español rioplatense (Argentina), usando voseo ("vos").

El usuario es nivel BÁSICO. Usá lenguaje MUY simple, guía paso a paso con pasos numerados, confirmaciones frecuentes. Evitá TODA jerga técnica. Explicá qué buscar visualmente (íconos, botones, luces).

INFORMACIÓN DE CONTEXTO:
- Problema reportado: "mi pc no enciende"
- Tipo de problema (intent): wont_turn_on
- Tipo de dispositivo: desktop
- Sistema operativo: unknown
- Paso de diagnóstico actual: 1
- Datos de diagnóstico previos: {}

REGLAS PARA PASOS DE DIAGNÓSTICO:
1. Generá instrucciones de diagnóstico paso a paso basadas en el problema, tipo de dispositivo, OS y nivel de usuario
2. Si es paso 1: Empezá con la solución más común/fácil primero
3. Si es paso > 1: Construí sobre pasos previos, no repitas lo que ya se intentó
4. Adaptá el lenguaje y complejidad al nivel del usuario (basic)
5. Sugerí 2-4 botones relevantes del catálogo disponible
6. Si el usuario hizo clic en un botón, respondé acorde (ej: si BTN_STEP_DONE, preguntá si se resolvió)
7. Si el problema persiste después de 2 intentos, sugerí hablar con técnico

Botones disponibles: ["BTN_SOLVED","BTN_PERSIST","BTN_HELP_CONTEXT","BTN_BACK","BTN_CONNECT_TECH","BTN_PWR_NO_SIGNS","BTN_PWR_FANS","BTN_PWR_BEEPS","BTN_PWR_ON_OFF","BTN_STEP_DONE","BTN_STEP_STILL","BTN_STEP_HELP","BTN_INET_WIFI","BTN_INET_CABLE","BTN_INET_BOTH"]

IMPORTANTE: Devolvé SOLO un objeto JSON con esta estructura exacta:
{
  "reply": "Tus instrucciones de diagnóstico aquí (solo texto plano, sin JSON, sin bloques de código)",
  "buttons": [{"token": "BTN_XXX", "label": "Etiqueta del Botón", "order": 1}]
}

El campo "reply" debe contener SOLO las instrucciones de diagnóstico en texto plano. NO incluyas JSON, bloques de código o arrays de botones en el texto del reply.
```

---

## 3. User Message (Mensaje del Usuario)

### Caso A: Primer paso (sin botón presionado)

```
Generá el primer paso de diagnóstico para este problema.
```

### Caso B: Usuario presionó BTN_PWR_NO_SIGNS (paso 2)

```
Usuario seleccionó: Sin señales de energía (sin luces, sin sonidos). Este es el paso de diagnóstico 2. Proporcioná el SIGUIENTE paso de diagnóstico lógico basado en esta selección. NO repitas el paso anterior.

Contexto de conversación reciente:
[
  {
    "stage": "DIAGNOSTIC_STEP",
    "user_event": "BTN_PWR_NO_SIGNS",
    "bot_reply": "Revisemos si tu PC está recibiendo energía:\n\n1. Mirá detrás de tu PC y buscá el cable de alimentación.\n2. Asegurate de que esté bien conectado tanto a la PC como al enchufe de la pared.\n3. Fijate si hay alguna luz encendida en la parte frontal. Si hay luces, es una buena señal.\n4. Si no hay luces, probá enchufar otro aparato (como una lámpara) en la misma toma para ver si funciona."
  }
]
```

---

## 4. Respuesta Esperada de OpenAI

```json
{
  "reply": "Revisemos si tu PC está recibiendo energía:\n\n1. Mirá detrás de tu PC y buscá el cable de alimentación.\n2. Asegurate de que esté bien conectado tanto a la PC como al enchufe de la pared.\n3. Fijate si hay alguna luz encendida en la parte frontal. Si hay luces, es una buena señal.\n4. Si no hay luces, probá enchufar otro aparato (como una lámpara) en la misma toma para ver si funciona.",
  "buttons": [
    {"token": "BTN_PWR_NO_SIGNS", "label": "🔌 No enciende nada", "order": 1},
    {"token": "BTN_PWR_FANS", "label": "💡 Prenden luces o gira el ventilador", "order": 2},
    {"token": "BTN_STEP_DONE", "label": "✅ Listo, ya lo probé", "order": 3}
  ]
}
```

---

## 5. Ejemplo Completo de Petición HTTP (Conceptual)

```http
POST https://api.openai.com/v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-...

{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "Sos Tecnos, técnico informático de STI — Servicio Técnico Inteligente. Respondé SOLO en español rioplatense (Argentina), usando voseo (\"vos\").\n\nEl usuario es nivel BÁSICO. Usá lenguaje MUY simple, guía paso a paso con pasos numerados, confirmaciones frecuentes. Evitá TODA jerga técnica. Explicá qué buscar visualmente (íconos, botones, luces).\n\nINFORMACIÓN DE CONTEXTO:\n- Problema reportado: \"mi pc no enciende\"\n- Tipo de problema (intent): wont_turn_on\n- Tipo de dispositivo: desktop\n- Sistema operativo: unknown\n- Paso de diagnóstico actual: 1\n- Datos de diagnóstico previos: {}\n\nREGLAS PARA PASOS DE DIAGNÓSTICO:\n1. Generá instrucciones de diagnóstico paso a paso basadas en el problema, tipo de dispositivo, OS y nivel de usuario\n2. Si es paso 1: Empezá con la solución más común/fácil primero\n3. Si es paso > 1: Construí sobre pasos previos, no repitas lo que ya se intentó\n4. Adaptá el lenguaje y complejidad al nivel del usuario (basic)\n5. Sugerí 2-4 botones relevantes del catálogo disponible\n6. Si el usuario hizo clic en un botón, respondé acorde (ej: si BTN_STEP_DONE, preguntá si se resolvió)\n7. Si el problema persiste después de 2 intentos, sugerí hablar con técnico\n\nBotones disponibles: [\"BTN_SOLVED\",\"BTN_PERSIST\",\"BTN_HELP_CONTEXT\",\"BTN_BACK\",\"BTN_CONNECT_TECH\",\"BTN_PWR_NO_SIGNS\",\"BTN_PWR_FANS\",\"BTN_PWR_BEEPS\",\"BTN_PWR_ON_OFF\",\"BTN_STEP_DONE\",\"BTN_STEP_STILL\",\"BTN_STEP_HELP\",\"BTN_INET_WIFI\",\"BTN_INET_CABLE\",\"BTN_INET_BOTH\"]\n\nIMPORTANTE: Devolvé SOLO un objeto JSON con esta estructura exacta:\n{\n  \"reply\": \"Tus instrucciones de diagnóstico aquí (solo texto plano, sin JSON, sin bloques de código)\",\n  \"buttons\": [{\"token\": \"BTN_XXX\", \"label\": \"Etiqueta del Botón\", \"order\": 1}]\n}\n\nEl campo \"reply\" debe contener SOLO las instrucciones de diagnóstico en texto plano. NO incluyas JSON, bloques de código o arrays de botones en el texto del reply."
    },
    {
      "role": "user",
      "content": "Generá el primer paso de diagnóstico para este problema."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 800,
  "response_format": {
    "type": "json_object"
  }
}
```

---

## 6. Variables que Afectan el Prompt

### Nivel de Usuario
- **basic**: Lenguaje MUY simple, pasos numerados, sin jerga técnica
- **intermediate**: Términos técnicos comunes, detalle moderado
- **advanced**: Técnico, preciso, comandos, herramientas avanzadas

### Tipo de Problema (intent)
- `wont_turn_on`: Problemas de encendido
- `no_internet`: Problemas de conectividad
- `slow`: Problemas de rendimiento
- `freezes`: Congelamientos
- `keyboard_issue`: Problemas de teclado
- etc.

### Paso Actual
- **Paso 1**: Solución más común/fácil primero
- **Paso > 1**: Construir sobre pasos previos, no repetir

### Botones Disponibles
Se filtran según el `STAGE_CONTRACT` para `DIAGNOSTIC_STEP` y se pasan a la IA como contexto.

---

## 7. Logs en el Servidor

Cuando se hace la petición, se registran estos logs:

```
[DIAGNOSTIC_STEP] [DO4000] 🤖 Consultando IA para paso 1
[DIAGNOSTIC_STEP] [DO4000] 📝 Contexto: problema="mi pc no enciende", intent=wont_turn_on, device=desktop, os=unknown, nivel=basic
[DIAGNOSTIC_STEP] [DO4000] 📥 Respuesta de IA recibida (XXX caracteres)
[DIAGNOSTIC_STEP] [DO4000] ✅ Respuesta parseada: reply=Revisemos si tu PC..., buttons=3
```

---

## 8. Manejo de Errores

Si OpenAI falla o tarda más de 15 segundos:
- Se activa un **fallback inteligente** basado en el `intent` detectado
- Para `wont_turn_on` con nivel `basic`, se genera un diagnóstico básico automático
- Si no hay `intent` o es `unknown`, se muestra mensaje genérico sugiriendo técnico




