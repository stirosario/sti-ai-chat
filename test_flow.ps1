# Script de PowerShell para probar el flujo del chatbot STI con 4 conversaciones simuladas

$BaseUrl = "http://localhost:3002"
$Headers = @{
    'Origin' = 'http://localhost:3002'
    'Content-Type' = 'application/json'
}

function Start-ChatConversation {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/greeting" -Method GET -Headers $Headers
    $shortId = $response.sessionId.substring(0,8)
    Write-Host "Conversacion iniciada - SessionId: $shortId... Stage: $($response.stage)" -ForegroundColor Green
    Write-Host "Bot dice: $($response.reply)" -ForegroundColor Cyan
    Write-Host ""
    return $response.sessionId
}

function Send-ChatMessage {
    param(
        [string]$SessionId,
        [string]$Text,
        [string]$ButtonId
    )
    
    $body = @{ sessionId = $SessionId }
    if ($ButtonId) {
        $body.action = 'button'
        $body.value = $ButtonId
        $input = "[BUTTON: $ButtonId]"
    } else {
        $body.text = $Text
        $input = $Text
    }
    
    $json = $body | ConvertTo-Json
    Write-Host "DEBUG - Enviando JSON: $json" -ForegroundColor DarkGray
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method POST -Headers $Headers -Body $json
    
    Write-Host "Usuario: $input" -ForegroundColor Blue
    Write-Host "Stage: $($response.stage)" -ForegroundColor Yellow
    Write-Host "Bot dice: $($response.reply)" -ForegroundColor Cyan
    Write-Host ""
    
    Start-Sleep -Milliseconds 500
    return $response
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host "              TEST DE FLUJO DE CONVERSACION - STI CHATBOT                  " -ForegroundColor Magenta
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host ""

# SIMULACION 1: Usuario Anonimo - Mi compu no enciende
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host "SIMULACION 1: Usuario Anonimo - Mi compu no enciende" -ForegroundColor Magenta
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host ""

$sessionId1 = Start-ChatConversation
Send-ChatMessage -SessionId $sessionId1 -ButtonId "BTN_LANG_ES_AR" | Out-Null
Send-ChatMessage -SessionId $sessionId1 -ButtonId "BTN_NO_NAME" | Out-Null
Send-ChatMessage -SessionId $sessionId1 -ButtonId "BTN_HELP" | Out-Null
Send-ChatMessage -SessionId $sessionId1 -Text "mi compu no enciende" | Out-Null
Send-ChatMessage -SessionId $sessionId1 -Text "es una notebook HP Pavilion" | Out-Null
Send-ChatMessage -SessionId $sessionId1 -ButtonId "BTN_TESTS_DONE" | Out-Null

Write-Host "Simulacion 1 completada" -ForegroundColor Green

# SIMULACION 2: Roberto - Instalar app en Stick TV
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host "SIMULACION 2: Roberto - Instalar app en Stick TV" -ForegroundColor Magenta
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host ""

$sessionId2 = Start-ChatConversation
Send-ChatMessage -SessionId $sessionId2 -ButtonId "BTN_LANG_ES_ES" | Out-Null
Send-ChatMessage -SessionId $sessionId2 -Text "Roberto" | Out-Null
Send-ChatMessage -SessionId $sessionId2 -ButtonId "BTN_TASK" | Out-Null
Send-ChatMessage -SessionId $sessionId2 -Text "necesito ayuda para instalar una app en mi stick tv" | Out-Null
Send-ChatMessage -SessionId $sessionId2 -ButtonId "BTN_SOLVED" | Out-Null

Write-Host "Simulacion 2 completada" -ForegroundColor Green

# SIMULACION 3: Heber - Configurar WAN en MikroTik
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host "SIMULACION 3: Heber - Configurar WAN en MikroTik" -ForegroundColor Magenta
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host ""

$sessionId3 = Start-ChatConversation
Send-ChatMessage -SessionId $sessionId3 -ButtonId "BTN_LANG_EN" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -Text "Heber" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -ButtonId "BTN_HELP" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -Text "asistencia para configurar una conexión wan en un microtik" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -Text "MikroTik RB750Gr3" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -ButtonId "BTN_TESTS_FAIL" | Out-Null
Send-ChatMessage -SessionId $sessionId3 -ButtonId "BTN_YES" | Out-Null

Write-Host "Simulacion 3 completada" -ForegroundColor Green

# SIMULACION 4: Valeria - Notebook no enciende -> Ticket WhatsApp
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host "SIMULACION 4: Valeria - Notebook no enciende -> Ticket WhatsApp" -ForegroundColor Magenta
Write-Host "============================================================================" -ForegroundColor Magenta
Write-Host ""

$sessionId4 = Start-ChatConversation
Send-ChatMessage -SessionId $sessionId4 -ButtonId "BTN_LANG_ES_AR" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -Text "Valeria" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -ButtonId "BTN_HELP" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -Text "tu notebook no enciende" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -Text "Dell Inspiron 15" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -ButtonId "BTN_TESTS_FAIL" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -ButtonId "BTN_YES" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -Text "valeria@email.com" | Out-Null
Send-ChatMessage -SessionId $sessionId4 -Text "+54 9 11 1234-5678" | Out-Null

Write-Host "Simulacion 4 completada (TICKET GENERADO)" -ForegroundColor Green
Write-Host ""

Write-Host ""
Write-Host "TODAS LAS SIMULACIONES COMPLETADAS" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "Revisa los logs en: data/logs/flow-audit.csv" -ForegroundColor Cyan
Write-Host "Dashboard disponible en: http://localhost:3001/flow-audit.html" -ForegroundColor Cyan
Write-Host ""
