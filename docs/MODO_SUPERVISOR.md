# 🔧 MODO SUPERVISOR - Sistema de Corrección de Flujos

## Descripción

El **Modo Supervisor** permite corregir fallas en el flujo del chatbot Tecnos directamente desde el mismo chat, accesible solo desde tu teléfono con autenticación especial.

## Características

✅ **Acceso desde el chat** - No necesitás abrir otra aplicación  
✅ **Solo para ti** - Requiere autenticación con token o contraseña  
✅ **Comandos simples** - Fácil de usar desde el teléfono  
✅ **Corrección en tiempo real** - Cambiás estados, inyectás respuestas, marcás como corregido  

## Configuración

### Variables de Entorno

Agregá estas variables a tu archivo `.env`:

```bash
# Token secreto para activar modo supervisor (generar uno seguro)
SUPERVISOR_TOKEN=

# Contraseña alternativa para activar modo supervisor
SUPERVISOR_PASSWORD=
```

### Generar Token Seguro

```bash
# Generar token aleatorio seguro
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Activación

### Paso 1: Activar Modo Supervisor

En el chat, escribí uno de estos comandos:

- `/admin`
- `/supervisor`
- `/modo-admin`
- `activar modo supervisor`

El bot te pedirá autenticación.

### Paso 2: Autenticarte

Enviá tu token o contraseña en uno de estos formatos:

```
token: TU_TOKEN_AQUI
```

o

```
password: TU_PASSWORD_AQUI
```

Si la autenticación es exitosa, verás:

```
✅ Modo supervisor activado con token

🔧 MODO SUPERVISOR ACTIVADO

Usá /help para ver comandos disponibles.
```

## Comandos Disponibles

### 📊 `/status`
Muestra el estado actual de la sesión:
- Session ID
- Usuario
- Idioma
- Estado actual (stage)
- Cantidad de mensajes
- Intent activo (si hay)
- Problema detectado
- Dispositivo
- Progreso de pasos

**Ejemplo:**
```
/status
```

### 📋 `/logs`
Muestra todos los mensajes de la conversación en orden cronológico.

**Ejemplo:**
```
/logs
```

### ➡️ `/goto <estado>`
Fuerza un cambio de estado en la sesión.

**Ejemplo:**
```
/goto ASK_NEED
/goto BASIC_TESTS
/goto ENDED
```

**Estados disponibles:**
- `ASK_LANGUAGE`
- `ASK_NAME`
- `ASK_NEED`
- `ASK_PROBLEM`
- `BASIC_TESTS`
- `ADVANCED_TESTS`
- `ESCALATE`
- `CREATE_TICKET`
- `ENDED`

### 💬 `/say <mensaje>`
Inyecta una respuesta del bot en la conversación. Útil para corregir respuestas incorrectas o guiar al usuario.

**Ejemplo:**
```
/say Hola, ¿en qué puedo ayudarte hoy?
/say Perfecto, vamos a resolverlo paso a paso.
```

### ✅ `/fix`
Marca la sesión como corregida. Esto indica que el flujo debería continuar normalmente.

**Ejemplo:**
```
/fix
```

### ❌ `/exit`
Sale del modo supervisor y vuelve al modo normal del chat.

**Ejemplo:**
```
/exit
```

### ❓ `/help`
Muestra la ayuda con todos los comandos disponibles.

**Ejemplo:**
```
/help
```

## Casos de Uso

### Caso 1: El bot está atascado en un estado

**Problema:** El usuario está en `ASK_NAME` pero el bot no avanza.

**Solución:**
1. Activá modo supervisor: `/admin`
2. Autenticate: `token: TU_TOKEN`
3. Verificá estado: `/status`
4. Forzá cambio: `/goto ASK_NEED`
5. Inyectá respuesta: `/say Perfecto, ¿en qué puedo ayudarte?`

### Caso 2: El bot dio una respuesta incorrecta

**Problema:** El bot respondió algo que no tiene sentido.

**Solución:**
1. Activá modo supervisor: `/admin`
2. Autenticate: `password: TU_PASSWORD`
3. Inyectá respuesta correcta: `/say [respuesta correcta]`
4. Marcá como corregido: `/fix`

### Caso 3: Necesitás ver qué pasó en la conversación

**Problema:** Querés entender por qué el flujo falló.

**Solución:**
1. Activá modo supervisor: `/admin`
2. Autenticate: `token: TU_TOKEN`
3. Ver logs: `/logs`
4. Ver estado: `/status`

## Seguridad

⚠️ **IMPORTANTE:**

1. **Nunca compartas** tu token o contraseña
2. **Cambiá** las credenciales por defecto en producción
3. El modo supervisor expira después de **30 minutos** de inactividad
4. Solo funciona en sesiones activas del chat

## Ejemplo Completo

```
Usuario: /admin
Bot: 🔐 MODO SUPERVISOR - Para activar, enviá tu token o contraseña

Usuario: token: abc123xyz789
Bot: ✅ Modo supervisor activado con token
     🔧 MODO SUPERVISOR ACTIVADO
     Usá /help para ver comandos disponibles.

Usuario: /status
Bot: 📊 ESTADO DE LA SESIÓN
     🆔 Session ID: web-abc123...
     👤 Usuario: Lucas
     🌍 Idioma: es-AR
     📍 Estado actual: `ASK_NEED`
     💬 Mensajes: 5
     ...

Usuario: /goto BASIC_TESTS
Bot: ✅ Estado cambiado: `ASK_NEED` → `BASIC_TESTS`
     La sesión ahora está en el nuevo estado.

Usuario: /fix
Bot: ✅ Sesión marcada como corregida. El flujo debería continuar normalmente ahora.

Usuario: /exit
Bot: ✅ Modo supervisor desactivado. Volviste al modo normal.
```

## Notas Técnicas

- Los comandos del supervisor se registran en `session.supervisorCorrections`
- Las respuestas inyectadas se marcan con `injected: true` en el transcript
- El modo supervisor se almacena en memoria (no persiste entre reinicios del servidor)
- Cada sesión puede tener su propio modo supervisor activo

## Soporte

Si tenés problemas con el modo supervisor:

1. Verificá que las variables de entorno estén configuradas
2. Asegurate de estar usando el token/contraseña correctos
3. Revisá los logs del servidor para ver errores
4. Intentá desactivar y reactivar el modo supervisor

---

**Autor:** STI AI Team  
**Fecha:** 2025-12-06  
**Versión:** 1.0
