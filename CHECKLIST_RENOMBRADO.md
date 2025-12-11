# ✅ CHECKLIST COMPLETO: Renombrado de Archivos

**Objetivo:** Renombrar `server.js` → `serverold.js` y `serverv2.js` → `server.js`  
**Fecha:** 2025-01-XX

---

## 📋 VERIFICACIONES REALIZADAS

### ✅ 1. Dependencias de serverv2.js
- [x] `serverv2.js` NO tiene imports de `server.js`
- [x] `serverv2.js` NO tiene referencias a funciones de `server.js`
- [x] `serverv2.js` es completamente independiente

### ✅ 2. Archivos de Configuración

#### package.json
- [x] `"main": "server.js"` - ✅ Ya apunta correctamente
- [x] `"start": "node server.js"` - ✅ Ya apunta correctamente
- [x] `"dev": "nodemon server.js"` - ✅ Ya apunta correctamente
- [x] `"test": "node --check server.js"` - ✅ Ya apunta correctamente
- [x] `"lint": "node --check server.js"` - ✅ Ya apunta correctamente

**Acción:** ✅ **NO REQUIERE CAMBIOS**

#### Dockerfile
- [x] Línea 45: `CMD ["node", "server.js"]` - ✅ Ya apunta correctamente

**Acción:** ✅ **NO REQUIERE CAMBIOS**

#### Procfile
- [x] Línea 1: `web: node server.js` - ✅ Ya apunta correctamente

**Acción:** ✅ **NO REQUIERE CAMBIOS**

#### start-modular.js
- [x] Línea 31: `const serverPath = join(__dirname, 'server.js');` - ✅ Ya apunta correctamente

**Acción:** ✅ **NO REQUIERE CAMBIOS**

#### scripts/smoke-tests.sh
- [x] No hace referencia a nombres de archivos, solo hace requests HTTP
- [x] Funcionará correctamente después del renombrado

**Acción:** ✅ **NO REQUIERE CAMBIOS**

---

## 🚀 PASOS PARA EL RENOMBRADO

### ⚠️ IMPORTANTE: Hacer esto ANTES de renombrar

#### 1. Detener cualquier servidor en ejecución
```bash
# Windows
taskkill /F /IM node.exe

# Linux/Mac
pkill node

# O si usas PM2
pm2 stop all
```

#### 2. Crear backups de seguridad
```bash
# Crear backups de ambos archivos
cp server.js server.js.backup
cp serverv2.js serverv2.js.backup
```

#### 3. Verificar que las dependencias están instaladas
```bash
npm install
```

#### 4. Verificar variables de entorno
- Asegúrate de que `.env` existe y tiene `LOG_TOKEN` configurado (en producción)

---

### 📝 ORDEN DE RENOMBRADO

#### Paso 1: Renombrar server.js → serverold.js
```bash
# Windows (PowerShell)
Rename-Item -Path "server.js" -NewName "serverold.js"

# Windows (CMD)
ren server.js serverold.js

# Linux/Mac
mv server.js serverold.js
```

#### Paso 2: Renombrar serverv2.js → server.js
```bash
# Windows (PowerShell)
Rename-Item -Path "serverv2.js" -NewName "server.js"

# Windows (CMD)
ren serverv2.js server.js

# Linux/Mac
mv serverv2.js server.js
```

---

### ✅ VERIFICACIONES DESPUÉS DEL RENOMBRADO

#### 1. Verificar sintaxis
```bash
node --check server.js
```

#### 2. Probar inicio del servidor
```bash
npm start
```

#### 3. Verificar endpoints
```bash
# Health check
curl http://localhost:3001/api/health

# Greeting
curl -X POST http://localhost:3001/api/greeting \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### 4. Probar flujo completo del chat
- Abrir el frontend
- Iniciar una conversación
- Verificar que el flujo funciona correctamente

---

## 📊 RESUMEN DE ARCHIVOS

### Archivos que NO requieren cambios:
- ✅ `package.json` - Ya apunta a `server.js`
- ✅ `Dockerfile` - Ya apunta a `server.js`
- ✅ `Procfile` - Ya apunta a `server.js`
- ✅ `start-modular.js` - Ya apunta a `server.js`
- ✅ `scripts/smoke-tests.sh` - No hace referencia a archivos

### Archivos de desarrollo local (no críticos para deploy):
- ⚠️ Scripts `.bat` - Ya apuntan a `server.js`, funcionarán después del renombrado
  - `start-production.bat`
  - `update.bat`
  - `start-conversational.bat`
  - `start-server-3003.bat`
  - `start-server-3004.bat`
  - `update1.bat`
  - `coyserver.bat`

---

## ✅ CONCLUSIÓN

**El renombrado es SEGURO y NO requiere cambios en archivos de configuración.**

Todos los archivos críticos para el deploy (`package.json`, `Dockerfile`, `Procfile`) ya apuntan a `server.js`, que será el nuevo nombre de `serverv2.js` después del renombrado.

**Solo necesitas:**
1. ✅ Detener servidores en ejecución
2. ✅ Crear backups
3. ✅ Renombrar los archivos
4. ✅ Probar que funciona

---

**Checklist creado por:** AI Assistant  
**Fecha:** 2025-01-XX
