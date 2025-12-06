# 📋 CODEX - Sistema de Análisis de Conversaciones

## 🎯 Propósito

**Codex** es una vista del panel admin diseñada para capturar, analizar y exportar logs completos de conversaciones problemáticas del chat Tecnos. Permite identificar automáticamente problemas como:

- 🔄 **Loops**: Bot repitiendo las mismas respuestas
- 😔 **Disculpas repetidas**: Bot pidiendo disculpas múltiples veces
- 🔁 **Reformulaciones**: Usuario repitiendo su pregunta de diferentes formas
- ❌ **Errores**: Fallos detectados en el flujo
- ⚠️ **Respuestas inesperadas**: Bot confundido o dando respuestas fuera de contexto

---

## 📂 Archivos Creados

### 1. **codex-functions.php** (nueva)
Ubicación: `public_html/codex-functions.php`

**Funciones principales:**
- `getTranscriptFiles()`: Busca archivos de transcripciones en múltiples ubicaciones
- `parseTranscript($filePath)`: Lee y parsea un archivo JSON de transcripción
- `analyzeConversationProblems($transcript)`: Detecta problemas automáticamente usando regex y análisis de contenido
- `getSessionsList($sortBy, $filterProblems)`: Lista todas las sesiones con métricas
- `getSessionDetails($sessionId)`: Obtiene detalles completos de una sesión específica
- `generateCopilotExport($sessionId, $observations)`: Genera archivo TXT formateado para análisis por Copilot
- `generateBulkExport($sessionIds, $observations)`: Exporta múltiples sesiones en un ZIP o TXT consolidado

### 2. **admin.php** (modificado)
Ubicación: `public_html/admin.php`

**Cambios agregados:**
- **API Endpoint**: `?api=codex&action=list|details|export|bulk-export`
- **Nueva pestaña de navegación**: "Codex" con icono de código
- **Nueva sección HTML**: Vista completa con tabla, filtros y modales
- **Funciones JavaScript**: 
  - `refreshCodexSessions()`: Carga lista de sesiones desde API
  - `renderCodexTable()`: Renderiza tabla con métricas de problemas
  - `viewSessionDetails(sessionId)`: Abre modal con conversación completa
  - `exportCurrentSession()`: Exporta sesión individual
  - `exportSelectedSessions()`: Exporta múltiples sesiones seleccionadas
  - `filterCodexTable()`: Filtrado en tiempo real
  - `sortCodexTable()`: Ordenamiento por fecha, problemas o duración

### 3. **codex-exports/** (nuevo directorio)
Ubicación: `public_html/codex-exports/`

Directorio protegido donde se guardan las exportaciones. Incluye `.htaccess` para:
- Denegar acceso directo al directorio
- Deshabilitar listado de archivos
- Forzar descarga de archivos TXT/ZIP

### 4. **transcripts/test-session-*.json** (ejemplos)
Ubicación: `sti-ai-chat/transcripts/`

Archivos de ejemplo para testing:
- `test-session-001-problematic.json`: Conversación con múltiples problemas
- `test-session-002-normal.json`: Conversación sin problemas

---

## 🚀 Cómo Usar Codex

### Paso 1: Acceder a la Vista
1. Ingresar al panel admin: `https://tu-dominio.com/admin.php`
2. Login con credenciales de administrador
3. Click en la pestaña **"Codex"**

### Paso 2: Explorar Sesiones
La tabla muestra:
- **Session ID**: Identificador único
- **Fecha**: Timestamp de la conversación
- **Mensajes**: Cantidad de intercambios
- **Duración**: Tiempo total de la conversación
- **Device**: Tipo de dispositivo (desktop/mobile/tablet)
- **Problemas**: Badge con cantidad de problemas detectados
  - ✅ Verde: Sin problemas
  - ⚠️ Rojo: Problemas detectados
- **Métricas**: Iconos con detalles:
  - 🔄 Loops
  - 😔 Disculpas
  - ❌ Errores
  - 🔁 Reformulaciones

### Paso 3: Filtrar y Ordenar
**Filtros disponibles:**
- ☑️ **Solo conversaciones problemáticas**: Checkbox que oculta sesiones sin problemas
- 🔍 **Buscar sesión**: Filtro por Session ID
- 📊 **Ordenar por**: 
  - Fecha (reciente primero)
  - Más problemas
  - Duración

### Paso 4: Ver Detalles
Click en **"Ver"** para abrir modal con:
- **Header**: Info de sesión (ID, fecha, device, cantidad de mensajes)
- **Métricas de problemas**: Desglose detallado de cada tipo de problema
- **Conversación completa**: Timeline con todos los mensajes
  - 👤 Mensajes del usuario (fondo azul)
  - 🤖 Mensajes del bot (fondo verde)
  - Timestamps de cada mensaje
- **Metadata técnica**: JSON con nlpAnalysis, visionAnalysis, stageTransitions

### Paso 5: Exportar para Copilot
Dos opciones:

#### Opción A: Exportación Individual
1. Abrir sesión con "Ver"
2. (Opcional) Agregar observaciones en el textarea
3. Click en **"Generar Paquete para Copilot"**
4. Se descarga archivo: `codex_SESSION-ID_20251205_143052.txt`

