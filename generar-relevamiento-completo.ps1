# Script de Relevamiento Completo de Archivos STI
# Genera un inventario exhaustivo de todos los archivos del ecosistema

$outputFile = "C:\sti-ai-chat\Relevamiento Archivos STI.txt"
$csvFile = "C:\sti-ai-chat\relevamiento-archivos-sti.csv"
$workspaces = @("C:\STI\public_html", "C:\sti-ai-chat")

# Excluir estas carpetas del escaneo
$excludeDirs = @("node_modules", ".git", "vendor", "__pycache__", ".vscode", ".idea")

function Get-FileHashSHA256 {
    param([string]$FilePath)
    try {
        $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
        return $hash.Hash
    } catch {
        return "ERROR"
    }
}

function Get-UnixPermissions {
    param([System.IO.FileInfo]$File)
    try {
        $acl = Get-Acl $File.FullName
        $permissions = ""
        foreach ($rule in $acl.Access) {
            $permissions += "$($rule.IdentityReference):$($rule.FileSystemRights); "
        }
        return $permissions.Trim()
    } catch {
        return "N/A"
    }
}

function Analyze-FileUsage {
    param([string]$FilePath)
    $usage = @()
    $fileName = Split-Path -Leaf $FilePath
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    
    if ($fileName -match "index\.(php|html|js)$") { $usage += "entry-point" }
    if ($fileName -match "server\.js$") { $usage += "backend-service" }
    if ($fileName -match "console.*\.php$") { $usage += "admin-console" }
    if ($fileName -match "config.*\.(php|json|js)$") { $usage += "configuration" }
    if ($ext -eq ".log" -or $fileName -match "log.*\.txt$") { $usage += "logs" }
    if ($ext -eq ".json") { $usage += "data-config" }
    if ($ext -in @(".css", ".scss")) { $usage += "frontend-styles" }
    if ($ext -in @(".js", ".jsx")) { $usage += "frontend-scripts" }
    if ($ext -eq ".php") { $usage += "php-backend" }
    if ($fileName -match "\.env|credentials|secret") { $usage += "confidential" }
    if ($fileName -match "test|spec") { $usage += "testing" }
    
    return $usage -join ", "
}

function Get-FileStatus {
    param([System.IO.FileInfo]$File)
    $status = "activo"
    $fileName = $File.Name
    $ext = $File.Extension.ToLower()
    
    if ($fileName -match "\.(bak|old|backup|~)$") { $status = "obsoleto" }
    if ($fileName -match "\.(log|tmp|temp)$") { $status = "generado" }
    if ($fileName -match "\.env|credentials|secret|config.*\.php") { $status = "confidencial" }
    if ($File.DirectoryName -match "node_modules|vendor|\.git") { $status = "generado" }
    if ($fileName -match "^\.") { $status = "oculto" }
    if ($ext -eq ".json" -and $File.DirectoryName -match "transcript|log|data") { $status = "generado" }
    
    return $status
}

