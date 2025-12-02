@echo off
setlocal

:: Obtener fecha y hora actual
for /f "tokens=2 delims==" %%I in ('"wmic os get localdatetime /value"') do set datetime=%%I
set dd=%datetime:~6,2%
set mm=%datetime:~4,2%
set aaaa=%datetime:~0,4%
set hh=%datetime:~8,2%
set min=%datetime:~10,2%

:: Construir nombre de archivo
set filename=server%dd%%mm%%aaaa%%hh%%min%.js

:: Construir mensaje de commit automático
set commitmsg=%dd%%mm%%aaaa%-%hh%%min%

:: Copiar archivo a BACKUPS
copy /Y "C:\sti-ai-chat\server.js" "E:\Lucas\Desktop\STI\BACKUPS\server.js"

:: Copiar y renombrar en JServer
copy /Y "C:\sti-ai-chat\server.js" "E:\Lucas\Desktop\STI\BACKUPS WEB STI\JServer\%filename%"

:: Forzar fecha de modificación usando PowerShell
powershell -Command "(Get-Item 'E:\Lucas\Desktop\STI\BACKUPS WEB STI\JServer\%filename%').LastWriteTime = Get-Date"

:: ===============================================
:: 🚀 DEPLOY STI Render desde Windows CMD
:: ===============================================
cd /d "C:\sti-ai-chat"

echo -----------------------------------------------
echo  🔄 Guardando y subiendo cambios a Render...
echo -----------------------------------------------

echo.
echo 📁 Agregando archivos modificados...
git add .

echo.
echo 💬 Creando commit: "%commitmsg%"
git commit -m "%commitmsg%"

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
