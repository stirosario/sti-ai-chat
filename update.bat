@echo off
:: ===============================================
:: 🚀 DEPLOY STI Render desde Windows CMD
:: ===============================================
cd /d "C:\sti-ai-chat"

echo -----------------------------------------------
echo  🔄 Guardando y subiendo cambios a Render...
echo -----------------------------------------------

:: Preguntar mensaje de commit
set /p msg="📝 Escribí un mensaje para el commit (o deja vacío para 'update server.js'): "

if "%msg%"=="" (
    set msg=update server.js
)

echo.
echo 📁 Agregando archivos modificados...
git add .

echo.
echo 💬 Creando commit: "%msg%"
git commit -m "%msg%"

echo.
echo ⬆️  Enviando a GitHub (Render se redeploya solo)...
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ocurrió un error al hacer push. Verifica tu conexión o conflictos locales.
    pause
    exit /b
)

echo.
echo ✅ Listo! Render va a detectar el cambio y hacer el deploy automático.
echo.
echo 🔍 Podes ver el progreso en: https://render.com/dashboard
echo -----------------------------------------------
