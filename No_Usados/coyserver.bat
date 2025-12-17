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

:: Copiar archivo a BACKUPS
copy /Y "C:\sti-ai-chat\server.js" "E:\Lucas\Desktop\STI\BACKUPS\server.js"

:: Copiar y renombrar en JServer
copy /Y "C:\sti-ai-chat\server.js" "E:\Lucas\Desktop\STI\BACKUPS WEB STI\JServer\%filename%"

:: Forzar fecha de modificación usando PowerShell
powershell -Command "(Get-Item 'E:\Lucas\Desktop\STI\BACKUPS WEB STI\JServer\%filename%').LastWriteTime = Get-Date"

endlocal