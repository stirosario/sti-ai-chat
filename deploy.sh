#!/bin/bash
# ===============================================
# 🚀 DEPLOY STI Render desde Linux/macOS
# ===============================================

set -e  # Exit on error

# Obtener fecha y hora actual
dd=$(date +%d)
mm=$(date +%m)
aaaa=$(date +%Y)
hh=$(date +%H)
min=$(date +%M)

# Construir mensaje de commit automático
commitmsg="${dd}${mm}${aaaa}-${hh}${min}"

# Nota: Las rutas de backup son específicas de Windows y solo se ejecutan en ese entorno
# En Linux/macOS, esta sección se omite ya que las rutas E:\ son específicas de Windows

echo "-----------------------------------------------"
echo " 🔄 Guardando y subiendo cambios a Render..."
echo "-----------------------------------------------"

echo ""
echo "🔍 Verificando estado del repositorio..."
# Verificar si hay cambios antes de hacer git add
has_changes=false

# Verificar cambios en archivos rastreados (maneja repositorios vacíos con || true)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    has_changes=true
fi

# Verificar archivos sin rastrear
if [ -n "$(git ls-files --others --exclude-standard)" ]; then
    has_changes=true
fi

if [ "$has_changes" = false ]; then
    echo ""
    echo "ℹ️  No hay cambios para commitear. El repositorio está actualizado."
    exit 0
fi

echo ""
echo "📁 Agregando archivos modificados..."
git add .

echo ""
echo "💬 Creando commit: \"$commitmsg\""
git commit -m "$commitmsg"

echo ""
echo "⬆️  Enviando a GitHub (Render se redeploya solo)..."
# Obtener la rama actual
current_branch=$(git rev-parse --abbrev-ref HEAD)
if ! git push origin "$current_branch"; then
    echo ""
    echo "❌ Ocurrió un error al hacer push. Verifica tu conexión o conflictos locales."
    exit 1
fi

echo ""
echo "✅ Listo! Render va a detectar el cambio y hacer el deploy automático."
echo ""
echo "🔍 Podes ver el progreso en: https://render.com/dashboard"
echo "-----------------------------------------------"
