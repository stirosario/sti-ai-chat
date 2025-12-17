# 🚀 ACTIVACIÓN DEL REFACTOR - Paso a Paso

**Branch**: `refactor/modular-architecture`  
**Compatibilidad**: 94% (93/99 ítems)  
**Estado**: ✅ Listo para testing

---

## ✅ PASO 1: ACTIVAR EN STAGING

### Opción A: Usando Scripts NPM (RECOMENDADO)

```bash
# 1. Verificar que estás en el branch correcto
git branch  # Debe decir "refactor/modular-architecture"

# 2. Instalar dependencias (si no lo hiciste)
npm install

# 3. Iniciar servidor con refactor activado
npm run start:modular
```

**Salida esperada**:
```
🏗️  Iniciando servidor con ARQUITECTURA MODULAR...
✅ Módulos cargados: SessionService, ConversationOrchestrator, NLPService...
🚀 Servidor escuchando en puerto 3000
```

### Opción B: Variable de Entorno Manual

```bash
# PowerShell
$env:USE_MODULAR_ARCHITECTURE="true"; node server.js

# CMD
set USE_MODULAR_ARCHITECTURE=true && node server.js

# Bash/Unix
USE_MODULAR_ARCHITECTURE=true node server.js
```

### Opción C: Editar .env

Agregar al archivo `.env`:
```
USE_MODULAR_ARCHITECTURE=true
```

Luego:
```bash
node server.js
```

---

## 🧪 PASO 2: EJECUTAR TESTS

En una **nueva terminal** (dejar el servidor corriendo):

```bash
# Ejecutar suite completa de tests
npm run test:modular
```

**Salida esperada**:
```
🧪 TESTING SUITE - ARQUITECTURA MODULAR
✅ Server is running

✅ TEST 1 PASSED: Full conversation flow completed
✅ TEST 2 PASSED: Button tokens processed correctly
✅ TEST 3 PASSED: JSON format 100% compatible
✅ TEST 4 PASSED: Escalation flow functional
✅ TEST 5 PASSED: New handlers responding correctly

📊 TEST RESULTS
✅ Passed: 5
❌ Failed: 0

Success Rate: 100%
🎉 ALL TESTS PASSED! Modular architecture is ready for staging.
```

### Tests Individuales (Debugging)

Si necesitas debugging detallado:

```bash
# Con output verbose
$env:VERBOSE="true"; npm run test:modular

# O probar un endpoint manualmente
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{\"sessionId\": \"test-123\", \"text\": \"Hola\"}'
```

---

## 🔍 PASO 3: MONITOREO EN TIEMPO REAL

### Ver Logs del Servidor

```bash
# En otra terminal
curl http://localhost:3000/api/logs/stream
```

### Ver Sesiones Activas

```bash
curl http://localhost:3000/api/sessions | ConvertFrom-Json | Format-List
```

### Ver Flow Audit

```bash
curl http://localhost:3000/api/flow-audit | ConvertFrom-Json
```

---

## ✅ CRITERIOS DE ÉXITO

### ✅ Go/No-Go Checklist

Marcar cada uno antes de continuar:

- [ ] Servidor inicia sin errores
- [ ] Mensaje "Arquitectura modular ACTIVADA" aparece en consola
- [ ] Test 1 (Full Flow) pasa ✅
- [ ] Test 2 (Button Tokens) pasa ✅
- [ ] Test 3 (JSON Format) pasa ✅
- [ ] Test 5 (New Handlers) pasa ✅
- [ ] No hay errores 500 en logs
- [ ] Las sesiones se crean correctamente

### 🟡 Warnings Aceptables

Estos warnings no bloquean el staging:

- Test 4 (Escalation) puede mostrar warnings sobre tickets (integración pendiente)
- Vision API puede estar parcialmente funcional (50%)
- Edge cases específicos pueden no estar manejados

---

## 🐛 TROUBLESHOOTING

### Error: "Cannot find module..."

```bash
# Reinstalar dependencias
npm install
```

