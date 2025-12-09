@echo off
REM ========================================================
REM INICIAR SERVIDOR STI CHAT EN MODO PRODUCCIÓN
REM ========================================================

echo.
echo ========================================================
echo   STI CHAT - MODO PRODUCCIÓN
echo ========================================================
echo.

REM Verificar si node está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no está instalado o no está en el PATH
    echo Por favor, instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

REM Mostrar versión de Node
echo [INFO] Node.js version:
node --version
echo.

REM Matar procesos previos en puerto 3000 (opcional)
echo [INFO] Liberando puerto 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    echo [INFO] Cerrando proceso %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo [INFO] Configurando variables de entorno para PRODUCCIÓN...
set NODE_ENV=production
set PORT=3000
set ALLOWED_ORIGINS=https://stia.com.ar,https://www.stia.com.ar,http://localhost:3000,http://127.0.0.1:3000

echo   NODE_ENV=%NODE_ENV%
echo   PORT=%PORT%
echo   ALLOWED_ORIGINS=%ALLOWED_ORIGINS%
echo.

REM Verificar que existe el directorio de calibración
if not exist "..\STI\public_html\calibracion" (
    echo [WARN] Directorio de calibración no encontrado, creándolo...
    mkdir "..\STI\public_html\calibracion" 2>nul
)

echo.
echo ========================================================
echo   SERVIDOR INICIANDO EN MODO PRODUCCIÓN
echo ========================================================
echo.
echo   URL principal:    http://localhost:3000
echo   Calibración:      http://localhost/admin.php (pestaña Calibración)
echo.
echo   Presiona Ctrl+C para detener el servidor
echo ========================================================
echo.

REM Iniciar servidor
node server.js

REM Si el servidor se cierra
echo.
echo [INFO] Servidor detenido
pause

