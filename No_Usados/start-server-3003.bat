@echo off
set PORT=3003
set NODE_ENV=development
cd C:\sti-ai-chat
echo Iniciando servidor STI en puerto 3003 con debugging...
node server.js 2>&1 | more
pause
