@echo off
REM ================================
REM  CONFIGURACIÓN
REM ================================
set PROYECTO=C:\sti-ai-chat
set RAMA=main

REM ================================
REM  GENERAR FECHA-HORA DDMMYYYY-HHMM
REM ================================
for /f "tokens=1-3 delims=/" %%a in ("%date%") do (
    set DD=%%a
    set MM=%%b
    set YYYY=%%c
)

for /f "tokens=1-2 delims=: " %%a in ("%time%") do (
    set HH=%%a
    set MN=%%b
)

if "%HH:~0,1%"==" " set HH=0%HH:~1,1%

set FECHA=%DD%%MM%%YYYY%-%HH%%MN%


REM ================================
REM  IR A LA CARPETA DEL PROYECTO
REM ================================
cd /d "%PROYECTO%"


REM ================================
REM  REALIZAR DEPLOY
REM ================================
git add .
git commit -m "%FECHA%"
git push origin %RAMA%


REM ================================
REM  NOTIFICACIÓN WINDOWS
REM ================================
powershell -command "& {
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > \$null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)
(\$template.GetElementsByTagName('text'))[0].AppendChild(\$template.CreateTextNode('Deploy enviado a Render 🚀'))
(\$template.GetElementsByTagName('text'))[1].AppendChild(\$template.CreateTextNode('Commit: %FECHA%'))
(\$template.GetElementsByTagName('image'))[0].SetAttribute('src','C:\STI_SCRIPTS\sti_icon.ico')
$toast = [Windows.UI.Notifications.ToastNotification]::new(\$template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('STI Deploy')..Show($toast)
}"

