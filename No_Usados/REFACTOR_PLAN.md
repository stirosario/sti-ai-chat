# 📋 Plan de Refactorización de server.js

## 🎯 Estado Actual

- ✅ **Bug ASK_NAME corregido**: Validación defensiva de mensaje vacío implementada
- ✅ **Estructura de módulos creada**: `routes/`, `handlers/`, `services/`, `utils/`
- ✅ **Módulos utils creados**: `sanitization.js`, `validation.js`
- ✅ **Handler de nombres creado**: `handlers/nameHandler.js` con validación defensiva

## 📊 Progreso

### 🔴 PRIORIDAD 1 - BUGS CRÍTICOS
- [x] Fix bug ASK_NAME (mensaje vacío)
  - [x] Validación defensiva en server.js
  - [x] Handler dedicado en nameHandler.js
  - [x] Lectura correcta de body.message y body.text

### 🔴 PRIORIDAD 2 - DIVIDIR EN MÓDULOS
- [x] Crear estructura de directorios
- [x] Crear utils/sanitization.js
- [x] Crear utils/validation.js
- [x] Crear handlers/nameHandler.js
- [ ] Extraer handlers de otros stages
- [ ] Crear routes/chat.js
- [ ] Crear routes/greeting.js
- [ ] Crear routes/tickets.js
- [ ] Crear services/sessionService.js
- [ ] Crear services/imageProcessor.js
- [ ] Reducir server.js a configuración básica

### 🟡 PRIORIDAD 3 - UNIFICAR PROCESAMIENTO
- [ ] Crear sistema de procesadores con Strategy pattern
- [ ] Centralizar decisión de qué sistema responde
- [ ] Mantener orden: inteligente → orchestrator → modular → legacy

### 🟡 PRIORIDAD 4 - STATE MACHINE
- [ ] Crear handlers/stateMachine.js
- [ ] Definir transiciones de stages
- [ ] Centralizar validaciones por stage

### 🟡 PRIORIDAD 5 - LIMPIEZA
- [ ] Eliminar bloque ASK_NEED con if(false)
- [ ] Consolidar funciones duplicadas
- [ ] Limpiar comentarios obsoletos

### 🟢 PRIORIDAD 6 - OPTIMIZACIÓN
- [ ] Batch saves de sesiones
- [ ] Optimizar logging
- [ ] Reducir llamadas redundantes

## 🔄 Próximos Pasos

1. **Actualizar server.js** para usar nameHandler.js
2. **Extraer handler de ASK_LANGUAGE** a handlers/stageHandlers.js
3. **Crear sistema de procesadores** unificado
4. **Continuar extrayendo módulos** gradualmente

## ⚠️ Notas Importantes

- Todos los cambios mantienen el comportamiento actual
- Refactorización gradual sin romper producción
- Cada módulo exportado mantiene la misma funcionalidad
