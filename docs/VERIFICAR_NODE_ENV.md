# 🔍 CÓMO VERIFICAR Y CONFIGURAR NODE_ENV=production

**Fecha**: 2025-12-07

---

## ✅ VERIFICAR SI ESTÁ CONFIGURADO

### Opción 1: Verificar en el archivo .env

Abre el archivo `.env` en la raíz del proyecto y busca:

```bash
NODE_ENV=production
```

### Opción 2: Verificar al arrancar el servidor

Si `NODE_ENV=production` está configurado, al arrancar verás:

```
================================================================================
🔒 VALIDACIÓN DE CONFIGURACIÓN DE PRODUCCIÓN
================================================================================
✅ NODE_ENV=production
...
```

Si **NO** está configurado, verás solo advertencias (no bloquea en desarrollo).

---

## 🔧 CÓMO CONFIGURARLO

### 1. Abrir archivo .env

Abre el archivo `.env` en la raíz del proyecto (`c:\sti-ai-chat\.env`)

### 2. Agregar o verificar la línea

Agrega o verifica que tenga:

```bash
NODE_ENV=production
```

### 3. Formato correcto

- ✅ Correcto: `NODE_ENV=production`
- ❌ Incorrecto: `NODE_ENV = production` (con espacios)
- ❌ Incorrecto: `NODE_ENV="production"` (con comillas, aunque funciona)
- ❌ Incorrecto: `NODE_ENV production` (sin =)

---

## 📋 ARCHIVO .env COMPLETO PARA PRODUCCIÓN

Tu archivo `.env` debe tener al menos:

```bash
# ========================================================
# ENTORNO
# ========================================================
NODE_ENV=production

# ========================================================
# SEGURIDAD (OBLIGATORIO)
# ========================================================
LOG_TOKEN=<tu-token-generado>
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com

# ========================================================
# OPENAI (PARA IA AVANZADA)
# ========================================================
OPENAI_API_KEY=sk-tu-api-key-aqui
```

---

## 🚨 IMPORTANCIA DE NODE_ENV=production

Cuando `NODE_ENV=production` está configurado:

1. ✅ **Activa validaciones estrictas** de variables críticas
2. ✅ **LOG_TOKEN es obligatorio** (si falta, servidor no arranca)
3. ✅ **ALLOWED_ORIGINS es obligatorio** (si falta, servidor no arranca)
4. ✅ **No escribe tokens a archivos** (seguridad)
5. ✅ **No muestra stack traces** en errores (seguridad)

---

## 🔍 VERIFICACIÓN RÁPIDA

### Comando para verificar (PowerShell):

```powershell
cd c:\sti-ai-chat
Select-String -Path .env -Pattern "NODE_ENV"
```

### Comando para verificar (CMD):

```cmd
cd c:\sti-ai-chat
findstr /i "NODE_ENV" .env
```

---

## ✅ RESPUESTA DIRECTA

**¿Está `NODE_ENV=production` configurado?**

Para saberlo, verifica tu archivo `.env`. Si no está, agrégalo:

```bash
NODE_ENV=production
```

**El código está listo** para validarlo cuando arranques el servidor. Si falta, verás advertencias pero el servidor arrancará (en desarrollo). En producción, las validaciones son más estrictas.

---

**Última actualización**: 2025-12-07
