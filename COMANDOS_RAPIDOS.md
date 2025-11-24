# ⚡ COMANDOS RÁPIDOS - CHEAT SHEET

## 🚀 INICIO RÁPIDO

### Iniciar Servidor (Opción 1 - Script)
```powershell
.\start-conversational.bat
```

### Iniciar Servidor (Opción 2 - Manual)
```powershell
$env:NODE_ENV='development'; $env:PORT=3002; node server.js
```

### Abrir en Navegador
```
http://localhost:3002/test-conversational.html
```

---

## 🔥 EMERGENCIA: PUERTO OCUPADO

```powershell
# Ver qué está usando el puerto 3002
netstat -ano | findstr :3002

# Ejemplo de output:
# TCP  0.0.0.0:3002  0.0.0.0:0  LISTENING  12345
#                                            ^^^^^ Este es el PID

# Matar el proceso (reemplazar 12345 con el PID real)
taskkill /F /PID 12345

# Ahora sí, iniciar servidor
node server.js
```

---

## 🐛 TROUBLESHOOTING

### Error: "Cannot find module"
```powershell
npm install
```

### Error: "CORS origin not allowed"
```powershell
$env:NODE_ENV='development'
node server.js
```

### Error: "EADDRINUSE"
```powershell
# Ver proceso
netstat -ano | findstr :3002

# Matar proceso
taskkill /F /PID [PID]

# O cambiar puerto
$env:PORT=3003
node server.js
```

### Verificar que Node.js funciona
```powershell
node --version
# Debería mostrar: v20.x.x o superior
```

---

## ✅ VERIFICACIONES RÁPIDAS

### Sintaxis OK?
```powershell
node --check server.js
node --check conversationalBrain.js
node --check chatEndpointV2.js
```
*Si no hay output = TODO OK*

### Servidor corriendo?
```powershell
# En navegador:
http://localhost:3002/api/health
# Debería responder: {"ok":true}
```

### Endpoint conversacional activo?
```powershell
# Ver logs del servidor al iniciar, buscar:
✅ Endpoint conversacional /api/chat-v2 configurado
```

---

## 📊 TESTING RÁPIDO

### Test Visual (Navegador)
```
http://localhost:3002/test-conversational.html
```

### Test Automatizado (Terminal)
```powershell
# Terminal 1: Servidor corriendo
node server.js

# Terminal 2: Test
node test-conversation.js
```

---

## 🔍 LOGS Y DEBUGGING

### Ver logs del servidor
*Ya están en la terminal donde corriste `node server.js`*

### Ver metadata en navegador
```
F12 → Console → Ver mensajes con [💡 Metadata]
```

### Ver estado de sesión
```
F12 → Console → Escribir:
sessionStorage.getItem('sessionId')
```

---

## 📁 ARCHIVOS IMPORTANTES

### Si algo está mal, revisar estos archivos:
```
server.js                          (líneas 50-53: imports)
conversationalBrain.js            (386 líneas: cerebro)
chatEndpointV2.js                 (172 líneas: endpoint)
public/index.html                 (líneas 680-750: frontend)
```

### Documentación:
```
CONVERSATIONAL_SYSTEM_README.md   (Técnica completa)
RESUMEN_EJECUTIVO_PRESENTACION.md (Para presentar)
GUIA_DEMO_PRESENTACION.md         (Script paso a paso)
```

---

## 🎯 CONVERSACIÓN DE PRUEBA RÁPIDA

```
1. "Hola"
   → Bot pregunta nombre

2. "Soy Juan"
   → Bot saluda a Juan y pregunta en qué puede ayudar

3. "Mi teclado no funciona"
   → Bot detecta "teclado" y da Paso 1

4. "Ya lo hice"
   → Bot da Paso 2

5. "Funciona! gracias"
   → Bot confirma resolución
```

---

## ⚙️ CONFIGURACIÓN

### Variables de entorno útiles:
```powershell
$env:NODE_ENV='development'           # Modo desarrollo (CORS permisivo)
$env:PORT=3002                        # Puerto del servidor
$env:ALLOWED_ORIGINS='http://localhost:3002'  # Orígenes permitidos
```

---

## 🛑 DETENER SERVIDOR

### Si está corriendo en terminal:
```
Ctrl + C
```

### Si quedó en background:
```powershell
# Buscar procesos node
Get-Process node

# Matar todos
Stop-Process -Name "node" -Force
```

---

## 📞 SI TODO FALLA

### Opción nuclear (reiniciar todo):
```powershell
# 1. Matar todos los procesos node
Stop-Process -Name "node" -Force

# 2. Esperar 3 segundos
Start-Sleep -Seconds 3

# 3. Re-instalar dependencias (por si acaso)
npm install

# 4. Verificar sintaxis
node --check server.js

# 5. Iniciar en puerto alternativo
$env:NODE_ENV='development'
$env:PORT=3003
node server.js

# 6. Abrir en navegador
# http://localhost:3003/test-conversational.html
```

---

## 🎬 ANTES DE LA PRESENTACIÓN

### Checklist de 2 minutos:
```powershell
# 1. ✅ Verificar sintaxis
node --check server.js

# 2. ✅ Liberar puerto
netstat -ano | findstr :3002

# 3. ✅ Iniciar servidor
$env:NODE_ENV='development'; $env:PORT=3002; node server.js

# 4. ✅ Esperar a ver:
# "✅ Endpoint conversacional /api/chat-v2 configurado"

# 5. ✅ Abrir navegador
# http://localhost:3002/test-conversational.html

# 6. ✅ Probar conversación completa 1 vez

# 7. ✅ Leer GUIA_DEMO_PRESENTACION.md
```

---

## 🆘 CONTACTOS DE EMERGENCIA

### Archivos de ayuda:
- **README principal**: `README.md`
- **Documentación técnica**: `CONVERSATIONAL_SYSTEM_README.md`
- **Resumen ejecutivo**: `RESUMEN_EJECUTIVO_PRESENTACION.md`
- **Script de demo**: `GUIA_DEMO_PRESENTACION.md`
- **Este archivo**: `COMANDOS_RAPIDOS.md`

---

## 💡 TIPS PRO

### Ver todas las sesiones activas:
```
http://localhost:3002/api/sessions
```

### Ver health check:
```
http://localhost:3002/api/health
```

### Limpiar sesión en navegador:
```javascript
// En consola del navegador (F12):
sessionStorage.clear()
location.reload()
```

---

**Última actualización:** ${new Date().toISOString()}
**Versión:** 2.0 - Sistema Conversacional
**Estado:** ✅ LISTO PARA USAR
