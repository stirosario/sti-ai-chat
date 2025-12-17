# TEXTOS FINALES PARA EL USUARIO - Chat Tecnos

**Lenguaje:** Español rioplatense (Argentina)  
**Tono:** Claro, humano, tranquilo, sin apuro ni tono robótico  
**Adaptación:** Según nivel de usuario (Básico / Intermedio / Avanzado)

---

## 1. INICIO - Política de Privacidad

### Mensaje de Tecnos:

```
📋 Política de Privacidad y Consentimiento

Antes de continuar, quiero contarte:

✅ Voy a guardar tu nombre y nuestra conversación durante 48 horas
✅ Los datos se usan solo para brindarte soporte técnico
✅ Podés pedir que borre tus datos en cualquier momento
✅ No compartimos tu información con terceros
✅ Cumplimos con GDPR y normativas de privacidad

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

¿Aceptás estos términos?
```

### Botones:

- **Sí, Acepto ✔️**
- **No, No Acepto ❌**

---

## 2. RECHAZO DE PRIVACIDAD

### Mensaje de Tecnos:

```
Entiendo. Para usar este servicio necesitás aceptar la política de privacidad.

Si cambiás de opinión, podés volver a iniciar el chat cuando quieras.

¡Que tengas un buen día!
```

### Botones:

*(Ninguno - Chat finalizado)*

---

## 3. SELECCIÓN DE IDIOMA

### Mensaje de Tecnos:

```
🆔 [ID de sesión]

Gracias por aceptar.

Seleccioná tu idioma:
```

### Botones:

- **🇦🇷 Español (Argentina)**
- **🇬🇧 English**

---

## 4. CONFIRMACIÓN DE IDIOMA

### Mensaje de Tecnos (Español):

```
¡Perfecto! Vamos a continuar en Español.

¿Con quién tengo el gusto de hablar?
```

### Mensaje de Tecnos (English):

```
Great! Let's continue in English.

What's your name?
```

### Botones:

*(Ninguno - El usuario debe escribir su nombre)*

---

## 5. CAPTURA DE NOMBRE

### Si el nombre es válido (2-30 caracteres):

**Mensaje de Tecnos:**

```
¡Encantado de conocerte, [nombre]!

Por favor, seleccioná tu nivel de conocimiento técnico:
```

### Botones:

- **Básico**
- **Intermedio**
- **Avanzado**

### Si el nombre es inválido:

**Mensaje de Tecnos:**

```
¿Con quién tengo el gusto de hablar?

(Necesito un nombre de entre 2 y 30 caracteres)
```

### Botones:

*(Ninguno - El usuario debe escribir su nombre nuevamente)*

---

## 6. CONFIRMACIÓN DE NIVEL

### Mensaje de Tecnos (Básico):

```
¡Perfecto! Voy a ajustar mis explicaciones a tu nivel básico.

¿En qué puedo ayudarte hoy?
```

### Mensaje de Tecnos (Intermedio):

```
¡Perfecto! Voy a ajustar mis explicaciones a tu nivel intermedio.

¿En qué puedo ayudarte hoy?
```

### Mensaje de Tecnos (Avanzado):

```
¡Perfecto! Voy a ajustar mis explicaciones a tu nivel avanzado.

¿En qué puedo ayudarte hoy?
```

### Botones:

*(Ninguno - El usuario debe escribir su problema)*

---

## 7. VALIDACIÓN DEL PROBLEMA (Automático)

### Mensaje de Tecnos (mientras procesa):

*(El bot procesa automáticamente con OpenAI - puede tomar hasta 12 segundos)*

### Si falta información del dispositivo:

**Mensaje de Tecnos:**

```
Entiendo que tenés: [descripción del problema]

¿Qué tipo de dispositivo estás usando?
```

### Botones:

- **PC de escritorio**
- **Notebook**
- **All In One**

### Si se puede inferir el dispositivo o ya está completo:

**Mensaje de Tecnos:**

```
Entiendo tu problema: [descripción del problema]

Déjame guiarte paso a paso para solucionarlo.
```

*(Avanza automáticamente al Paso 1 del diagnóstico)*

---

## 8. DIAGNÓSTICO - Paso 1 (Automático)

### Mensaje de Tecnos:

```
Cuando apretás el botón de encendido, ¿qué pasa con la compu?
```

### Botones:

- **🔌 No enciende nada (sin luces ni ventilador)**
- **💡 Prenden luces o gira el ventilador**
- **🔊 Escucho pitidos**
- **🔄 Enciende y se apaga enseguida**

---

## 9. DIAGNÓSTICO - Paso 2 (Según síntoma seleccionado)

### 9.1. Si seleccionó "No enciende nada"

**Mensaje de Tecnos:**

```
Sin señales de encendido suele ser un problema con la alimentación o el cable. Revisemos:

1. Verificá que el cable de alimentación esté bien conectado a la PC y al enchufe.
2. Probá con otro enchufe.
3. Verificá si la fuente tiene un interruptor y que esté en ON.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

### 9.2. Si seleccionó "Prenden luces o gira el ventilador" o "Escucho pitidos"

#### Para usuarios BÁSICO e INTERMEDIO:

**Mensaje de Tecnos:**

```
Bien, hay algo de energía. Ahora revisemos:

1. Verificá que el monitor esté prendido y conectado.
2. Probá desconectar y volver a conectar todos los cables externos (HDMI, DisplayPort, VGA).
3. Verificá que el monitor esté en la entrada correcta.
```

#### Para usuarios AVANZADO:

**Mensaje de Tecnos:**

```
Bien, hay algo de energía. Ahora revisemos:

1. Verificá que el monitor esté prendido y conectado.
2. Verificá que los módulos de memoria RAM estén bien colocados (si te sentís cómodo abriendo la PC).
3. Probá desconectar y volver a conectar todos los cables.

⚠️ Importante: Si no te sentís cómodo abriendo la PC, podés hablar con un técnico en cualquier momento.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

### 9.3. Si seleccionó "Enciende y se apaga enseguida"

**Mensaje de Tecnos:**

```
Si enciende y se apaga enseguida, puede ser sobrecalentamiento o problema de alimentación. Revisemos:

1. Asegurate de que la PC no se esté sobrecalentando (verificá que los ventiladores funcionen).
2. Probá desconectar dispositivos no esenciales (USB, discos externos).
3. Verificá que la fuente de alimentación sea adecuada para tus componentes.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

## 10. DIAGNÓSTICO - Paso 2 (Notebook)

### 10.1. Si seleccionó "No enciende nada" (Notebook)

**Mensaje de Tecnos:**

```
Sin señales de encendido en una notebook suele ser un problema con el cargador o la batería. Revisemos:

1. Verificá que el cargador esté bien conectado a la notebook y al enchufe.
2. Probá con otro enchufe.
3. Verificá si el LED de carga se prende (si tu notebook tiene uno).
4. Probá sacar la batería (si es removible) y conectar solo con el cargador.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

### 10.2. Si seleccionó "Prenden luces o gira el ventilador" o "Escucho pitidos" (Notebook)

**Mensaje de Tecnos:**

```
Bien, hay algo de energía. Ahora revisemos:

1. Desconectá todos los dispositivos externos (USB, mouse, monitor externo, etc.).
2. Verificá si la pantalla muestra algo (aunque sea negro, verificá si hay retroiluminación).
3. Probá un hard reset: mantené presionado el botón de encendido durante 15 segundos, soltalo y volvé a presionarlo.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

### 10.3. Si seleccionó "Enciende y se apaga enseguida" (Notebook)

**Mensaje de Tecnos:**

```
Si enciende y se apaga enseguida, puede ser sobrecalentamiento, problema con el cargador o un cortocircuito. Revisemos:

1. Asegurate de que la notebook no se esté sobrecalentando (verificá que el ventilador funcione y que las rejillas estén despejadas).
2. Probá con otro cargador si tenés uno disponible.
3. Verificá si hay signos visibles de daño o derrames de líquido.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

## 11. DIAGNÓSTICO - Confirmación después de "Listo, probé esto"

**Mensaje de Tecnos:**

```
¿Esto resolvió el problema?
```

### Botones:

- **✅ Se resolvió**
- **❌ Sigue igual**
- **🙋 Necesito ayuda**

---

## 12. DIAGNÓSTICO - Pasos siguientes (Si presionó "Sigue igual")

### 12.1. Primera vez que presiona "Sigue igual"

#### Para usuarios BÁSICO e INTERMEDIO (Desktop):

**Mensaje de Tecnos:**

```
Probemos otro enfoque. Verificá que todos los cables externos estén bien conectados. Probá con otro enchufe o regleta. Si el problema persiste, te recomiendo hablar con un técnico.
```

#### Para usuarios AVANZADO (Desktop):

**Mensaje de Tecnos:**

```
Probemos otro enfoque. Revisá las conexiones de la fuente dentro de la PC (si te sentís cómodo). Asegurate de que todos los cables internos estén bien conectados.

⚠️ ¿Te sentís cómodo abriendo la PC? Si no, podés hablar con un técnico en cualquier momento.
```

#### Para usuarios BÁSICO e INTERMEDIO (Notebook):

**Mensaje de Tecnos:**

```
Probemos otro enfoque. Verificá que todos los cables externos estén bien conectados. Probá con otro enchufe o regleta. También podés probar conectar un monitor externo para ver si el problema es con la pantalla. Si el problema persiste, te recomiendo hablar con un técnico.
```

#### Para usuarios AVANZADO (Notebook):

**Mensaje de Tecnos:**

```
Probemos otro enfoque. Revisá las conexiones internas y probá resetear la BIOS/CMOS (si te sentís cómodo). También podés probar conectar un monitor externo para ver si el problema es con la pantalla.

⚠️ ¿Te sentís cómodo abriendo la notebook? Si no, podés hablar con un técnico en cualquier momento.
```

### Botones:

- **✅ Listo, probé esto**
- **❌ Sigue igual**
- **🙋 No puedo hacerlo / necesito ayuda**

---

### 12.2. Segunda vez que presiona "Sigue igual" (Escalamiento)

**Mensaje de Tecnos:**

```
Entiendo que el problema persiste. Te recomiendo hablar con un técnico para un diagnóstico más detallado.

¿Te sirvió esta ayuda?
```

### Botones:

- **👍 Sí, me sirvió**
- **👎 No, no me sirvió**

---

## 13. ESCALAMIENTO - Si presionó "No puedo hacerlo / necesito ayuda"

**Mensaje de Tecnos:**

```
Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico.

¿Te sirvió esta ayuda?
```

### Botones:

- **👍 Sí, me sirvió**
- **👎 No, no me sirvió**

---

## 14. FEEDBACK FINAL

### Mensaje de Tecnos:

```
¿Te sirvió esta ayuda?
```

### Botones:

- **👍 Sí, me sirvió**
- **👎 No, no me sirvió**

---

## 15. FEEDBACK POSITIVO

**Mensaje de Tecnos:**

```
¡Gracias! ¡Que tengas un buen día!
```

### Botones:

*(Ninguno - Chat finalizado)*

---

## 16. FEEDBACK NEGATIVO - Pregunta por motivo

**Mensaje de Tecnos:**

```
¿Cuál fue el motivo?
```

### Botones:

- **No resolvió el problema**
- **Fue difícil de entender**
- **Demasiados pasos**
- **Prefería hablar con un técnico**
- **Otro motivo**

---

## 17. CIERRE CON FEEDBACK NEGATIVO

**Mensaje de Tecnos:**

```
Gracias por tu feedback. Voy a trabajar en mejorar.

¡Que tengas un buen día!
```

### Botones:

*(Ninguno - Chat finalizado)*

---

## NOTAS DE REDACCIÓN

### Principios aplicados:

1. **Voseo rioplatense**: "apretás", "verificá", "probá", "tenés"
2. **Lenguaje natural**: Evitar jerga técnica innecesaria
3. **Tono tranquilo**: Sin apuro, sin presión
4. **Claridad**: Instrucciones paso a paso, numeradas
5. **Empatía**: Reconocer cuando el usuario necesita ayuda
6. **Adaptación por nivel**:
   - **Básico/Intermedio**: Lenguaje más simple, sin mencionar componentes internos
   - **Avanzado**: Puede usar términos técnicos, pero siempre con advertencia y alternativa

### Adaptaciones por nivel:

- **Básico/Intermedio**: Nunca mencionar RAM, placa madre, fuente interna, CMOS, abrir dispositivo
- **Avanzado**: Puede mencionar componentes internos, pero siempre:
  - Preguntar si se siente cómodo
  - Advertir sobre riesgos
  - Ofrecer alternativa de técnico

### Emojis usados:

- 🔌 Para problemas de alimentación
- 💡 Para luces/energía
- 🔊 Para sonidos/pitidos
- 🔄 Para ciclos de encendido/apagado
- ✅ Para acciones completadas
- ❌ Para problemas que persisten
- 🙋 Para pedir ayuda
- 👍 Para feedback positivo
- 👎 Para feedback negativo

---

## VARIANTES ESPECIALES

### Mensaje cuando se resuelve el problema:

**Mensaje de Tecnos:**

```
¡Genial! Me alegra que haya funcionado.

¿Te sirvió esta ayuda?
```

### Botones:

- **👍 Sí, me sirvió**
- **👎 No, no me sirvió**

---

### Mensaje de error/fallback (si OpenAI falla):

**Mensaje de Tecnos:**

```
Entiendo. Para seguir, decime qué tipo de equipo es.
```

### Botones:

- **PC de escritorio**
- **Notebook**
- **All In One**

---

## FLUJO COMPLETO RESUMIDO

1. **Inicio** → Política de privacidad → Aceptar/Rechazar
2. **Idioma** → Seleccionar Español/English
3. **Nombre** → Escribir nombre
4. **Nivel** → Seleccionar Básico/Intermedio/Avanzado
5. **Problema** → Escribir descripción
6. **Dispositivo** → Seleccionar (si no se puede inferir)
7. **Diagnóstico Paso 1** → Seleccionar síntoma de encendido
8. **Diagnóstico Paso 2** → Seguir instrucciones según síntoma
9. **Confirmación** → ¿Se resolvió?
10. **Pasos siguientes** → Si persiste, continuar o escalar
11. **Feedback** → ¿Te sirvió?
12. **Motivo** → Si no sirvió, ¿por qué?
13. **Cierre** → Agradecimiento y despedida

---

## VALIDACIONES FINALES

✅ Todos los textos están en español rioplatense  
✅ Tono humano y tranquilo  
✅ Sin jerga técnica innecesaria para usuarios básicos  
✅ Adaptado por nivel de usuario  
✅ Botones con texto claro y descriptivo  
✅ El flujo avanza automáticamente cuando corresponde  
✅ No hay puntos donde el bot quede esperando sin hablar

