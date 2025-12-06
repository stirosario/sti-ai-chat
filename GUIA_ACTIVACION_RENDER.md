# 🚀 Cómo Activar el Sistema Inteligente en Render

## 📋 Paso a Paso para Configurar USE_INTELLIGENT_MODE=true

### 1️⃣ Abrir Dashboard de Render

1. **Ir a:** https://dashboard.render.com
2. **Iniciar sesión** con tu cuenta
3. **Buscar servicio:** `sti-rosario-ai` (o el nombre de tu servicio)
4. **Click** en el nombre del servicio

---

### 2️⃣ Acceder a Variables de Entorno

En el panel del servicio:

```
┌─────────────────────────────────────────┐
│  sti-rosario-ai                        │
├─────────────────────────────────────────┤
│  ▶ Settings                            │  ← Click aquí
│  ▶ Environment                         │  ← O aquí
│  ▶ Deploys                             │
│  ▶ Logs                                │
│  ▶ Metrics                             │
└─────────────────────────────────────────┘
```

---

### 3️⃣ Agregar Nueva Variable

Scroll hasta la sección **Environment Variables**

#### Si la variable NO existe:

1. Click en **"Add Environment Variable"**
2. Completar:
   ```
   Key:   USE_INTELLIGENT_MODE
   Value: true
   ```
3. Click **"Add"**

#### Si la variable YA existe:

1. Buscar `USE_INTELLIGENT_MODE` en la lista
2. Click en el **ícono de lápiz** (Edit)
3. Cambiar valor a: `true`
4. Click **"Save"**

---

### 4️⃣ Otras Variables Requeridas

Verificar que estas variables estén configuradas:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `USE_INTELLIGENT_MODE` | `true` | ✅ Activa sistema inteligente |
| `OPENAI_API_KEY` | `sk-...` | ✅ API key de OpenAI (REQUERIDO) |
| `OPENAI_MODEL` | `gpt-4o-mini` | ✅ Modelo a usar (opcional) |
| `SMART_MODE` | `true` | ✅ Análisis general con IA (opcional) |

**CRÍTICO:** Sin `OPENAI_API_KEY`, el sistema inteligente no funcionará.

---

### 5️⃣ Guardar y Redeploy

1. **Scroll hasta abajo**
2. Click en **"Save Changes"**
3. Render mostrará un banner:
   ```
   ⚠️ Redeploying your service with new environment variables
   ```
4. **Esperar ~2 minutos** mientras despliega

---

### 6️⃣ Verificar Activación en Logs

1. **Click en "Logs"** en el menú lateral
2. **Buscar estas líneas** al inicio del deployment:

```
============================================================
  🧠 SISTEMA INTELIGENTE DE TECNOS
============================================================
  Estado: ✅ ACTIVADO
  OpenAI: ✅ Disponible
  Modo: 🚀 INTELIGENTE (análisis con OpenAI)
  Features:
    - ✅ Análisis de intención contextual
    - ✅ Validación de acciones
    - ✅ Respuestas dinámicas
    - ✅ Prevención de saltos ilógicos
============================================================
```

**Si ves esto → ¡Sistema activado correctamente!**

---

### 7️⃣ Verificar en Conversación Real

Inicia una conversación y en los logs deberías ver:

```
[api/chat] 🔍 Evaluando si usar sistema inteligente...
[IntelligentSystem] 🧠 Procesando con sistema inteligente...
[IntentEngine] 🧠 Analizando intención con OpenAI...
[IntentEngine] ✅ Análisis completado: {
  intent: 'installation_help',
  confidence: 0.92,
  reasoning: 'Usuario solicita ayuda para instalar software'
}
[SmartResponse] 🎯 Generando respuesta para intent: installation_help
[api/chat] ✅ Procesado con sistema inteligente
[api/chat] 📊 Intent: installation_help
[api/chat] 📊 Stage: GUIDING_INSTALLATION
[api/chat] 📊 Options: 3
```

---

## 🔍 Troubleshooting

### ❌ Problema: "Sistema inteligente no se activó - procesando con legacy"

**Causa 1:** Variable `USE_INTELLIGENT_MODE` no configurada o en `false`  
**Solución:** Verificar en Render Environment que esté en `true`

**Causa 2:** `OPENAI_API_KEY` no configurada  
**Solución:** Agregar API key válida de OpenAI

**Causa 3:** Mensaje no requiere procesamiento inteligente  
**Solución:** Normal - algunos mensajes simples usan legacy (ejemplo: selección de idioma)

---

### ❌ Problema: "OpenAI no disponible"

