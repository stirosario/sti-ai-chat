# 🔍 GUÍA RÁPIDA: Cómo Acceder a la Vista CODEX

## ❌ Error que tuviste

Copiaste el contenido **del chat en vivo con usuarios**, no del panel Codex.

**Codex NO es el chat de Tecnos.** 
Codex es una **herramienta de administración** que analiza conversaciones que ya ocurrieron.

---

## ✅ Cómo Acceder Correctamente

### Paso 1: Abre el Panel de Administración

**En producción (Ferozo):**
```
https://stia.com.ar/admin.php
```

**En local (si tienes servidor PHP):**
```
http://localhost/admin.php
```

### Paso 2: Inicia Sesión

- **Usuario**: `admin` (o el que configuraste en `config.php`)
- **Contraseña**: La que está en tu archivo `config.php`

### Paso 3: Navega a Codex

Una vez dentro del panel, verás estas pestañas en la parte superior:

```
┌────────────┬─────────┬──────┬───────────┬────────┐
│ Dashboard  │ Tickets │ Logs │ Chat Logs │ Codex  │
└────────────┴─────────┴──────┴───────────┴────────┘
```

**Click en la pestaña "Codex"** (tiene icono `</>`)

### Paso 4: Verás Esta Interfaz

```
╔════════════════════════════════════════════════════════╗
║  Codex - Análisis de Conversaciones Problemáticas     ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  [✓] Solo conversaciones problemáticas                ║
║  [Buscar...] [Ordenar: ▼]  [🔄 Actualizar]           ║
║                                                        ║
║  ┌────────────────────────────────────────────────┐   ║
║  │ Session ID | Fecha | Mensajes | Problemas     │   ║
║  ├────────────────────────────────────────────────┤   ║
║  │ test-001   | 12/05 | 14       | ⚠️ 5          │   ║
║  │ test-002   | 12/05 | 6        | ✅ 0          │   ║
║  └────────────────────────────────────────────────┘   ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
```

---

## 🧪 Verificación: ¿Funcionó la Instalación?

### Archivos que deben existir:

✅ **Backend (PHP):**
- `public_html/codex-functions.php` → Funciones de análisis
- `public_html/admin.php` → Modificado con vista Codex
- `public_html/codex-exports/` → Directorio para descargas

✅ **Transcripts (datos):**
- `public_html/transcripts/*.json` → Conversaciones guardadas
- Ahora tienes 17 archivos JSON copiados

✅ **Documentación:**
- `sti-ai-chat/CODEX_README.md` → Manual completo

### Comandos de Verificación (PowerShell):

```powershell
# Verificar archivo de funciones
Test-Path "c:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html\codex-functions.php"

# Contar transcripts disponibles
(Get-ChildItem "c:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html\transcripts\*.json").Count

# Verificar directorio de exportaciones
Test-Path "c:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html\codex-exports"
```

---

## 🎬 Demo Visual: Qué Verás en Cada Paso

### 1. Login (admin.php)
```
┌──────────────────────────────────┐
│   🛡️  STI Admin Panel           │
│                                  │
│   Usuario: [admin_________]     │
│   Contraseña: [**********]      │
│                                  │
│   [ Iniciar Sesión ]             │
└──────────────────────────────────┘
```

### 2. Dashboard Inicial
```
┌─────────────────────────────────────────────┐
│  🛡️ STI Admin Panel    | 👤 admin | Logout │
├─────────────────────────────────────────────┤
│ [Dashboard] [Tickets] [Logs] [Chat] [Codex]│ ← Click aquí
├─────────────────────────────────────────────┤
│                                             │
│  📊 Métricas generales...                  │
│                                             │
└─────────────────────────────────────────────┘
```

### 3. Vista Codex (Tabla Vacía)
Si NO ves sesiones:
```
┌─────────────────────────────────────────────┐
│  </> Codex - Análisis de Conversaciones    │
├─────────────────────────────────────────────┤
│                                             │
│        📭                                   │
│   No hay sesiones disponibles              │
│                                             │
│   Las conversaciones aparecerán aquí       │
│                                             │
└─────────────────────────────────────────────┘
```

**Causa:** Los transcripts no están en la ubicación correcta.

