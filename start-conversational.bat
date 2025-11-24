@echo off
REM ========================================================
REM INICIAR SERVIDOR STI CHAT CONVERSACIONAL V2
REM ========================================================

echo.
echo ========================================================
echo   STI CHAT - SISTEMA CONVERSACIONAL V2
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

REM Matar procesos previos en puerto 3002 (opcional)
echo [INFO] Liberando puerto 3002...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do (
    echo [INFO] Cerrando proceso %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo [INFO] Configurando variables de entorno...
set NODE_ENV=development
set PORT=3002
set ALLOWED_ORIGINS=http://localhost:3002

echo.
echo ========================================================
echo   SERVIDOR INICIANDO EN PUERTO 3002
echo ========================================================
echo.
echo   URL principal:    http://localhost:3002
echo   Test visual:      http://localhost:3002/test-conversational.html
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