**En los logs se ve:**
```
Estado: ✅ ACTIVADO
OpenAI: ⚠️ No disponible
```

**Causa:** API key inválida o no configurada  
**Solución:**
1. Ir a https://platform.openai.com/api-keys
2. Crear/copiar API key válida
3. Agregar en Render: `OPENAI_API_KEY=sk-...`
4. Save Changes y redeploy

---

### ❌ Problema: Errores 500 después de activar

**Causa posible:** Error en imports o módulos faltantes  
**Solución inmediata:** Rollback

```
Variable: USE_INTELLIGENT_MODE
Valor:    false
```

Save → El sistema volverá a legacy inmediatamente.

**Debug:**
1. Ver logs completos en Render
2. Buscar líneas `[ERROR]` o stack traces
3. Reportar en GitHub Issues

---

## 📊 Valores Recomendados para Producción

```env
# Sistema Inteligente
USE_INTELLIGENT_MODE=true

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-xxxx...
OPENAI_MODEL=gpt-4o-mini

# Smart Mode (análisis adicional)
SMART_MODE=true

# Otros flags
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
```

**Nota:** `USE_MODULAR_ARCHITECTURE` y `USE_ORCHESTRATOR` son sistemas separados. Puedes tener:
- ✅ Inteligente ON + Modular OFF
- ✅ Inteligente ON + Modular ON
- ⚠️ Si ambos ON, Inteligente tiene prioridad

---

## 🎯 Testing Post-Activación

### Test 1: Instalación de Software
**Usuario escribe:** "Quiero instalar AnyDesk"

**Esperado en logs:**
```
[IntentEngine] ✅ Análisis: { intent: 'installation_help', confidence: 0.9 }
```

**Esperado en respuesta:**
- Guía paso a paso de instalación
- **NO** debe ofrecer "Pruebas Básicas" o "Pruebas Avanzadas"
- Opciones: [📖 Guía detallada, ❓ Preguntas, 👨‍💻 Hablar con técnico]

---

### Test 2: Problema Técnico
**Usuario escribe:** "Mi PC no prende"

**Esperado en logs:**
```
[IntentEngine] ✅ Análisis: { intent: 'technical_problem', confidence: 0.95 }
```

**Esperado en respuesta:**
- Diagnóstico inicial empático
- **SÍ** debe ofrecer "Pruebas Básicas"
- Opciones: [🔧 Diagnóstico, 👨‍💻 Técnico]

---

### Test 3: Validación de Contexto
**Paso 1:** Usuario escribe "Quiero instalar Chrome"  
**Paso 2:** Usuario clickea botón "Pruebas Avanzadas"

**Esperado:**
```
[IntelligentChat] ⚠️ Acción inválida: intent_mismatch
[IntelligentChat] Rechazando BTN_ADVANCED_TESTS en contexto installation_help
```

**Respuesta al usuario:**
```
Las pruebas avanzadas solo aplican cuando tenés un problema 
técnico que ya intentamos resolver. 

En este caso, te estoy ayudando con la instalación de Chrome, 
que no requiere pruebas de diagnóstico.

¿Querés que continuemos con la instalación?
```

---

## ✅ Checklist de Activación Completa

- [ ] `USE_INTELLIGENT_MODE=true` configurado en Render
- [ ] `OPENAI_API_KEY` válida configurada
- [ ] Servicio redeployado exitosamente
- [ ] Logs muestran "✅ ACTIVADO"
- [ ] Logs muestran "OpenAI: ✅ Disponible"
- [ ] Test de instalación NO ofrece pruebas (✅ Correcto)
- [ ] Test de problema SÍ ofrece diagnóstico (✅ Correcto)
- [ ] Test de contexto rechaza acción inválida (✅ Correcto)
- [ ] Sin errores 500 en producción
- [ ] Respuestas más naturales y contextuales

---

## 🔄 Rollback Instantáneo

Si algo no funciona como esperado:

1. **Render Dashboard** → Tu servicio
2. **Environment** → Buscar `USE_INTELLIGENT_MODE`
3. **Edit** → Cambiar a `false`
4. **Save Changes**
5. ⏱️ **2 minutos** → Sistema vuelve a legacy

**Cero downtime. Cero cambios de código.**

---

## 📞 Soporte

- **GitHub Issues:** https://github.com/stirosario/sti-ai-chat/issues
- **Documentación:** `INTELLIGENT_SYSTEM_README.md`
- **Cambios aplicados:** `CAMBIOS_SISTEMA_INTELIGENTE.md`

---

✅ **Sistema listo para activación en producción**