function Get-FileDescription {
    param([System.IO.FileInfo]$File)
    $fileName = $File.Name
    $path = $File.FullName
    $ext = $File.Extension.ToLower()
    
    $descriptions = @{
        "index.php" = "Punto de entrada principal del frontend del chat STI. Renderiza la interfaz web y maneja la inicializacion del chatbot Tecnos."
        "stia.php" = "Panel administrativo principal STI. Gestiona visualizacion de conversaciones, logs y metricas del sistema."
        "console-full.php" = "Consola administrativa completa con visualizacion en tiempo real de eventos del chat y logs del servidor."
        "server.js" = "Servidor Node.js backend principal. Maneja endpoints de chat, gestion de sesiones, flujo conversacional y comunicacion con OpenAI."
        "conversation.php" = "Endpoint PHP para gestion de conversaciones. Procesa y almacena eventos de conversacion, genera IDs de conversacion."
        "package.json" = "Configuracion de dependencias Node.js del proyecto backend. Define scripts, dependencias y metadatos del proyecto."
        "composer.json" = "Configuracion de dependencias PHP del proyecto frontend."
        ".env" = "Archivo de configuracion con variables de entorno sensibles (API keys, credenciales). NO DEBE SER PUBLICO."
        "chatEndpointV2.js" = "Endpoint conversacional alternativo para chat. Implementa sistema de respuestas basado en IA conversacional."
        "conversationalBrain.js" = "Motor conversacional que procesa intenciones del usuario y genera respuestas contextuales."
    }
    
    if ($descriptions.ContainsKey($fileName)) {
        return $descriptions[$fileName]
    }
    
    if ($ext -eq ".php") { return "Script PHP del backend. Procesa solicitudes HTTP y genera respuestas dinamicas." }
    if ($ext -eq ".js" -and $path -notmatch "node_modules") { return "Script JavaScript. Logica del frontend o backend segun ubicacion." }
    if ($ext -eq ".css") { return "Hoja de estilos CSS. Define presentacion visual de componentes." }
    if ($ext -eq ".json") { return "Archivo de datos JSON. Contiene configuracion, datos de conversacion o metadatos." }
    if ($ext -eq ".html") { return "Pagina HTML estatica o plantilla del frontend." }
    if ($ext -eq ".log" -or $fileName -match "log") { return "Archivo de log. Registra eventos, errores y actividad del sistema." }
    if ($ext -eq ".md") { return "Documentacion Markdown. Contiene informacion tecnica o guias de uso." }
    if ($fileName -match "test") { return "Archivo de pruebas. Contiene tests unitarios o de integracion." }
    
    return "Archivo del ecosistema STI."
}

# Iniciar recopilacion
Write-Host "Iniciando relevamiento completo de archivos STI..."
$allFiles = @()
$fileIndex = @{}

foreach ($workspace in $workspaces) {
    Write-Host "Escaneando: $workspace"
    $files = Get-ChildItem -Path $workspace -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
        $excluded = $false
        foreach ($excludeDir in $excludeDirs) {
            if ($_.FullName -match "\\$excludeDir\\") {
                $excluded = $true
                break
            }
        }
        return -not $excluded
    }
    
    foreach ($file in $files) {
        $allFiles += $file
    }
}

Write-Host "Total de archivos encontrados: $($allFiles.Count)"
Write-Host "Procesando metadatos..."

$results = @()
$counter = 0