#### Opción B: Exportación Múltiple
1. Seleccionar checkbox de múltiples sesiones
2. Click en **"Exportar Seleccionadas (N)"**
3. Agregar observaciones generales (opcional)
4. Se descarga ZIP o TXT consolidado: `codex_bulk_20251205_143052.zip`

---

## 📄 Formato del Archivo de Exportación

El archivo `.txt` generado tiene esta estructura exacta (diseñada para análisis por Copilot):

```
=== TECNOS CODEX REPORT ===
sessionId: test-session-001-problematic
fecha: 2025-12-05 10:30:00
deviceDetectado: desktop
problemaDetectado: SÍ
loopsDetectados: 2
erroresDetectados: 1
disculpasRepetidas: 3
reformulacionesUsuario: 2
respuestasInesperadas: 1

--- Conversación ---
10:30:00 User: Hola, necesito ayuda con mi computadora
10:30:02 Bot: ¡Hola! Soy Tecnos, tu asistente técnico. ¿En qué puedo ayudarte hoy?
10:30:15 User: Mi PC no prende
...

--- Decisiones del Orquestador ---
stageInicial: greeting
stageFinal: error
transiciones: [
  { "from": "greeting", "to": "device_detection", "timestamp": "..." },
  ...
]

--- NLP / SMART_MODE ---
intent: technical_support
device: desktop
urgencia: high
confidence: 0.45

--- Vision Analysis ---
No se utilizó análisis de visión en esta conversación.

--- Problemas Detectados Automáticamente ---
- Tipo: loop | Mensaje: Entiendo que tienes un problema con tu computadora...
- Tipo: apology | Mensaje: Disculpa, no entendí bien tu problema...
- Tipo: reformulation | Mensaje: Como te decía, mi PC no enciende...

--- Observaciones para corrección ---
(Aquí el admin puede escribir manualmente)

=== FIN DEL REPORTE ===
```

---

## 🔧 Configuración Técnica

### Directorios de Transcripciones
Codex busca transcripts en estas ubicaciones (en orden):
1. `../transcripts/`
2. `../data/logs/transcripts/`
3. `../logs/transcripts/`
4. `./transcripts/`

### Patrones de Detección

**Disculpas:**
```php
['disculpa', 'perdón', 'lo siento', 'mis disculpas', 'lamento', 'perdona', 'disculpame', 'perdoname']
```

**Reformulaciones:**
```php
['como te decía', 'como mencioné', 'vuelvo a preguntarte', 'te repito', 'otra vez', 'de nuevo']
```

**Confusión del bot:**
```php
['no entendí', 'no comprendo', 'no te entiendo', 'podrías repetir', 'no quedó claro']
```

**Loops:**
- Compara mensajes consecutivos del bot
- Usa `similar_text()` con threshold del 85%

---

## 🔐 Seguridad

### Autenticación
- Solo accesible con sesión de administrador válida
- Timeout de sesión: 2 horas
- Todas las funciones protegidas por `$isAuthenticated`

### Protección de Archivos
- `.htaccess` en `codex-exports/` deniega acceso directo
- Downloads solo mediante script PHP con sesión validada
- No se exponen paths absolutos al cliente

### Sanitización
- Todos los outputs usan `escapeHtml()` o `htmlspecialchars()`
- Validación de parámetros en API endpoints
- Try-catch en todas las operaciones de archivo

---

## 🧪 Testing

### Con Transcripts de Ejemplo
1. Copiar `test-session-*.json` a `../transcripts/`
2. Recargar vista Codex
3. Verificar que aparecen 2 sesiones
4. `test-session-001` debe mostrar ⚠️ con múltiples problemas
5. `test-session-002` debe mostrar ✅ sin problemas

### Exportación Manual
```bash
# Probar API directamente
curl "http://localhost/admin.php?api=codex&action=list"
curl "http://localhost/admin.php?api=codex&action=details&sessionId=test-session-001-problematic"
```

---

## 🛠️ Troubleshooting

### "No hay sesiones disponibles"
- Verificar que existan archivos `.json` en directorios de transcripts
- Revisar permisos de lectura en directorios
- Verificar formato JSON válido de los archivos

### "Error al exportar"
- Verificar permisos de escritura en `codex-exports/`
- Revisar espacio en disco
- Verificar que `file_put_contents()` no esté deshabilitado

### "No se detectan problemas"
- Ajustar patrones en `codex-functions.php`
- Revisar estructura de mensajes en transcript JSON
- Verificar que campos `sender`, `text` existan

---

## 📊 Próximas Mejoras

- [ ] Integración con auto-learning: aplicar correcciones automáticas
- [ ] Alertas en tiempo real cuando se detecta problema crítico
- [ ] Dashboard con estadísticas agregadas (% de sesiones problemáticas)
- [ ] Exportación directa a GitHub Issues para tracking
- [ ] Análisis de sentimiento del usuario
- [ ] Detección de abandono prematuro

---

## 📞 Soporte

Para cualquier problema con Codex:
1. Revisar logs en `data/logs/server.log`
2. Verificar permisos de archivos
3. Consultar este README

**Importante:** Codex no modifica ningún código existente del sistema, solo lee transcripts y genera reportes para análisis manual.