### 4. Vista Codex (Con Datos) ✅
Si SÍ ves sesiones:
```
┌──────────────────────────────────────────────────────┐
│  </> Codex - Análisis de Conversaciones             │
├──────────────────────────────────────────────────────┤
│  [✓] Solo problemáticas  [Buscar] [Ordenar ▼]      │
├──────────────────────────────────────────────────────┤
│ Session ID        │ Fecha      │ Msgs │ Problemas  │
│ test-001-prob...  │ 2025-12-05 │ 14   │ ⚠️ 5       │
│ test-002-normal   │ 2025-12-05 │ 6    │ ✅ 0       │
│ transcript-test.. │ 2025-12-04 │ 23   │ ⚠️ 3       │
└──────────────────────────────────────────────────────┘
```

**¡Esto es lo que deberías ver!**

### 5. Modal de Detalle (Click en "Ver")
```
┌────────────────────────────────────────────┐
│  </> Detalle de Sesión              [ X ]  │
├────────────────────────────────────────────┤
│                                            │
│  📋 Session: test-001-problematic          │
│  📅 Fecha: 2025-12-05 10:30:00            │
│  📱 Device: desktop                        │
│  💬 Mensajes: 14                           │
│                                            │
│  🚨 Problemas Detectados                   │
│  • Loops: 2                                │
│  • Disculpas: 3                            │
│  • Errores: 1                              │
│                                            │
│  💬 Conversación Completa                  │
│  ┌────────────────────────────────────┐   │
│  │ 10:30:00 👤 User:                  │   │
│  │ Hola, necesito ayuda con mi PC     │   │
│  │                                    │   │
│  │ 10:30:02 🤖 Bot:                   │   │
│  │ ¡Hola! Soy Tecnos...               │   │
│  └────────────────────────────────────┘   │
│                                            │
│  [Observaciones: ___________________]     │
│  [📥 Generar Paquete para Copilot]        │
└────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Problema 1: "No veo la pestaña Codex"
**Causa:** Caché del navegador o no se guardó `admin.php`

**Solución:**
1. Presiona `Ctrl + F5` para refrescar sin caché
2. Verifica que el archivo esté en el servidor
3. Revisa errores en consola del navegador (F12)

### Problema 2: "No hay sesiones disponibles"
**Causa:** Los transcripts no están en la carpeta correcta

**Solución:**
Ya ejecuté el comando que copia los transcripts. Deberían estar en:
```
public_html/transcripts/
```

Verifica con:
```powershell
Get-ChildItem "c:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html\transcripts"
```

### Problema 3: "Error al cargar sesiones"
**Causa:** Error en PHP o permisos

**Solución:**
1. Verifica que `codex-functions.php` exista
2. Revisa errores PHP en logs del servidor
3. Asegura permisos de lectura en `transcripts/`

### Problema 4: "La página está en blanco"
**Causa:** Error fatal de PHP

**Solución:**
1. Activa errores PHP: `ini_set('display_errors', 1);`
2. Revisa error_log del servidor
3. Verifica sintaxis de archivos modificados

---

## 📸 Capturas de Pantalla Recomendadas

Para verificar que todo funciona, toma capturas de:

1. ✅ Panel de login
2. ✅ Pestañas de navegación (Dashboard, Tickets, Logs, Chat Logs, **Codex**)
3. ✅ Vista Codex con tabla de sesiones
4. ✅ Modal de detalle de una sesión
5. ✅ Archivo `.txt` exportado

---

## 🔗 Acceso Directo

Si ya tienes sesión iniciada, prueba acceder directamente:

```
https://stia.com.ar/admin.php#codex
```

O usa la API para testing:
```
https://stia.com.ar/admin.php?api=codex&action=list
```

**Nota:** La API requiere autenticación de sesión válida.

---

## 📞 Si Aún No Funciona

Envíame:
1. Captura de pantalla de lo que ves en `admin.php`
2. Salida de este comando:
   ```powershell
   Get-ChildItem "c:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html" -Filter "*codex*" -Recurse
   ```
3. Errores en consola del navegador (F12 → Console)
4. Confirma si estás en local o en producción (Ferozo)

---

## ✅ Checklist Final

- [ ] `codex-functions.php` existe en `public_html/`
- [ ] `admin.php` tiene la pestaña "Codex" en el código
- [ ] `transcripts/*.json` existe en `public_html/transcripts/`
- [ ] Puedo acceder a `admin.php` y hacer login
- [ ] Veo las 5 pestañas (incluyendo Codex)
- [ ] Click en Codex muestra algo (aunque sea "No hay sesiones")
- [ ] Console del navegador no muestra errores 404

Si todos los ítems tienen ✅, entonces Codex está funcionando correctamente.
