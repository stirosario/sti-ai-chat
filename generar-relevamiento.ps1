# Script para generar Relevamiento Completo de Archivos STI
# Genera: Relevamiento Archivos STI.txt

$ErrorActionPreference = "Continue"
$outputFile = "Relevamiento Archivos STI.txt"
$csvFile = "relevamiento-archivos-sti.csv"

# Rutas base
$rutaChat = "C:\sti-ai-chat"
$rutaWeb = "C:\STI\public_html"

# Archivos clave a buscar
$archivosClave = @("index.php", "stia.php", "console-full.php", "server.js", "conversation.php")

# Inicializar estructuras
$archivos = @()
$referencias = @{}
$duplicados = @{}
$archivosGrandes = @()
$archivosConfidenciales = @()
$archivosConPII = @()
$permisosInseguros = @()

function Get-FileHashSHA256 {
    param($FilePath)
    try {
        $hash = Get-FileHash -Path $FilePath -Algorithm SHA256 -ErrorAction SilentlyContinue
        return $hash.Hash
    } catch {
        return "ERROR"
    }
}

function Format-Size {
    param($Bytes)
    if ($Bytes -lt 1KB) { return "$Bytes B" }
    elseif ($Bytes -lt 1MB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    elseif ($Bytes -lt 1GB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    else { return "{0:N2} GB" -f ($Bytes / 1GB) }
}

function Get-FileInfo {
    param($FilePath, $BasePath)
    
    try {
        $file = Get-Item -Path $FilePath -Force -ErrorAction SilentlyContinue
        if (-not $file) { return $null }
        
        $relPath = $FilePath.Replace($BasePath, "").TrimStart("\")
        $hash = Get-FileHashSHA256 -FilePath $FilePath
        $size = $file.Length
        $modified = $file.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
        
        # Permisos (simulado en Windows)
        $perms = "N/A (Windows)"
        $owner = "N/A"
        try {
            $acl = Get-Acl -Path $FilePath -ErrorAction SilentlyContinue
            $owner = $acl.Owner
        } catch {}
        
        # Tipo
        $type = "archivo"
        if ($file.LinkType) { $type = "enlace simbólico" }
        
        # Detectar archivos confidenciales
        $confidencial = $false
        if ($relPath -match "\.env$|config\.php$|credentials|secret|password|key") {
            $confidencial = $true
            $script:archivosConfidenciales += $relPath
        }
        
        # Archivos grandes (10MB = 10485760 bytes)
        if ($size -gt 10485760) {
            $script:archivosGrandes += @{
                Path = $relPath
                Size = $size
            }
        }
        
        return @{
            RutaRelativa = $relPath
            Nombre = $file.Name
            Tipo = $type
            TamanoBytes = $size
            TamanoLegible = Format-Size -Bytes $size
            UltimaModificacion = $modified
            Permisos = $perms
            Propietario = $owner
            HashSHA256 = $hash
            Confidencial = $confidencial
            RutaCompleta = $FilePath
        }
    } catch {
        return $null
    }
}

function Buscar-Referencias {
    param($FilePath, $BasePath)
    
    $referenciasEncontradas = @()
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    
    if ($ext -in @(".js", ".php", ".ts", ".jsx", ".tsx")) {
        try {
            $content = Get-Content -Path $FilePath -Raw -ErrorAction SilentlyContinue
            if ($content) {
                # Buscar require, include, import, fetch
                $patterns = @(
                    "(require\(['""]([^'""]+)['""]\))",
                    "(include\(['""]([^'""]+)['""]\))",
                    "(import\s+.*from\s+['""]([^'""]+)['""])",
                    "(fetch\(['""]([^'""]+)['""])",
                    "(from\s+['""]([^'""]+)['""])"
                )
                
                $lineNum = 1
                $content -split "`n" | ForEach-Object {
                    $line = $_
                    foreach ($pattern in $patterns) {
                    if ($line -match $pattern) {
                        $match = $matches[1]
                        if (-not $match) { $match = $matches[2] }
                        if ($match) {
                            $referenciasEncontradas += "${FilePath}:${lineNum} - ${match}"
                        }
                    }
                    }
                    $lineNum++
                }
            }
        } catch {}
    }
    
    return $referenciasEncontradas
}

function Analizar-LogJSON {
    param($FilePath)
    
    $tienePII = $false
    $muestra = @()
    
    try {
        $content = Get-Content -Path $FilePath -TotalCount 10 -ErrorAction SilentlyContinue
        if ($content) {
            $content | ForEach-Object {
                if ($_ -match "session_id|conversation_id|user_id|email|phone|nombre|apellido") {
                    $tienePII = $true
                }
            }
            $muestra = $content | Select-Object -First 3
        }
    } catch {}
    
    return @{
        TienePII = $tienePII
        Muestra = $muestra
    }
}

Write-Host "Iniciando relevamiento de archivos STI..."
Write-Host "Ruta Chat: $rutaChat"
Write-Host "Ruta Web: $rutaWeb"

# Recopilar archivos de sti-ai-chat
Write-Host "`nRecopilando archivos de sti-ai-chat..."
Get-ChildItem -Path $rutaChat -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    $info = Get-FileInfo -FilePath $_.FullName -BasePath $rutaChat
    if ($info) {
        $info.BasePath = "sti-ai-chat"
        $archivos += $info
    }
}

# Recopilar archivos de public_html
Write-Host "Recopilando archivos de public_html..."
Get-ChildItem -Path $rutaWeb -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    $info = Get-FileInfo -FilePath $_.FullName -BasePath $rutaWeb
    if ($info) {
        $info.BasePath = "public_html"
        $archivos += $info
    }
}

Write-Host "`nTotal de archivos encontrados: $($archivos.Count)"

# Buscar referencias en archivos clave
Write-Host "`nBuscando referencias cruzadas..."
$archivosClave | ForEach-Object {
    $archivo = $_
    $encontrados = $archivos | Where-Object { $_.Nombre -eq $archivo }
    $encontrados | ForEach-Object {
        $refs = Buscar-Referencias -FilePath $_.RutaCompleta -BasePath $_.BasePath
        $referencias[$_.RutaRelativa] = $refs
    }
}

# Analizar logs y JSON
Write-Host "Analizando logs y JSON..."
$archivos | Where-Object { $_.Nombre -match "\.(log|json)$" } | ForEach-Object {
    $analisis = Analizar-LogJSON -FilePath $_.RutaCompleta
    if ($analisis.TienePII) {
        $archivosConPII += $_.RutaRelativa
    }
}

# Detectar duplicados por hash
Write-Host "Detectando duplicados..."
$hashGroups = $archivos | Where-Object { $_.HashSHA256 -ne "ERROR" } | Group-Object HashSHA256
$hashGroups | Where-Object { $_.Count -gt 1 } | ForEach-Object {
    $duplicados[$_.Name] = $_.Group.RutaRelativa
}

Write-Host "`nGenerando documento..."

# Generar documento
$sb = New-Object System.Text.StringBuilder

# Encabezado
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("RELEVAMIENTO ARCHIVOS STI") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')") | Out-Null
$sb.AppendLine("Usuario: $env:USERNAME") | Out-Null
$sb.AppendLine("Sistema: $env:COMPUTERNAME") | Out-Null
$sb.AppendLine("") | Out-Null

# Sección 1: Índice alfabético
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("SECCION 1: INDICE ALFABETICO DE RUTAS") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("") | Out-Null

$archivos | Sort-Object RutaRelativa | ForEach-Object {
    $sb.AppendLine($_.RutaRelativa) | Out-Null
}

$sb.AppendLine("") | Out-Null
$sb.AppendLine("Total de archivos: $($archivos.Count)") | Out-Null
$sb.AppendLine("") | Out-Null

# Sección 2: Detalle por archivo
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("SECCION 2: DETALLE POR ARCHIVO") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("") | Out-Null

$archivos | Sort-Object RutaRelativa | ForEach-Object {
    $f = $_
    
    $sb.AppendLine("-" * 80) | Out-Null
    $sb.AppendLine("**Ruta relativa**: $($f.RutaRelativa)") | Out-Null
    $sb.AppendLine("**Nombre**: $($f.Nombre)") | Out-Null
    $sb.AppendLine("**Tipo**: $($f.Tipo)") | Out-Null
    $sb.AppendLine("**Tamano**: $($f.TamanoBytes) bytes ($($f.TamanoLegible))") | Out-Null
    $sb.AppendLine("**Última modificación**: $($f.UltimaModificacion)") | Out-Null
    $sb.AppendLine("**Permisos y propietario**: $($f.Permisos) | $($f.Propietario)") | Out-Null
    $sb.AppendLine("**Hash**: $($f.HashSHA256)") | Out-Null
    
    # Uso detectado
    $uso = @()
    if ($f.Nombre -match "\.php$") { $uso += "backend" }
    if ($f.Nombre -match "\.js$" -and $f.RutaRelativa -notmatch "node_modules") { $uso += "frontend/backend" }
    if ($f.Nombre -match "\.(css|html)$") { $uso += "frontend" }
    if ($f.Nombre -eq "server.js") { $uso += "servicio Node.js" }
    if ($f.Nombre -match "\.json$" -and $f.RutaRelativa -match "package") { $uso += "dependencias" }
    if ($f.Nombre -match "\.log$") { $uso += "logs" }
    $sb.AppendLine("**Uso detectado**: $($uso -join ', ')") | Out-Null
    
    # Referencias cruzadas
    $refs = $referencias[$f.RutaRelativa]
    if ($refs -and $refs.Count -gt 0) {
        $sb.AppendLine("**Referencias cruzadas**:") | Out-Null
        $refs | Select-Object -First 5 | ForEach-Object {
            $sb.AppendLine("  - $_") | Out-Null
        }
    } else {
        $sb.AppendLine("**Referencias cruzadas**: Ninguna detectada") | Out-Null
    }
    
    # Descripción funcional
    $desc = "Archivo del ecosistema STI"
    if ($f.Nombre -eq "index.php") { $desc = "Punto de entrada principal del sitio web STI" }
    elseif ($f.Nombre -eq "stia.php") { $desc = "API principal del sistema de chat STI" }
    elseif ($f.Nombre -eq "console-full.php") { $desc = "Consola administrativa completa del sistema" }
    elseif ($f.Nombre -eq "server.js") { $desc = "Servidor Node.js principal del chat STI" }
    elseif ($f.Nombre -eq "conversation.php") { $desc = "Endpoint para gestión de conversaciones" }
    elseif ($f.Nombre -match "\.log$") { $desc = "Archivo de log del sistema" }
    elseif ($f.Nombre -match "package\.json$") { $desc = "Configuración de dependencias Node.js" }
    elseif ($f.Nombre -match "\.env$") { $desc = "Variables de entorno (CONFIDENCIAL)" }
    elseif ($f.Nombre -match "config\.php$") { $desc = "Archivo de configuración PHP (CONFIDENCIAL)" }
    $sb.AppendLine("**Descripción funcional**: $desc") | Out-Null
    
    # Estado
    $estado = "activo"
    if ($f.Nombre -match "\.bak$|\.backup$|\.old$") { $estado = "backup/obsoleto" }
    if ($f.RutaRelativa -match "node_modules|vendor") { $estado = "generado" }
    if ($f.Confidencial) { $estado = "confidencial" }
    if ($duplicados.Values -contains $f.RutaRelativa) { $estado = "duplicado" }
    $sb.AppendLine("**Estado**: $estado") | Out-Null
    
    # Notas
    $notas = @()
    if ($f.Confidencial) { $notas += "ARCHIVO CONFIDENCIAL - Contiene credenciales o configuración sensible" }
    if ($archivosConPII -contains $f.RutaRelativa) { $notas += "POSIBLE PII - Contiene datos personales identificables" }
    if ($f.TamanoBytes -gt 10485760) { $notas += "ARCHIVO GRANDE - Requiere revision" }
    if ($notas.Count -eq 0) { $notas += "Sin problemas detectados" }
    $sb.AppendLine("**Notas**: $($notas -join ' | ')") | Out-Null
    
    $sb.AppendLine("") | Out-Null
}

# Sección 3: Resumen ejecutivo
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("SECCION 3: RESUMEN EJECUTIVO") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Total de archivos relevados**: $($archivos.Count)") | Out-Null
$sb.AppendLine("**Archivos clave encontrados**:") | Out-Null
$archivosClave | ForEach-Object {
    $clave = $_
    $encontrados = $archivos | Where-Object { $_.Nombre -eq $clave }
    if ($encontrados) {
        $encontrados | ForEach-Object {
            $sb.AppendLine("  - $($_.RutaRelativa)") | Out-Null
        }
    } else {
        $sb.AppendLine("  - ${clave}: NO ENCONTRADO") | Out-Null
    }
}
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Archivos confidenciales detectados**: $($archivosConfidenciales.Count)") | Out-Null
$archivosConfidenciales | ForEach-Object {
    $sb.AppendLine("  - $_") | Out-Null
}
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Archivos con posible PII**: $($archivosConPII.Count)") | Out-Null
$archivosConPII | Select-Object -First 10 | ForEach-Object {
    $sb.AppendLine("  - $_") | Out-Null
}
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Archivos grandes (>10MB)**: $($archivosGrandes.Count)") | Out-Null
$archivosGrandes | ForEach-Object {
    $sb.AppendLine("  - $($_.Path): $($_.Size) bytes") | Out-Null
}
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Duplicados detectados**: $($duplicados.Count)") | Out-Null
$duplicados.Keys | Select-Object -First 5 | ForEach-Object {
    $hashShort = if ($_.Length -gt 16) { $_.Substring(0, 16) } else { $_ }
    $sb.AppendLine("  - Hash: ${hashShort}...") | Out-Null
    $duplicados[$_] | ForEach-Object {
        $sb.AppendLine("    * $_") | Out-Null
    }
}
$sb.AppendLine("") | Out-Null

# Sección 4: Acciones recomendadas
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("SECCION 4: ACCIONES RECOMENDADAS") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("") | Out-Null

if ($archivosConfidenciales.Count -gt 0) {
    $sb.AppendLine("**ALTA PRIORIDAD**:") | Out-Null
    $sb.AppendLine("  - Verificar que archivos confidenciales (.env, config.php) no estén en repositorio público") | Out-Null
    $sb.AppendLine("  - Implementar .gitignore para excluir archivos sensibles") | Out-Null
    $sb.AppendLine("") | Out-Null
}

if ($archivosConPII.Count -gt 0) {
    $sb.AppendLine("**ALTA PRIORIDAD**:") | Out-Null
    $sb.AppendLine("  - Revisar logs y JSON que contienen PII") | Out-Null
    $sb.AppendLine("  - Implementar rotación y eliminación automática de logs antiguos") | Out-Null
    $sb.AppendLine("") | Out-Null
}

if ($archivosGrandes.Count -gt 0) {
    $sb.AppendLine("**MEDIA PRIORIDAD**:") | Out-Null
    $sb.AppendLine("  - Revisar archivos grandes y considerar compresión o almacenamiento externo") | Out-Null
    $sb.AppendLine("") | Out-Null
}

if ($duplicados.Count -gt 0) {
    $sb.AppendLine("**BAJA PRIORIDAD**:") | Out-Null
    $sb.AppendLine("  - Evaluar eliminación de archivos duplicados para reducir tamaño") | Out-Null
    $sb.AppendLine("") | Out-Null
}

# Sección 5: Comandos usados
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("SECCION 5: COMANDOS Y METADATOS") | Out-Null
$sb.AppendLine("=" * 80) | Out-Null
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Comandos ejecutados**:") | Out-Null
$sb.AppendLine("  - Get-ChildItem -Recurse -Force -File (PowerShell)") | Out-Null
$sb.AppendLine("  - Get-FileHash -Algorithm SHA256") | Out-Null
$sb.AppendLine("  - Get-Content para análisis de referencias") | Out-Null
$sb.AppendLine("") | Out-Null

$sb.AppendLine("**Versión PowerShell**: $($PSVersionTable.PSVersion)") | Out-Null
$sb.AppendLine("**Sistema operativo**: $($env:OS)") | Out-Null
$sb.AppendLine("") | Out-Null

# Guardar archivo
$contenido = $sb.ToString()
$contenido | Out-File -FilePath $outputFile -Encoding UTF8

# Generar hash del archivo
$hashFinal = Get-FileHashSHA256 -FilePath $outputFile
$sb.AppendLine("**SHA256 del relevamiento**: $hashFinal") | Out-Null
$sb.AppendLine("") | Out-Null

# Actualizar archivo con hash
$contenido = $sb.ToString()
$contenido | Out-File -FilePath $outputFile -Encoding UTF8

Write-Host "`nRelevamiento completado!"
Write-Host "Archivo generado: $outputFile"
Write-Host "SHA256: $hashFinal"
Write-Host "Total de archivos: $($archivos.Count)"