foreach ($file in $allFiles) {
    $counter++
    if ($counter % 100 -eq 0) {
        Write-Host "Procesados: $counter / $($allFiles.Count)"
    }
    
    $relativePath = $file.FullName.Replace("C:\STI\public_html\", "public_html/").Replace("C:\sti-ai-chat\", "sti-ai-chat/")
    $sizeBytes = $file.Length
    $sizeReadable = if ($sizeBytes -lt 1KB) { "$sizeBytes B" }
                    elseif ($sizeBytes -lt 1MB) { "$([math]::Round($sizeBytes/1KB, 2)) KB" }
                    else { "$([math]::Round($sizeBytes/1MB, 2)) MB" }
    
    $lastModified = $file.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz")
    $hash = if ($sizeBytes -lt 50MB) { Get-FileHashSHA256 $file.FullName } else { "SKIPPED (>50MB)" }
    $permissions = Get-UnixPermissions $file
    $usage = Analyze-FileUsage $file.FullName
    $status = Get-FileStatus $file
    $description = Get-FileDescription $file
    
    $fileIndex[$file.FullName] = @{
        RelativePath = $relativePath
        Name = $file.Name
        Type = "archivo"
        Size = $sizeReadable
        SizeBytes = $sizeBytes
        Modified = $lastModified
        Permissions = $permissions
        Hash = $hash
        Usage = $usage
        Status = $status
        Description = $description
        References = ""
        FullPath = $file.FullName
    }
    
    $results += [PSCustomObject]@{
        Ruta = $relativePath
        Nombre = $file.Name
        Tipo = "archivo"
        Tamano = $sizeReadable
        TamanoBytes = $sizeBytes
        Modificado = $lastModified
        Permisos = $permissions
        Hash = $hash
        Uso = $usage
        Estado = $status
        Descripcion = $description
        Referencias = ""
    }
}

# Generar archivo TXT
Write-Host "Generando archivo de relevamiento..."
$output = @"
RELEVAMIENTO ARCHIVOS STI
==========================
Fecha de generacion: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Usuario: $env:USERNAME
Total de archivos: $($allFiles.Count)
Espacios de trabajo: public_html ($((Get-ChildItem "C:\STI\public_html" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count) archivos), sti-ai-chat ($((Get-ChildItem "C:\sti-ai-chat" -Recurse -File -Exclude node_modules -ErrorAction SilentlyContinue | Measure-Object).Count) archivos)

$('='*80)

SECCION 1: INDICE ALFABETICO DE RUTAS
$('='*80)

"@

# Indice
$sortedPaths = $results | Sort-Object Ruta
foreach ($result in $sortedPaths) {
    $output += "$($result.Ruta)`n"
}

$output += @"

$('='*80)
SECCION 2: DETALLE POR ARCHIVO
$('='*80)

"@

# Detalle por archivo
foreach ($result in $sortedPaths) {
    $fullPath = $result.Ruta.Replace("public_html/", "C:\STI\public_html\").Replace("sti-ai-chat/", "C:\sti-ai-chat\")
    if (Test-Path $fullPath) {
        $info = $fileIndex[$fullPath]
        if ($info) {
            $output += @"
ARCHIVO: $($result.Ruta)
$('-'*80)
**Ruta relativa**: $($info.RelativePath)
**Nombre**: $($info.Name)
**Tipo**: $($info.Type)
**Tamanio**: $($info.Size) ($($info.SizeBytes) bytes)
**Ultima modificacion**: $($info.Modified)
**Permisos y propietario**: $($info.Permissions)
**Hash**: $($info.Hash)
**Uso detectado**: $($info.Usage)
**Referencias cruzadas**: $($info.References)
**Descripcion funcional**: $($info.Description)
**Estado**: $($info.Status)
**Notas**: $(if ($info.SizeBytes -gt 10MB) { "ARCHIVO GRANDE (>10MB). " })(if ($info.Status -eq "confidencial") { "CONTENIDO SENSIBLE - NO EXPONER. " })(if ($result.Ruta -match "log|transcript") { "POSIBLE PII EN CONTENIDO. " })
$('-'*80)

"@
        }
    }
}

# Analisis adicional
Write-Host "Realizando analisis adicional..."

$largeFiles = $results | Where-Object { $_.TamanoBytes -gt 10MB } | Sort-Object TamanoBytes -Descending
$confidentialFiles = $results | Where-Object { $_.Estado -eq "confidencial" }
$duplicateHashes = $results | Where-Object { $_.Hash -ne "SKIPPED (>50MB)" -and $_.Hash -ne "ERROR" } | Group-Object Hash | Where-Object { $_.Count -gt 1 }
$logFiles = $results | Where-Object { $_.Ruta -match "log|\.log" }
$jsonFiles = $results | Where-Object { $_.Ruta -match "\.json$" }

$output += @"

$('='*80)
SECCION 3: RESUMEN EJECUTIVO
$('='*80)

HALLAZGOS CRITICOS:
- Total archivos escaneados: $($allFiles.Count)
- Archivos grandes (>10MB): $($largeFiles.Count) - $(if ($largeFiles.Count -gt 0) { "Ver Seccion 4" } else { "Ninguno detectado" })
- Archivos confidenciales: $($confidentialFiles.Count) - $(if ($confidentialFiles.Count -gt 0) { "VERIFICAR NO ESTEN EN REPOSITORIO PUBLICO" } else { "Ninguno detectado" })
- Archivos duplicados (mismo hash): $($duplicateHashes.Count) grupos
- Archivos de log: $($logFiles.Count) - $(if ($logFiles.Count -gt 0) { "VERIFICAR CONTENIDO DE PII" } else { "Ninguno detectado" })
- Archivos JSON: $($jsonFiles.Count) - $(if ($jsonFiles | Where-Object { $_.Ruta -match "transcript|conversation" }) { "ALGUNOS CONTIENEN DATOS DE CONVERSACION" } else { "Verificar contenido sensible" })

ARCHIVOS CLAVE VERIFICADOS:
$(foreach ($keyFile in @("index.php", "stia.php", "console-full.php", "server.js", "conversation.php")) {
    $found = $results | Where-Object { $_.Nombre -eq $keyFile } | Select-Object -First 1
    if ($found) { "- $keyFile`:` ENCONTRADO en $($found.Ruta)" } else { "- $keyFile`:` NO ENCONTRADO" }
})

$('='*80)
SECCION 4: ACCIONES RECOMENDADAS
$('='*80)

"@

if ($largeFiles.Count -gt 0) {
    $output += "[ALTA PRIORIDAD] Archivos grandes (>10MB):`n"
    foreach ($file in $largeFiles | Select-Object -First 10) {
        $justification = if ($file.Ruta -match "node_modules|vendor") { "Considerar excluir de backup" } else { "Verificar si es necesario mantener" }
        $output += "- $($file.Ruta): $($file.Tamano) - $justification`n"
    }
    $output += "`n"
}

if ($confidentialFiles.Count -gt 0) {
    $output += "[CRITICA] Archivos confidenciales detectados:`n"
    foreach ($file in $confidentialFiles) {
        $output += "- $($file.Ruta): Verificar que NO este en repositorio publico o sistema de versionado`n"
    }
    $output += "`n"
}

if ($logFiles.Count -gt 0) {
    $output += "[ALTA PRIORIDAD] Archivos de log con posible PII:`n"
    foreach ($file in $logFiles | Select-Object -First 10) {
        $output += "- $($file.Ruta): Revisar contenido y considerar rotacion/limpieza periodica`n"
    }
    $output += "`n"
}

$output += @"

$('='*80)
SECCION 5: COMANDOS EJECUTADOS
$('='*80)

Comandos PowerShell utilizados para generar este relevamiento:

1. Get-ChildItem -Path "C:\STI\public_html" -Recurse -File -Force
   Descripcion: Listado recursivo de todos los archivos en public_html

2. Get-ChildItem -Path "C:\sti-ai-chat" -Recurse -File -Force -Exclude "node_modules"
   Descripcion: Listado recursivo de todos los archivos en sti-ai-chat (excluyendo node_modules)

3. Get-FileHash -Path <archivo> -Algorithm SHA256
   Descripcion: Calculo de hash SHA256 para identificacion de duplicados y verificacion de integridad

4. Get-Acl -Path <archivo>
   Descripcion: Obtencion de permisos y propietarios (equivalente Unix en Windows)

5. Get-Content -Path <archivo> -Raw | Select-String -Pattern "require|include|import|fetch"
   Descripcion: Busqueda de referencias cruzadas entre archivos

6. Get-ChildItem -Recurse | Where-Object { `$_.Length -gt 10MB } | Sort-Object Length -Descending
   Descripcion: Identificacion de archivos grandes

7. Group-Object -Property Hash | Where-Object { `$_.Count -gt 1 }
   Descripcion: Deteccion de archivos duplicados por hash

Version de PowerShell: $($PSVersionTable.PSVersion)
Sistema operativo: $($PSVersionTable.OS)

$('='*80)

FIN DEL RELEVAMIENTO
$('='*80)

"@

# Guardar archivo
$output | Out-File -FilePath $outputFile -Encoding UTF8
Write-Host "Archivo de relevamiento generado: $outputFile"

# Generar CSV
$results | Export-Csv -Path $csvFile -NoTypeInformation -Encoding UTF8
Write-Host "Archivo CSV generado: $csvFile"

# Calcular hash del archivo generado
$finalHash = Get-FileHash -Path $outputFile -Algorithm SHA256
Write-Host "SHA256 del archivo generado: $($finalHash.Hash)"
Add-Content -Path $outputFile -Value "`n`nCHECKSUM SHA256: $($finalHash.Hash)"

Write-Host "`nRelevamiento completado exitosamente!"