### Error: "USE_MODULAR_ARCHITECTURE is not defined"

El flag no está activado. Usar una de las opciones del PASO 1.

### Error: "EADDRINUSE: address already in use"

Hay otro servidor corriendo en el puerto 3000:

```powershell
# Encontrar proceso
Get-NetTCPConnection -LocalPort 3000

# Matar proceso
Stop-Process -Id <PID>
```

### Tests fallan pero servidor funciona

```bash
# Verificar manualmente con curl
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{\"sessionId\":\"manual-test\",\"text\":\"Hola\"}'

# Revisar respuesta:
# - Debe tener 11 campos
# - stage debe estar en UPPERCASE
# - ui.buttons debe existir
```

### Servidor inicia pero no responde

```bash
# Verificar health check
curl http://localhost:3000/api/health

# Si falla, revisar:
# 1. Puerto correcto (3000 por defecto)
# 2. Firewall no está bloqueando
# 3. Logs del servidor en consola
```

---

## 🔄 DESACTIVAR REFACTOR (Si es necesario)

Si encuentras problemas críticos:

### Opción A: Detener servidor y reiniciar sin flag

```bash
# Detener servidor: Ctrl+C

# Reiniciar en modo legacy
node server.js
# (sin USE_MODULAR_ARCHITECTURE)
```

### Opción B: Cambiar a branch main

```bash
git checkout main
node server.js
```

**El servidor legacy sigue 100% funcional.**

---

## 📊 PRÓXIMOS PASOS SI TODO PASA

### 1. Testing Manual Exploratorio (30 min)

Abrir http://localhost:3000 en navegador y probar:

- [ ] Conversación completa en español
- [ ] Conversación en inglés
- [ ] Cambio de idioma
- [ ] Crear ticket
- [ ] Link de WhatsApp funciona
- [ ] Botones de ayuda por paso
- [ ] Reset de sesión

### 2. Testing con Datos Reales (1 hora)

- [ ] Usar problemas reales de clientes
- [ ] Subir capturas de pantalla
- [ ] Probar diagnósticos complejos
- [ ] Verificar tickets creados

### 3. Monitoreo 24h en Staging

- [ ] Dejar corriendo 24 horas
- [ ] Revisar logs cada 4 horas
- [ ] Verificar que no hay leaks de memoria
- [ ] Confirmar que las sesiones se limpian

### 4. Merge a Main

Si todo OK después de 24h:

```bash
git checkout main
git merge refactor/modular-architecture
git push origin main
```

### 5. Deploy Gradual a Producción

```bash
# 10% del tráfico
USE_MODULAR_ARCHITECTURE=true TRAFFIC_PERCENTAGE=10 node server.js

# Si OK → 50%
USE_MODULAR_ARCHITECTURE=true TRAFFIC_PERCENTAGE=50 node server.js

# Si OK → 100%
USE_MODULAR_ARCHITECTURE=true node server.js
```

---

## 📞 CONTACTO Y SOPORTE

**Documentación completa**: Ver `TESTING_GUIDE.md`  
**Checklist detallado**: Ver `CHECKLIST_COMPATIBILIDAD.md`  
**Resumen ejecutivo**: Ver `FASE_2_COMPLETADA.md`

**Branch**: `refactor/modular-architecture`  
**Commits recientes**: 8780e7f, ffdfec0, 57d7b68

---

## 🎯 RESUMEN EJECUTIVO

| Acción | Comando | Resultado Esperado |
|--------|---------|-------------------|
| **Activar** | `npm run start:modular` | Servidor con refactor |
| **Testear** | `npm run test:modular` | 5/5 tests passed |
| **Monitorear** | `curl .../api/logs/stream` | Logs en tiempo real |
| **Verificar** | `curl .../api/health` | `{"status":"ok"}` |

**Tiempo estimado**: 10 minutos para activación + 5 minutos para tests = **15 minutos total**

**Éxito esperado**: 100% de tests pasando (5/5) ✅

---

**¿Listo para empezar?** → `npm run start:modular` 🚀
