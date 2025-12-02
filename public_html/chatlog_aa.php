<?php
/**
 * ============================================
 * 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
 * ============================================
 * Archivo: chatlog.php
 * Propósito: Panel de visualización de logs en tiempo real
 * Seguridad: Sesiones PHP + Token LOG_TOKEN + SSE
 * Autor: Sistema STI - GitHub Copilot + Lucas
 * Última modificación: 25/11/2025
 * 
 * ADVERTENCIA: Este código es parte del sistema de 
 * autenticación crítico. Modificaciones no autorizadas
 * pueden comprometer la seguridad del sistema.
 * ============================================
 */

session_start();

// Verificar autenticación
if (!isset($_SESSION['logs_authenticated']) || $_SESSION['logs_authenticated'] !== true) {
    header('Location: login-logs.php');
    exit;
}

// Verificar timeout de sesión (2 horas)
$session_timeout = 7200; // 2 horas en segundos
if (isset($_SESSION['logs_login_time']) && (time() - $_SESSION['logs_login_time']) > $session_timeout) {
    session_destroy();
    header('Location: login-logs.php?timeout=1');
    exit;
}

// Actualizar tiempo de actividad
$_SESSION['logs_login_time'] = time();

// Obtener usuario actual
$current_user = $_SESSION['logs_user'] ?? 'admin';

// Intentar leer token de logs generado por el servidor Node (si existe)
$logToken = '';
$candidatePaths = [
  '/data/logs/log_token.txt',
  __DIR__ . '/logs/log_token.txt',
  __DIR__ . '/../data/logs/log_token.txt',
  __DIR__ . '/../../data/logs/log_token.txt'
];
foreach ($candidatePaths as $p) {
  if (file_exists($p) && is_readable($p)) {
    $logToken = trim(file_get_contents($p));
    break;
  }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logs en vivo — STI Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: 
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(92,200,255,0.15), transparent),
        linear-gradient(180deg, #0a0e14 0%, #0f161e 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: 
        radial-gradient(1200px 160px at 50% -180px, rgba(255,255,255,.05), transparent 60%),
        linear-gradient(180deg, rgba(15,22,30,.95), rgba(10,14,20,.95));
      border: 1px solid rgba(92,200,255,0.3);
      border-radius: 12px;
      box-shadow: 
        0 20px 60px rgba(0,0,0,0.5),
        0 0 28px rgba(92,200,255,0.25),
        inset 0 0 14px rgba(92,200,255,0.15);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, rgba(92,200,255,0.2) 0%, rgba(0,229,255,0.2) 100%);
      border-bottom: 1px solid rgba(92,200,255,0.3);
      color: white;
      padding: 20px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #5cc8ff;
      text-shadow: 0 0 15px rgba(92,200,255,0.6);
    }
    .token-badge {
      padding: 6px 10px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    }
    .token-badge.found { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.22); }
    .token-badge.missing { background: rgba(239,68,68,0.08); color: #ef4444; border: 1px solid rgba(239,68,68,0.12); }
    .controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      padding: 10px 20px;
      border: 1px solid currentColor;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    .btn-primary {
      background: linear-gradient(90deg, rgba(92,200,255,0.3) 0%, rgba(0,229,255,0.3) 100%);
      color: #5cc8ff;
      box-shadow: 0 0 20px rgba(92,200,255,0.3), inset 0 0 12px rgba(92,200,255,0.2);
    }
    .btn-primary:hover { 
      background: linear-gradient(90deg, rgba(92,200,255,0.4) 0%, rgba(0,229,255,0.4) 100%);
      box-shadow: 0 0 28px rgba(92,200,255,0.5), inset 0 0 14px rgba(92,200,255,0.3);
    }
    .btn-secondary {
      background: linear-gradient(90deg, rgba(59,130,246,0.3) 0%, rgba(37,99,235,0.3) 100%);
      color: #3b82f6;
      box-shadow: 0 0 20px rgba(59,130,246,0.3), inset 0 0 12px rgba(59,130,246,0.2);
    }
    .btn-secondary:hover { 
      background: linear-gradient(90deg, rgba(59,130,246,0.4) 0%, rgba(37,99,235,0.4) 100%);
    }
    .btn-danger {
      background: linear-gradient(90deg, rgba(239,68,68,0.3) 0%, rgba(220,38,38,0.3) 100%);
      color: #ef4444;
      box-shadow: 0 0 20px rgba(239,68,68,0.3), inset 0 0 12px rgba(239,68,68,0.2);
    }
    .btn-danger:hover { 
      background: linear-gradient(90deg, rgba(239,68,68,0.4) 0%, rgba(220,38,38,0.4) 100%);
    }
    .btn-warning {
      background: linear-gradient(90deg, rgba(245,158,11,0.3) 0%, rgba(217,119,6,0.3) 100%);
      color: #f59e0b;
      box-shadow: 0 0 20px rgba(245,158,11,0.3), inset 0 0 12px rgba(245,158,11,0.2);
    }
    .btn-warning:hover { 
      background: linear-gradient(90deg, rgba(245,158,11,0.4) 0%, rgba(217,119,6,0.4) 100%);
    }
    .status {
      padding: 25px 30px;
      background: rgba(15,22,30,0.6);
      border-bottom: 1px solid rgba(92,200,255,0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      color: #e0e0e0;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .dot.connected { 
      background: #10b981;
      box-shadow: 0 0 10px rgba(16,185,129,0.6);
    }
    .dot.disconnected { 
      background: #ef4444; 
      animation: none;
      box-shadow: 0 0 10px rgba(239,68,68,0.6);
    }
    .dot.connecting { 
      background: #f59e0b;
      box-shadow: 0 0 10px rgba(245,158,11,0.6);
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .filters {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .filters.hidden {
      display: none;
    }
    .filters label {
      color: #94a3b8;
      font-size: 14px;
    }
    .filter-btn {
      padding: 6px 12px;
      border: 1px solid rgba(92,200,255,0.3);
      background: rgba(15,22,30,0.6);
      color: #94a3b8;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn.active {
      background: rgba(92,200,255,0.3);
      color: #5cc8ff;
      border-color: #5cc8ff;
      box-shadow: 0 0 15px rgba(92,200,255,0.4);
    }
    .log-container {
      height: 600px;
      overflow-y: auto;
      padding: 20px 30px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    .log-container::-webkit-scrollbar {
      width: 12px;
    }
    .log-container::-webkit-scrollbar-track {
      background: #1e293b;
    }
    .log-container::-webkit-scrollbar-thumb {
      background: #475569;
      border-radius: 6px;
    }
    .log-container::-webkit-scrollbar-thumb:hover {
      background: #64748b;
    }
    .log-entry {
      padding: 8px 12px;
      margin-bottom: 4px;
      border-radius: 4px;
      border-left: 3px solid transparent;
      transition: background 0.2s;
    }
    .log-entry:hover {
      background: #1e293b;
    }
    .log-entry.info { border-left-color: #3b82f6; }
    .log-entry.success { border-left-color: #10b981; }
    .log-entry.warning { border-left-color: #f59e0b; }
    .log-entry.error { border-left-color: #ef4444; }
    .log-timestamp {
      color: #94a3b8;
      margin-right: 10px;
    }
    .log-level {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-weight: 700;
      font-size: 11px;
      margin-right: 10px;
      text-transform: uppercase;
    }
    .log-level.info { background: #3b82f6; color: white; }
    .log-level.success { background: #10b981; color: white; }
    .log-level.warning { background: #f59e0b; color: white; }
    .log-level.error { background: #ef4444; color: white; }
    .log-message {
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .stats {
      padding: 20px 30px;
      background: rgba(15,22,30,0.6);
      border-top: 1px solid rgba(92,200,255,0.2);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .stat-card {
      background: rgba(92,200,255,0.1);
      border: 1px solid rgba(92,200,255,0.3);
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 0 10px rgba(92,200,255,0.1);
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #5cc8ff;
      text-shadow: 0 0 10px rgba(92,200,255,0.6);
    }
    .stat-label {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 5px;
      font-weight: 600;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #94a3b8;
    }
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 20px;
      opacity: 0.5;
    }
    @media (max-width: 768px) {
      .header h1 { font-size: 20px; }
      .log-container { height: 400px; font-size: 12px; }
      .stats { grid-template-columns: 1fr 1fr; }
    }
    
    /* Timeline styles */
    .timeline-container {
      height: 600px;
      overflow-y: auto;
      padding: 30px;
      background: #0f172a;
      display: none; /* Oculto por defecto */
    }
    .timeline-container.active {
      display: block;
    }
    .timeline-session {
      background: rgba(15,22,30,0.8);
      border: 1px solid rgba(92,200,255,0.3);
      border-radius: 12px;
      margin-bottom: 25px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .timeline-session-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(92,200,255,0.2);
    }
    .timeline-session-id {
      font-weight: 700;
      color: #5cc8ff;
      font-size: 14px;
      font-family: 'Consolas', monospace;
    }
    .timeline-session-time {
      color: #94a3b8;
      font-size: 12px;
    }
    .timeline-event {
      display: flex;
      gap: 15px;
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 6px;
      background: rgba(92,200,255,0.05);
      border-left: 3px solid rgba(92,200,255,0.5);
      transition: all 0.2s;
    }
    .timeline-event:hover {
      background: rgba(92,200,255,0.1);
      border-left-color: #5cc8ff;
    }
    .timeline-event-time {
      color: #94a3b8;
      font-size: 12px;
      font-weight: 600;
      min-width: 80px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-copy-event {
      background: rgba(92,200,255,0.15);
      border: 1px solid rgba(92,200,255,0.3);
      color: #5cc8ff;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
      opacity: 0.6;
    }
    .btn-copy-event:hover {
      opacity: 1;
      background: rgba(92,200,255,0.25);
      transform: scale(1.1);
    }
    .btn-copy-event:active {
      transform: scale(0.95);
    }
      font-family: 'Consolas', monospace;
    }
    .timeline-event-icon {
      font-size: 18px;
      min-width: 25px;
      text-align: center;
    }
    .timeline-event-content {
      flex: 1;
    }
    .timeline-event-title {
      color: #e2e8f0;
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 3px;
    }
    .timeline-event-detail {
      color: #94a3b8;
      font-size: 12px;
    }
    .timeline-event-value {
      color: #5cc8ff;
      font-weight: 600;
      font-family: 'Consolas', monospace;
    }
    .timeline-event-stage {
      display: inline-block;
      background: rgba(92,200,255,0.2);
      color: #5cc8ff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      margin-left: 8px;
    }
    .timeline-empty {
      text-align: center;
      padding: 80px 20px;
      color: #94a3b8;
    }
    .timeline-empty svg {
      width: 64px;
      height: 64px;
      margin-bottom: 20px;
      opacity: 0.5;
    }
    .timeline-file-execution {
      background: rgba(59,130,246,0.1);
      border-left: 3px solid #3b82f6;
      padding: 8px 12px;
      margin: 8px 0;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
      font-size: 12px;
    }
    .timeline-file-name {
      color: #3b82f6;
      font-weight: 700;
      margin-right: 8px;
    }
    .timeline-file-line {
      color: #94a3b8;
      font-size: 11px;
    }
    .timeline-file-line-number {
      color: #f59e0b;
      font-weight: 600;
    }
    .timeline-code-context {
      background: rgba(15,22,30,0.6);
      border: 1px solid rgba(92,200,255,0.2);
      padding: 8px;
      margin-top: 5px;
      border-radius: 4px;
      font-size: 11px;
      color: #e2e8f0;
      white-space: pre-wrap;
      max-height: 80px;
      overflow-y: auto;
    }
    .timeline-user-view {
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.3);
      border-left: 4px solid #f59e0b;
      padding: 10px 12px;
      margin-top: 8px;
      border-radius: 6px;
      font-size: 12px;
      color: #e2e8f0;
    }
    .timeline-user-view strong {
      color: #f59e0b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Logs en vivo — STI Chat</h1>
        <p style="margin-top: 5px; font-size: 13px; opacity: 0.9;">👤 Sesión: <?= htmlspecialchars($current_user) ?></p>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <?php if (!empty($logToken)): ?>
          <div id="tokenIndicator" class="token-badge found" title="Se encontró token de logs en el servidor">🔒 Token encontrado</div>
        <?php else: ?>
          <div id="tokenIndicator" class="token-badge missing" title="No se encontró token de logs">⚠️ Token no encontrado</div>
        <?php endif; ?>
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-left:12px;">
        <input id="tokenInput" placeholder="Pegar token aquí" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); color:#e2e8f0; min-width:220px;" />
        <button class="btn-primary" id="btnSetToken" onclick="applyTokenOverride()">Guardar token</button>
        <button class="btn-secondary" onclick="clearTokenOverride()">Borrar</button>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-left:12px;">
        <input id="apiBaseInput" placeholder="API base (auto)" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); color:#e2e8f0; min-width:260px;" />
        <button class="btn-primary" onclick="applyApiBaseOverride()">Aplicar host</button>
        <button class="btn-secondary" onclick="clearApiBaseOverride()">Reset host</button>
      </div>
      <div class="controls">
        <button class="btn-primary" id="btnReconnect" onclick="reconectar()">
          🔄 Reconectar
        </button>
        <button class="btn-secondary" id="btnToggleView" onclick="toggleView()">
          📊 Vista Timeline
        </button>
        <button class="btn-warning" onclick="limpiarLogs()">
          🧹 Limpiar pantalla
        </button>
        <button class="btn-secondary" onclick="descargarLogs()">
          💾 Descargar log
        </button>
        <button class="btn-danger" onclick="cerrarSesion()">
          🚪 Cerrar sesión
        </button>
      </div>
    </div>
    <div style="padding:10px 20px; background:rgba(255,255,255,0.02); border-top:1px solid rgba(92,200,255,0.04); display:flex; gap:12px; align-items:center;">
      <div style="font-size:13px; color:#9fb6c8">API base:</div>
      <div id="diagnosticApiBase" style="font-family:monospace; color:#a7f3d0"></div>
      <div style="width:1px; height:24px; background:rgba(255,255,255,0.03);"></div>
      <div style="font-size:13px; color:#9fb6c8">Check URL:</div>
      <div id="diagnosticCheckUrl" style="font-family:monospace; color:#93c5fd; overflow:hidden; text-overflow:ellipsis; max-width:520px"></div>
      <div style="font-size:13px; color:#9fb6c8; margin-left:6px">Status:</div>
      <div id="diagnosticStatus" style="font-family:monospace; color:#fef08a">-</div>
      <div style="font-size:13px; color:#9fb6c8; margin-left:6px">SSE URL:</div>
      <div id="diagnosticSseUrl" style="font-family:monospace; color:#93c5fd; overflow:hidden; text-overflow:ellipsis; max-width:420px"></div>
      <div style="margin-left:auto; color:#94a3b8; font-size:12px;">Última respuesta: <span id="diagnosticBody">-</span></div>
    </div>

    <div class="status">
      <div class="status-indicator">
        <div class="dot disconnected" id="statusDot"></div>
        <span id="statusText">Conexión. Conexión perdida, reintentando...</span>
      </div>
      <div class="filters" id="logFilters">
        <label>
          <input type="checkbox" id="autoscroll" checked> Autoscroll
        </label>
        <span style="margin: 0 10px;">|</span>
        <button class="filter-btn active" data-level="all" onclick="filtrar('all')">Todos</button>
        <button class="filter-btn" data-level="info" onclick="filtrar('info')">Info</button>
        <button class="filter-btn" data-level="success" onclick="filtrar('success')">Success</button>
        <button class="filter-btn" data-level="warning" onclick="filtrar('warning')">Warning</button>
        <button class="filter-btn" data-level="error" onclick="filtrar('error')">Error</button>
      </div>
      <div class="filters hidden" id="timelineFilters">
        <label style="color: #94a3b8; font-size: 13px; margin-right: 8px;">Orden:</label>
        <button class="filter-btn" id="sortAsc" onclick="cambiarOrden('asc')">⬆️ Antiguo → Nuevo</button>
        <button class="filter-btn active" id="sortDesc" onclick="cambiarOrden('desc')">⬇️ Nuevo → Antiguo</button>
      </div>
    </div>

    <div class="log-container" id="logContainer">
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <p>// Conectando al servidor de logs...</p>
      </div>
    </div>

    <div class="timeline-container" id="timelineContainer">
      <div class="timeline-empty">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p>// Timeline del Usuario</p>
        <p style="font-size: 12px; margin-top: 10px;">Esperando eventos de sesión...</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value" id="totalLogs">0</div>
        <div class="stat-label">Total logs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="errorCount">0</div>
        <div class="stat-label">Errores</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="warningCount">0</div>
        <div class="stat-label">Warnings</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="connectionTime">0s</div>
        <div class="stat-label">Tiempo conectado</div>
      </div>
    </div>
  </div>

  <script>
    // ============================================
    // 🔒 BLOQUE PROTEGIDO #1 - VARIABLES GLOBALES Y CONFIGURACIÓN
    // ============================================
    // NO MODIFICAR: Variables críticas del sistema
    // Última modificación: 25/11/2025
    // ============================================
    let eventSource = null;
    let logs = [];
    let filtroActivo = 'all';
    let stats = { total: 0, errors: 0, warnings: 0 };
    let connectionStartTime = null;
    let connectionTimer = null;
    let currentView = 'logs'; // 'logs' o 'timeline'
    let sessions = {}; // Almacenar sesiones agrupadas por sessionId
    let sortOrder = 'desc'; // 'asc' o 'desc' - por defecto descendente (más nuevo primero)
    let isSSEInitialized = false; // Flag para ignorar logs históricos al conectar

    // URL del backend
    // Auto-detect API base: prefer the current origin (same host as this PHP UI).
    // If your Node server runs on a different host, replace this value with its full URL.
    const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '')
      : 'https://sti-rosario-ai.onrender.com';
    
    // Token proveniente del servidor (si existe)
    const SERVER_LOG_TOKEN = '<?php echo addslashes($logToken); ?>';
    // Token efectivo que usará la UI. Puede ser sobreescrito por el admin en localStorage.
    let LOG_TOKEN = (localStorage.getItem('admin_log_token') || SERVER_LOG_TOKEN || '');
    // ============================================
    // FIN BLOQUE PROTEGIDO #1
    // ============================================

    // Actualizar indicador visual del token (por si se necesita cambiar dinámicamente)
    function updateTokenIndicator() {
      try {
        const el = document.getElementById('tokenIndicator');
        if (!el) return;
        if (LOG_TOKEN && LOG_TOKEN.length > 4) {
          el.classList.remove('missing');
          el.classList.add('found');
          el.innerText = '🔒 Token encontrado';
          el.title = 'Token de logs detectado (usando token efectivo)';
        } else {
          el.classList.remove('found');
          el.classList.add('missing');
          el.innerText = '⚠️ Token no encontrado';
          el.title = 'No se detectó token de logs';
        }
      } catch (e) { /* noop */ }
    }
    updateTokenIndicator();

    // Token override UI handlers
    function applyTokenOverride() {
      try {
        const input = document.getElementById('tokenInput');
        if (!input) return;
        const v = (input.value || '').trim();
        if (v.length === 0) {
          localStorage.removeItem('admin_log_token');
          LOG_TOKEN = SERVER_LOG_TOKEN || '';
        } else {
          localStorage.setItem('admin_log_token', v);
          LOG_TOKEN = v;
        }
        updateTokenIndicator();
        // reconnect to apply new token
        if (eventSource) { try { eventSource.close(); } catch(_){} }
        conectar();
      } catch (e) { console.error('applyTokenOverride error', e); }
    }

    function clearTokenOverride() {
      try {
        localStorage.removeItem('admin_log_token');
        const input = document.getElementById('tokenInput');
        if (input) input.value = '';
        LOG_TOKEN = SERVER_LOG_TOKEN || '';
        updateTokenIndicator();
        if (eventSource) { try { eventSource.close(); } catch(_){} }
        conectar();
      } catch (e) { console.error('clearTokenOverride error', e); }
    }
    // API_BASE override handlers
    function applyApiBaseOverride() {
      try {
        const inp = document.getElementById('apiBaseInput');
        if (!inp) return;
        const v = (inp.value || '').trim();
        if (v.length === 0) {
          localStorage.removeItem('admin_api_base');
          window.API_BASE_OVERRIDE = null;
        } else {
          localStorage.setItem('admin_api_base', v);
          window.API_BASE_OVERRIDE = v.replace(/\/$/, '');
        }
        updateApiBaseDisplay();
        if (eventSource) { try { eventSource.close(); } catch(_){} }
        conectar();
      } catch (e) { console.error('applyApiBaseOverride', e); }
    }

    function clearApiBaseOverride() {
      try {
        localStorage.removeItem('admin_api_base');
        window.API_BASE_OVERRIDE = null;
        const inp = document.getElementById('apiBaseInput'); if (inp) inp.value = '';
        updateApiBaseDisplay();
        if (eventSource) { try { eventSource.close(); } catch(_){} }
        conectar();
      } catch (e) { console.error('clearApiBaseOverride', e); }
    }

    function getEffectiveApiBase() {
      return (window.API_BASE_OVERRIDE || API_BASE).replace(/\/$/, '');
    }

    function updateApiBaseDisplay() {
      try {
        const el = document.getElementById('diagnosticApiBase');
        if (!el) return;
        el.innerText = getEffectiveApiBase();
      } catch (e) { /* noop */ }
    }
    // Inicializar valor del input con el override actual (si existe)
    try {
      const tokenInput = document.getElementById('tokenInput');
      if (tokenInput) {
        const stored = localStorage.getItem('admin_log_token') || '';
        tokenInput.value = stored || '';
      }
    } catch (e) { /* noop */ }

    // ============================================
    // 🔒 BLOQUE PROTEGIDO #2 - CONEXIÓN SSE
    // ============================================
    // NO MODIFICAR: Lógica crítica de conexión a servidor de logs
    // Última modificación: 25/11/2025
    // ============================================
    async function conectar() {
      if (eventSource) {
        eventSource.close();
      }

      updateStatus('connecting', 'Conectando...');
      
      // USAR /api/logs/stream que soporta SSE
      const url = new URL('/api/logs/stream', API_BASE).toString() + '?token=' + encodeURIComponent(LOG_TOKEN);

      // Diagnostic check: request the logs once (mode=once) to capture HTTP status / CORS / token errors
      try {
          const base = getEffectiveApiBase();
          const checkUrl = new URL('/api/logs/stream', base).toString() + '?mode=once&token=' + encodeURIComponent(LOG_TOKEN);
          const sseUrl = new URL('/api/logs/stream', base).toString() + '?token=' + encodeURIComponent(LOG_TOKEN);
          // write to diagnostic UI
          try { document.getElementById('diagnosticCheckUrl').innerText = checkUrl; } catch (_) {}
          try { document.getElementById('diagnosticSseUrl').innerText = sseUrl; } catch (_) {}
          console.log('[Logs] Diagnostic fetch check ->', checkUrl);
          const resp = await fetch(checkUrl, { method: 'GET', credentials: 'include' });
          console.log('[Logs] Diagnostic response status:', resp.status);
          try { document.getElementById('diagnosticStatus').innerText = String(resp.status); } catch (_) {}
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '(no body)');
            console.error('[Logs] Diagnostic failed:', resp.status, txt);
            try { document.getElementById('diagnosticBody').innerText = txt; } catch (_) {}
            updateStatus('disconnected', `Error ${resp.status} al leer logs (ver consola)`);
            // Still try to open EventSource; it may give more info in onerror
          } else {
            console.log('[Logs] Diagnostic OK: logs endpoint reachable');
            try { document.getElementById('diagnosticBody').innerText = '(ok)'; } catch (_) {}
          }
      } catch (e) {
        console.error('[Logs] Diagnostic fetch error:', e && e.message);
          try { document.getElementById('diagnosticStatus').innerText = 'ERR'; } catch (_) {}
          try { document.getElementById('diagnosticBody').innerText = e && e.message; } catch (_) {}
          updateStatus('disconnected', 'Error de conexión (ver consola)');
        // proceed to EventSource for additional info
      }

        eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        updateStatus('connected', 'Conectado ✓');
        connectionStartTime = Date.now();
        startConnectionTimer();
        agregarLog('success', 'Conexión establecida con el servidor de logs');
        
        // Esperar 2 segundos antes de empezar a procesar eventos para Timeline
        // Esto ignora logs históricos que llegan al conectar
        setTimeout(() => {
          isSSEInitialized = true;
          console.log('[Timeline] Inicialización completada. Procesando nuevos eventos...');
        }, 2000);
      };

      eventSource.onmessage = (event) => {
        try {
          // Los logs vienen como texto plano desde el servidor
          const message = event.data;
          if (message && message.trim() && !message.startsWith(':')) {
            agregarLog('info', message);
          }
        } catch (e) {
          console.error('Error parsing log:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        updateStatus('disconnected', 'Conexión perdida. Reconectando en 5 segundos...');
        stopConnectionTimer();
        agregarLog('error', 'Conexión perdida con el servidor');
        eventSource.close();
        
        // Auto-reconectar después de 5 segundos
        setTimeout(() => {
          agregarLog('warning', 'Intentando reconectar...');
          conectar();
        }, 5000);
      };
    }
    
    function reconectar() {
      agregarLog('info', 'Reconexión manual solicitada...');
      if (eventSource) {
        eventSource.close();
      }
      conectar();
    }
    // ============================================
    // FIN BLOQUE PROTEGIDO #2
    // ============================================

    function procesarLog(data) {
      const level = data.level || 'info';
      const message = data.message || JSON.stringify(data);
      agregarLog(level, message);
    }

    function agregarLog(level, message) {
      const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
      const log = { timestamp, level, message, id: Date.now() + Math.random() };
      logs.push(log);

      // Actualizar stats
      stats.total++;
      if (level === 'error') stats.errors++;
      if (level === 'warning') stats.warnings++;
      updateStats();

      // Procesar para timeline (solo si SSE está inicializado para evitar logs históricos)
      if (isSSEInitialized) {
        const parsed = procesarParaTimeline(message, timestamp);
        if (parsed) {
          console.log('[Timeline] Evento detectado:', parsed);
        }
      }

      // Renderizar si pasa el filtro
      if (filtroActivo === 'all' || filtroActivo === level) {
        renderLog(log);
      }

      // Auto-scroll
      if (document.getElementById('autoscroll').checked) {
        const container = document.getElementById('logContainer');
        container.scrollTop = container.scrollHeight;
      }
    }

    function renderLog(log) {
      const container = document.getElementById('logContainer');
      
      // Remover empty state si existe
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const entry = document.createElement('div');
      entry.className = `log-entry ${log.level}`;
      entry.innerHTML = `
        <span class="log-timestamp">${log.timestamp}</span>
        <span class="log-level ${log.level}">${log.level}</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
      `;
      container.appendChild(entry);

      // Limitar a 1000 logs en pantalla
      const entries = container.querySelectorAll('.log-entry');
      if (entries.length > 1000) {
        entries[0].remove();
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function limpiarLogs() {
      if (currentView === 'logs') {
        // Limpiar vista de logs
        const container = document.getElementById('logContainer');
        container.innerHTML = '<div class="empty-state"><p>// Logs limpiados. Esperando nuevos eventos...</p></div>';
        logs = [];
        stats = { total: 0, errors: 0, warnings: 0 };
        updateStats();
        console.log('[Logs] Vista de logs limpiada');
      } else {
        // Limpiar vista de timeline
        sessions = {};
        const timelineContainer = document.getElementById('timelineContainer');
        timelineContainer.innerHTML = `
          <div class="timeline-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>// Timeline limpiado</p>
            <p style="font-size: 12px; margin-top: 10px;">Esperando nuevos eventos de sesión...</p>
          </div>
        `;
        console.log('[Timeline] Vista de timeline limpiada');
      }
    }

    function descargarLogs() {
      const content = logs.map(log => 
        `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
      ).join('\n');
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sti-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      agregarLog('success', `✅ Logs descargados: ${logs.length} entradas`);
    }

    function filtrar(level) {
      filtroActivo = level;
      
      // Actualizar botones
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.level === level) {
          btn.classList.add('active');
        }
      });

      // Re-renderizar logs
      const container = document.getElementById('logContainer');
      container.innerHTML = '';
      
      const logsToShow = level === 'all' 
        ? logs 
        : logs.filter(log => log.level === level);
      
      if (logsToShow.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>// No hay logs para este filtro</p></div>';
      } else {
        logsToShow.forEach(renderLog);
      }
    }

    function updateStatus(status, text) {
      const dot = document.getElementById('statusDot');
      const statusText = document.getElementById('statusText');
      
      dot.className = `dot ${status}`;
      statusText.textContent = text;
    }

    function updateStats() {
      document.getElementById('totalLogs').textContent = stats.total;
      document.getElementById('errorCount').textContent = stats.errors;
      document.getElementById('warningCount').textContent = stats.warnings;
    }

    function startConnectionTimer() {
      connectionTimer = setInterval(() => {
        if (connectionStartTime) {
          const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000);
          document.getElementById('connectionTime').textContent = `${elapsed}s`;
        }
      }, 1000);
    }

    function stopConnectionTimer() {
      if (connectionTimer) {
        clearInterval(connectionTimer);
        connectionTimer = null;
      }
    }

    // ============================================
    // FUNCIONES DE TIMELINE
    // ============================================
    
    function toggleView() {
      const btnToggle = document.getElementById('btnToggleView');
      const logContainer = document.getElementById('logContainer');
      const timelineContainer = document.getElementById('timelineContainer');
      const logFilters = document.getElementById('logFilters');
      const timelineFilters = document.getElementById('timelineFilters');
      
      console.log('[Timeline] Toggle view. Sesiones actuales:', Object.keys(sessions).length, sessions);
      
      if (currentView === 'logs') {
        // Cambiar a timeline
        currentView = 'timeline';
        logContainer.style.display = 'none';
        timelineContainer.classList.add('active');
        logFilters.classList.add('hidden');
        timelineFilters.classList.remove('hidden');
        btnToggle.innerHTML = '📋 Vista Logs';
        btnToggle.className = 'btn-primary'; // Cambiar estilo del botón
        renderTimeline();
        console.log('[Timeline] Vista cambiada a Timeline');
      } else {
        // Cambiar a logs
        currentView = 'logs';
        logContainer.style.display = 'block';
        timelineContainer.classList.remove('active');
        logFilters.classList.remove('hidden');
        timelineFilters.classList.add('hidden');
        btnToggle.innerHTML = '📊 Vista Timeline';
        btnToggle.className = 'btn-secondary'; // Restaurar estilo
        console.log('[Timeline] Vista cambiada a Logs');
      }
    }
    
    // ============================================
    // 🔒 BLOQUE PROTEGIDO #3 - DETECCIÓN DE EVENTOS TIMELINE
    // ============================================
    // NO MODIFICAR: Parseo crítico de logs para timeline
    // Última modificación: 25/11/2025
    // ============================================
    function procesarParaTimeline(message, timestamp) {
      // Detectar eventos clave en los logs
      let sessionId = null;
      let eventType = null;
      let eventData = {};
      
      // Extraer información de archivo y línea
      // Formato típico: "2025-11-26T02:09:24.247Z [INFO] [/api/chat] INICIO - sessionId from body: web-xxx"
      const fileMatch = message.match(/\[([^\]]+)\]/g);
      let fileInfo = null;
      let lineInfo = null;
      
      if (fileMatch && fileMatch.length >= 2) {
        // Segundo bracket suele ser el nivel [INFO], tercero puede ser endpoint o archivo
        const potentialFile = fileMatch[2]?.replace(/[\[\]]/g, '');
        if (potentialFile && (potentialFile.includes('/') || potentialFile.includes('.'))) {
          fileInfo = potentialFile;
        }
      }
      
      // Detectar archivo específico en mensajes como "[DEBUG /api/chat]" o menciones directas
      if (!fileInfo) {
        const directFileMatch = message.match(/server\.js|index\.php|chatEndpointV2\.js|normalizarTexto\.js|deviceDetection\.js/);
        if (directFileMatch) {
          fileInfo = directFileMatch[0];
        }
      }
      
      // Extraer número de línea si está presente
      const lineMatch = message.match(/line[:\s]+(\d+)|:(\d+):|línea[:\s]+(\d+)/i);
      if (lineMatch) {
        lineInfo = lineMatch[1] || lineMatch[2] || lineMatch[3];
      }
      
      // Extraer sessionId de diferentes formatos
      // Formato 1: "sessionId: web-xxx" o "SessionId: web-xxx"
      let sessionMatch = message.match(/sessionId[:\s]+(web-[a-z0-9]+)/i);
      
      // Formato 2: "Saved to Redis web-xxx:"
      if (!sessionMatch && message.includes('Saved to Redis')) {
        sessionMatch = message.match(/Saved to Redis\s+(web-[a-z0-9]+):/i);
      }
      
      // Formato 3: "from body: web-xxx" o "from req: web-xxx"
      if (!sessionMatch && (message.includes('from body:') || message.includes('from req:'))) {
        sessionMatch = message.match(/from (?:body|req):\s+(web-[a-z0-9]+)/i);
      }
      
      // Formato 4: cualquier "web-xxxxx" en el mensaje (último recurso)
      if (!sessionMatch) {
        sessionMatch = message.match(/web-[a-z0-9]+/i);
      }
      
      if (sessionMatch) {
        sessionId = sessionMatch[1] || sessionMatch[0];
      }
      
      // Si no se encontró sessionId pero el log es de saveSession, intentar extraerlo del contexto
      if (!sessionId && message.includes('Saved to Redis')) {
        // Puede aparecer "undefined" en logs iniciales, usar un ID temporal
        const tempMatch = message.match(/Saved to Redis\s+(\S+):/);
        if (tempMatch && tempMatch[1] !== 'undefined') {
          sessionId = tempMatch[1];
        }
      }
      
      // Si aún no hay sessionId válido, saltar este log
      if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
        return;
      }
      
      // Detectar eventos según patrones en los logs reales
      
      // 1. NOMBRE DE USUARIO - Detectar desde [ASK_NAME] DEBUG - buttonToken: null text: Tomas
      if (message.includes('[ASK_NAME] DEBUG') && message.includes('text:')) {
        const textMatch = message.match(/text:\s*([^\s\r\n]+)/);
        if (textMatch && textMatch[1] && textMatch[1] !== 'null') {
          eventType = 'NAME_PROVIDED';
          eventData.userName = textMatch[1];
          eventData.nextStage = 'ASK_NEED';
          eventData.skipped = false;
          
          if (!fileInfo) fileInfo = 'server.js';
          if (!lineInfo) lineInfo = '~3700-3800';
        }
      }
      
      // 2. TEXTO DEL USUARIO - Detectar desde "text: tengo un problema"
      if (message.includes('text:') && !message.includes('buttonToken:') && !eventType) {
        const textMatch = message.match(/text:\s*([^\r\n]+)/);
        if (textMatch && textMatch[1]) {
          const userText = textMatch[1].trim();
          if (userText && userText !== 'null' && userText.length > 2) {
            eventType = 'USER_TEXT_INPUT';
            eventData.text = userText;
            
            if (!fileInfo) fileInfo = 'server.js';
          }
        }
      }
      
      // 3. saveSession con stage - indica transiciones de estado
      if (message.includes('saveSession') && message.includes('Saved to Redis')) {
        const stageMatch = message.match(/"stage"\s*:\s*"([A-Z_]+)"/);
        const userNameMatch = message.match(/"userName"\s*:\s*"([^"]+)"/);
        const gdprConsentMatch = message.match(/"gdprConsent"\s*:\s*(true|false)/);
        const transcriptLengthMatch = message.match(/"transcriptLength"\s*:\s*(\d+)/);
        
        if (stageMatch) {
          const stage = stageMatch[1];
          const hasGdprConsent = gdprConsentMatch && gdprConsentMatch[1] === 'true';
          const transcriptLength = transcriptLengthMatch ? parseInt(transcriptLengthMatch[1]) : 0;
          
          // Detectar sesión inicial: ASK_LANGUAGE + sin gdprConsent + (transcriptLength 0 o 1) + sin eventos previos
          if (stage === 'ASK_LANGUAGE' && !hasGdprConsent && transcriptLength <= 1) {
            // Solo crear evento si no existe ya para esta sesión
            if (!sessions[sessionId] || sessions[sessionId].events.length === 0) {
              eventType = 'SESSION_CREATED';
              eventData.stage = 'ASK_LANGUAGE';
              eventData.status = 'awaiting_gdpr_consent';
              eventData.transcriptLength = transcriptLength;
            }
          } else if (stage === 'ASK_LANGUAGE' && hasGdprConsent) {
            // GDPR ya aceptado, ahora está pidiendo idioma
            // Solo registrar si ya tenemos un evento GDPR_ACCEPTED previo
            const hasGdprEvent = sessions[sessionId] && 
                                 sessions[sessionId].events.some(e => e.type === 'GDPR_ACCEPTED');
            
            if (hasGdprEvent && !sessions[sessionId].events.some(e => 
                e.type === 'LANGUAGE_SELECTION_SHOWN' || 
                (e.type === 'SESSION_CREATED' && e.data.status === 'awaiting_language'))) {
              eventType = 'LANGUAGE_SELECTION_SHOWN';
              eventData.stage = 'ASK_LANGUAGE';
              eventData.status = 'awaiting_language';
            }
          } else if (stage === 'ASK_NAME') {
            eventType = 'LANGUAGE_SELECTED';
            eventData.language = 'español';
            eventData.nextStage = stage;
          } else if (stage === 'ASK_NEED' && userNameMatch) {
            // Solo crear evento si ya no detectamos el nombre antes
            if (!sessions[sessionId] || !sessions[sessionId].events.some(e => e.type === 'NAME_PROVIDED')) {
              eventType = 'NAME_PROVIDED';
              eventData.userName = userNameMatch[1];
              eventData.nextStage = stage;
              eventData.skipped = userNameMatch[1] === 'Usuari@';
            }
          } else if (stage === 'ASK_PROBLEM') {
            eventType = 'NEED_TYPE_SELECTED';
            eventData.needType = 'Problema';
            eventData.nextStage = stage;
          }
        }
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~3800-3900';
      }
      
      // 4. Detección de stage actual
      if (message.includes('Session loaded - stage:')) {
        const stageMatch = message.match(/stage:\s*([A-Z_]+)/);
        const userNameFromLog = message.match(/userName:\s*([^\s]+)/);
        
        if (stageMatch) {
          eventType = 'STAGE_LOADED';
          eventData.stage = stageMatch[1];
          if (userNameFromLog && userNameFromLog[1] !== 'null') {
            eventData.userName = userNameFromLog[1];
          }
        }
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~2100-2200';
      }
      
      // 5. Botón de tipo de necesidad: BTN_PROBLEMA
      if (message.includes('DEBUG BUTTON') && message.includes('BTN_PROBLEMA')) {
        eventType = 'NEED_TYPE_SELECTED';
        eventData.needType = 'Problema';
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~2800-3000';
      }
      
      // 6. SessionId y buttonToken desde [DEBUG /api/chat]
      if (message.includes('[DEBUG /api/chat] SessionId:') && message.includes('buttonToken:')) {
        const btnTokenMatch = message.match(/buttonToken:\s*(\w+)/);
        const textMatch = message.match(/text:\s*([^\r\n]+)/);
        
        if (btnTokenMatch) {
          const token = btnTokenMatch[1];
          
          if (token === 'BTN_PROBLEMA') {
            eventType = 'NEED_TYPE_SELECTED';
            eventData.needType = 'Problema';
          }
        }
        
        if (textMatch && textMatch[1] && textMatch[1].trim() !== 'null') {
          eventData.userInput = textMatch[1].trim();
        }
        
        if (!fileInfo) fileInfo = 'server.js';
      }
      
      // 7. GDPR ACEPTADO - Detectar cuando usuario clickea "Sí"
      // Formato 1: Log explícito del servidor "[GDPR] ✅ Consentimiento otorgado:"
      if (message.includes('[GDPR]') && message.includes('✅') && message.includes('Consentimiento otorgado:')) {
        eventType = 'GDPR_ACCEPTED';
        eventData.value = 'si';
        const dateMatch = message.match(/otorgado:\s*([^\r\n]+)/);
        if (dateMatch) eventData.consentDate = dateMatch[1];
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~3645-3650';
      }
      
      // Formato 2: Detectar por buttonToken o texto con "si"/"acepto" en ASK_LANGUAGE DEBUG
      if (!eventType && message.includes('[ASK_LANGUAGE]') && message.includes('DEBUG') &&
          (message.includes('Processing: si') || message.includes('Processing: sí') || 
           message.includes('Processing: acepto') || message.includes('buttonToken: si'))) {
        console.log('[Timeline DEBUG] Detector GDPR 2 - sessionId:', sessionId, 'mensaje:', message.substring(0, 100));
        // Verificar que no sea un evento ya registrado
        if (!sessions[sessionId] || !sessions[sessionId].events.some(e => e.type === 'GDPR_ACCEPTED')) {
          console.log('[Timeline DEBUG] Creando GDPR_ACCEPTED');
          eventType = 'GDPR_ACCEPTED';
          eventData.value = 'si';
          eventData.buttonToken = 'si';
          
          if (!fileInfo) fileInfo = 'server.js';
          if (!lineInfo) lineInfo = '~3640-3650';
        } else {
          console.log('[Timeline DEBUG] GDPR_ACCEPTED ya existe, saltando');
        }
      }
      
      // 8. Procesamiento de botones de idioma
      if (message.includes('[ASK_LANGUAGE] DEBUG - Processing:')) {
        const langMatch = message.match(/Processing:\s*(\w+)/);
        const consentMatch = message.match(/GDPR consent:\s*(\w+)/);
        
        // Solo detectar selección de idioma si hay consentimiento previo
        if (consentMatch && consentMatch[1] === 'true' && langMatch) {
          eventType = 'LANGUAGE_SELECTED';
          eventData.language = langMatch[1];
        }
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~3640-3700';
      }
      
      // 9. Botón prefiero_no_decirlo
      if (message.includes('buttonToken: prefiero_no_decirlo')) {
        eventType = 'NAME_PROVIDED';
        eventData.userName = 'Usuari@';
        eventData.skipped = true;
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~3700-3800';
      }
      
      // 10. Checking ASK_LANGUAGE
      if (message.includes('Checking ASK_LANGUAGE')) {
        const matchInfo = message.match(/Match:\s*(\w+)/);
        if (matchInfo) {
          eventData.stage = 'ASK_LANGUAGE';
          eventData.match = matchInfo[1];
        }
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '3400';
      }
      
      // 11. Session creada al inicio (INICIO - sessionId from body)
      // DESHABILITADO: Este detector duplica SESSION_CREATED y causa conflicto con saveSession
      // El detector principal está en línea ~985 (saveSession con transcriptLength: 0)
      /*
      if (message.includes('INICIO') && message.includes('sessionId from body')) {
        eventType = 'SESSION_CREATED';
        if (sessionId) eventData.sessionId = sessionId;
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~2000-2100';
      }
      */
      
      // 12. Detección de dispositivo con detectAmbiguousDevice
      if (message.includes('[detectAmbiguousDevice] Resultado:')) {
        eventType = 'DEVICE_DETECTED';
        
        // Extraer el bestMatch del JSON
        const bestMatchMatch = message.match(/"bestMatch"\s*:\s*\{[^}]*"id"\s*:\s*"([^"]+)"[^}]*"label"\s*:\s*"([^"]+)"/);
        if (bestMatchMatch) {
          eventData.deviceId = bestMatchMatch[1];
          eventData.deviceLabel = bestMatchMatch[2];
        }
        
        // Extraer el term detectado
        const termMatch = message.match(/"term"\s*:\s*"([^"]+)"/);
        if (termMatch) {
          eventData.term = termMatch[1];
        }
        
        // Extraer confidence
        const confidenceMatch = message.match(/"confidence"\s*:\s*([0-9.]+)/);
        if (confidenceMatch) {
          eventData.confidence = parseFloat(confidenceMatch[1]);
        }
        
        if (!fileInfo) fileInfo = 'deviceDetection.js';
        if (!lineInfo) lineInfo = '~200-300';
      }
      
      // 13. Stage CONFIRM_DEVICE
      if (message.includes('stage: CONFIRM_DEVICE') || 
          (message.includes('saveSession') && message.includes('"stage":"CONFIRM_DEVICE"'))) {
        if (!sessions[sessionId] || !sessions[sessionId].events.some(e => e.type === 'DEVICE_DETECTED')) {
          eventType = 'AWAITING_CONFIRMATION';
          eventData.stage = 'CONFIRM_DEVICE';
          
          const deviceMatch = message.match(/"device"\s*:\s*"([^"]+)"/);
          if (deviceMatch && deviceMatch[1] !== 'null') {
            eventData.device = deviceMatch[1];
          }
          
          if (!fileInfo) fileInfo = 'server.js';
          if (!lineInfo) lineInfo = '~4200-4300';
        }
      }
      
      // 14. Confirmación de dispositivo (Sí button)
      if (message.includes('buttonToken: Sí') || 
          (message.includes('DEBUG BUTTON') && message.includes('value: Sí'))) {
        eventType = 'DEVICE_CONFIRMED';
        eventData.confirmation = 'Sí';
        
        if (!fileInfo) fileInfo = 'server.js';
        if (!lineInfo) lineInfo = '~4300-4400';
      }
      
      // 15. Stage ASK_STEPS
      if (message.includes('stage: ASK_STEPS') || 
          (message.includes('saveSession') && message.includes('"stage":"ASK_STEPS"'))) {
        if (!sessions[sessionId] || !sessions[sessionId].events.some(e => e.type === 'ASK_STEPS')) {
          eventType = 'ASK_STEPS';
          eventData.stage = 'ASK_STEPS';
          
          const deviceMatch = message.match(/"device"\s*:\s*"([^"]+)"/);
          if (deviceMatch && deviceMatch[1] !== 'null') {
            eventData.device = deviceMatch[1];
          }
          
          if (!fileInfo) fileInfo = 'server.js';
          if (!lineInfo) lineInfo = '~4400-4500';
        }
      }
      
      // 16. Problema detectado en ASK_PROBLEM
      if (message.includes('[ASK_PROBLEM]') && message.includes('session.problem:')) {
        const problemMatch = message.match(/session\.problem:\s*([^\r\n]+)/);
        if (problemMatch && !sessions[sessionId]?.events.some(e => e.type === 'PROBLEM_DESCRIBED')) {
          eventType = 'PROBLEM_DESCRIBED';
          eventData.problem = problemMatch[1].trim();
          
          const deviceMatch = message.match(/session\.device:\s*(\w+)/);
          if (deviceMatch && deviceMatch[1] !== 'null') {
            eventData.currentDevice = deviceMatch[1];
          }
          
          if (!fileInfo) fileInfo = 'server.js';
          if (!lineInfo) lineInfo = '~4000-4100';
        }
      }
      
      // Agregar información de archivo y línea al eventData
      if (fileInfo) eventData.file = fileInfo;
      if (lineInfo) eventData.line = lineInfo;
      
      // Extraer contexto del código (primeras palabras después del log level)
      const contextMatch = message.match(/\[INFO\]\s+\[?[^\]]*\]?\s+(.{0,80})/);
      if (contextMatch && contextMatch[1]) {
        eventData.context = contextMatch[1].trim();
      }
      
      // Si detectamos un evento válido, agregarlo a la sesión
      if (sessionId && eventType) {
        if (!sessions[sessionId]) {
          sessions[sessionId] = {
            id: sessionId,
            events: [],
            startTime: timestamp
          };
          console.log('[Timeline] Nueva sesión creada:', sessionId);
        }
        
        // Evitar duplicados
        const isDuplicate = sessions[sessionId].events.some(e => 
          e.type === eventType && 
          Math.abs(new Date(`1970-01-01 ${e.timestamp}`) - new Date(`1970-01-01 ${timestamp}`)) < 1000
        );
        
        if (!isDuplicate) {
          sessions[sessionId].events.push({
            timestamp,
            type: eventType,
            data: eventData
          });
          
          console.log('[Timeline] Evento agregado:', { sessionId, eventType, eventData, totalEvents: sessions[sessionId].events.length });
          
          // Re-renderizar timeline si está visible
          if (currentView === 'timeline') {
            renderTimeline();
          }
          
          return { sessionId, eventType, eventData };
        }
      }
      
      return null;
    }
    // ============================================
    // FIN BLOQUE PROTEGIDO #3
    // ============================================
    
    function renderTimeline() {
      const container = document.getElementById('timelineContainer');
      
      // Si no hay sesiones
      if (Object.keys(sessions).length === 0) {
        container.innerHTML = `
          <div class="timeline-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>// Timeline del Usuario</p>
            <p style="font-size: 12px; margin-top: 10px;">Esperando eventos de sesión...</p>
          </div>
        `;
        return;
      }
      
      // Renderizar todas las sesiones (ordenadas según sortOrder)
      const sortedSessions = Object.values(sessions).sort((a, b) => {
        const timeA = a.events[0]?.timestamp || a.startTime;
        const timeB = b.events[0]?.timestamp || b.startTime;
        
        if (sortOrder === 'asc') {
          return timeA.localeCompare(timeB); // Antiguo → Nuevo
        } else {
          return timeB.localeCompare(timeA); // Nuevo → Antiguo
        }
      });
      
      let html = '';
      sortedSessions.forEach(session => {
        html += renderSession(session);
      });
      
      container.innerHTML = html;
      
      // Auto-scroll según orden
      if (sortOrder === 'desc') {
        container.scrollTop = 0; // Scroll arriba para ver lo más nuevo
      } else {
        container.scrollTop = container.scrollHeight; // Scroll abajo para ver lo más nuevo
      }
    }
    
    function renderSession(session) {
      // Ordenar eventos de la sesión según sortOrder
      const sortedEvents = [...session.events].sort((a, b) => {
        if (sortOrder === 'asc') {
          return a.timestamp.localeCompare(b.timestamp); // Antiguo → Nuevo
        } else {
          return b.timestamp.localeCompare(a.timestamp); // Nuevo → Antiguo
        }
      });
      
      let html = `
        <div class="timeline-session">
          <div class="timeline-session-header">
            <div class="timeline-session-id">🔑 ${session.id}</div>
            <div class="timeline-session-time">Inicio: ${session.startTime}</div>
          </div>
      `;
      
      sortedEvents.forEach(event => {
        html += renderEvent(event);
      });
      
      html += '</div>';
      return html;
    }
    
    function renderEvent(event) {
      const icons = {
        'SESSION_CREATED': '🆕',
        'GDPR_ACCEPTED': '✅',
        'LANGUAGE_SELECTION_SHOWN': '🌍',
        'LANGUAGE_SELECTED': '🌍',
        'NAME_PROVIDED': '👤',
        'NEED_TYPE_SELECTED': '🔧',
        'PROBLEM_SENT': '💬',
        'PROBLEM_DESCRIBED': '💬',
        'DEVICE_DETECTION': '🔍',
        'DEVICE_DETECTED': '🖥️',
        'DEVICE_DISAMBIGUATION': '🖥️',
        'AWAITING_CONFIRMATION': '❓',
        'DEVICE_CONFIRMED': '✔️',
        'ASK_STEPS': '📝',
        'STAGE_LOADED': '📂',
        'USER_TEXT_INPUT': '✏️'
      };
      
      const titles = {
        'SESSION_CREATED': 'Sesión creada',
        'GDPR_ACCEPTED': 'GDPR aceptado',
        'LANGUAGE_SELECTION_SHOWN': 'Selección de idioma mostrada',
        'LANGUAGE_SELECTED': 'Idioma seleccionado',
        'NAME_PROVIDED': 'Nombre del usuario',
        'NEED_TYPE_SELECTED': 'Tipo de necesidad',
        'PROBLEM_SENT': 'Problema enviado',
        'PROBLEM_DESCRIBED': 'Problema descrito',
        'DEVICE_DETECTION': 'Detección de dispositivo',
        'DEVICE_DETECTED': 'Dispositivo detectado',
        'DEVICE_DISAMBIGUATION': 'Desambiguación de dispositivo',
        'AWAITING_CONFIRMATION': 'Esperando confirmación',
        'DEVICE_CONFIRMED': 'Dispositivo confirmado',
        'ASK_STEPS': 'Solicitando pasos realizados',
        'STAGE_LOADED': 'Stage cargado',
        'USER_TEXT_INPUT': 'Texto ingresado por usuario'
      };
      
      const icon = icons[event.type] || '📌';
      const title = titles[event.type] || event.type;
      let detail = '';
      
      // Generar detalle según tipo de evento
      switch (event.type) {
        case 'SESSION_CREATED':
          detail = `SessionId: <span class="timeline-event-value">${event.data.sessionId}</span>`;
          if (event.data.status) {
            detail += ` | Estado: <span class="timeline-event-value">${event.data.status}</span>`;
          }
          break;
        case 'GDPR_ACCEPTED':
          detail = `Valor: <span class="timeline-event-value">${event.data.value || 'si'}</span>`;
          break;
        case 'LANGUAGE_SELECTION_SHOWN':
          detail = `Mostrando opciones de idioma | Estado: <span class="timeline-event-value">awaiting_language</span>`;
          break;
        case 'LANGUAGE_SELECTED':
          detail = `Idioma: <span class="timeline-event-value">${event.data.language}</span>`;
          if (event.data.gdprConsent) {
            detail += ` | GDPR: <span class="timeline-event-value">${event.data.gdprConsent}</span>`;
          }
          if (event.data.nextStage) {
            detail += `<span class="timeline-event-stage">→ ${event.data.nextStage}</span>`;
          }
          break;
        case 'NAME_PROVIDED':
          detail = `<strong style="color: #10b981; font-size: 14px;">"${event.data.userName || 'Usuari@'}"</strong>`;
          if (event.data.skipped) {
            detail += ' <span style="color: #f59e0b; font-size: 12px;">(prefirió no decirlo)</span>';
          } else {
            detail += ' <span style="color: #5cc8ff; font-size: 12px;">(ingresado por el usuario)</span>';
          }
          if (event.data.nextStage) {
            detail += `<span class="timeline-event-stage">→ ${event.data.nextStage}</span>`;
          }
          break;
        case 'USER_TEXT_INPUT':
          detail = `Usuario escribió: <strong style="color: #10b981;">"${event.data.text}"</strong>`;
          break;
        case 'NEED_TYPE_SELECTED':
          detail = `<span class="timeline-event-value">${event.data.needType}</span>`;
          if (event.data.userInput) {
            detail += ` | Input: <span style="color: #94a3b8;">"${event.data.userInput}"</span>`;
          }
          if (event.data.nextStage) {
            detail += `<span class="timeline-event-stage">→ ${event.data.nextStage}</span>`;
          }
          break;
        case 'PROBLEM_SENT':
          detail = `Texto: <span class="timeline-event-value">"${event.data.problem}"</span>`;
          break;
        case 'PROBLEM_DESCRIBED':
          detail = `<strong style="color: #10b981;">"${event.data.problem}"</strong>`;
          if (event.data.currentDevice && event.data.currentDevice !== 'null') {
            detail += ` | Dispositivo actual: <span class="timeline-event-value">${event.data.currentDevice}</span>`;
          }
          break;
        case 'DEVICE_DETECTION':
          detail = `Analizando: <span class="timeline-event-value">"${event.data.text}"</span>`;
          break;
        case 'DEVICE_DETECTED':
          detail = `<strong style="color: #10b981; font-size: 14px;">${event.data.deviceLabel || event.data.deviceId}</strong>`;
          if (event.data.term) {
            detail += ` (término: "<span class="timeline-event-value">${event.data.term}</span>")`;
          }
          if (event.data.confidence !== undefined) {
            const confidencePercent = (event.data.confidence * 100).toFixed(0);
            detail += ` | Confianza: <span class="timeline-event-value">${confidencePercent}%</span>`;
          }
          break;
        case 'DEVICE_DISAMBIGUATION':
          detail = `Candidatos: <span class="timeline-event-value">${event.data.candidates}</span>`;
          break;
        case 'AWAITING_CONFIRMATION':
          detail = `Esperando confirmación del usuario`;
          if (event.data.device && event.data.device !== 'null') {
            detail += ` | Dispositivo: <span class="timeline-event-value">${event.data.device}</span>`;
          }
          break;
        case 'DEVICE_CONFIRMED':
          detail = `Usuario confirmó: <strong style="color: #10b981;">✓ ${event.data.confirmation}</strong>`;
          break;
        case 'ASK_STEPS':
          detail = `Solicitando información de pasos realizados`;
          if (event.data.device && event.data.device !== 'null') {
            detail += ` | Dispositivo: <span class="timeline-event-value">${event.data.device}</span>`;
          }
          break;
        case 'STAGE_LOADED':
          detail = `Stage: <span class="timeline-event-value">${event.data.stage}</span>`;
          if (event.data.userName) {
            detail += ` | Usuario: <span class="timeline-event-value">${event.data.userName}</span>`;
          }
          break;
      }
      
      // Agregar información de archivo y líneas
      let fileExecutionHtml = '';
      if (event.data.file || event.data.line) {
        fileExecutionHtml = `
          <div class="timeline-file-execution">
            ${event.data.file ? `<span class="timeline-file-name">📄 ${event.data.file}</span>` : ''}
            ${event.data.line ? `<span class="timeline-file-line">línea(s): <span class="timeline-file-line-number">${event.data.line}</span></span>` : ''}
          </div>
        `;
      }
      
      // Agregar contexto del código si existe
      let contextHtml = '';
      if (event.data.context) {
        contextHtml = `
          <div class="timeline-code-context">
            <strong style="color: #5cc8ff;">Contexto:</strong> ${escapeHtml(event.data.context)}
          </div>
        `;
      }
      
      // Agregar descripción de lo que ve el usuario
      let userViewHtml = '';
      const userView = getUserViewDescription(event.type, event.data);
      if (userView) {
        userViewHtml = `
          <div class="timeline-user-view">
            <strong style="color: #f59e0b;">👁️ Usuario ve:</strong>
            <div style="background: #1e293b; padding: 10px; border-radius: 6px; margin-top: 5px; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">${userView}</div>
          </div>
        `;
      }
      
      return `
        <div class="timeline-event" data-event='${JSON.stringify(event).replace(/'/g, "&apos;")}'>
          <div class="timeline-event-time">
            ${event.timestamp}
            <button class="btn-copy-event" onclick="copiarEvento(this)" title="Copiar evento completo">
              📋
            </button>
          </div>
          <div class="timeline-event-icon">${icon}</div>
          <div class="timeline-event-content">
            <div class="timeline-event-title">${title}</div>
            <div class="timeline-event-detail">${detail}</div>
            ${fileExecutionHtml}
            ${contextHtml}
            ${userViewHtml}
          </div>
        </div>
      `;
    }
    
    function getUserViewDescription(eventType, data) {
      switch (eventType) {
        case 'SESSION_CREATED':
          return `📋 <strong>Política de Privacidad y Consentimiento</strong>

Antes de continuar, quiero informarte:

✅ Guardaré tu nombre y nuestra conversación durante <strong>48 horas</strong>
✅ Los datos se usarán <strong>solo para brindarte soporte técnico</strong>
✅ Podés solicitar <strong>eliminación de tus datos</strong> en cualquier momento
✅ <strong>No compartimos</strong> tu información con terceros
✅ Cumplimos con <strong>GDPR y normativas de privacidad</strong>

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

<strong>¿Aceptás estos términos?</strong>

[Botón: Sí] [Botón: No]`;

        case 'GDPR_ACCEPTED':
        case 'LANGUAGE_SELECTION_SHOWN':
          return `✅ <strong>Gracias por aceptar</strong>

🌍 <strong>Seleccioná tu idioma / Select your language:</strong>

[Botón: 🇦🇷 Español] [Botón: 🇺🇸 English]`;

        case 'LANGUAGE_SELECTED':
          if (data.language === 'español' || data.language === 'es-AR') {
            return `✅ Perfecto! Vamos a continuar en <strong>Español</strong>.

¿Cómo te llamás?

[Botón: 🙈 Prefiero no decirlo]`;
          } else {
            return `✅ Great! Let's continue in <strong>English</strong>.

What's your name?

[Button: 🙈 I prefer not to say]`;
          }

        case 'NAME_PROVIDED':
          const userName = data.userName === 'Usuari@' ? 'Usuario anónimo' : data.userName;
          return `👋 ¡Encantado de conocerte, <strong>${userName}</strong>!

¿En qué puedo ayudarte hoy?

[Botón: 🔧 Tengo un problema]
[Botón: 📝 Quiero hacer una tarea]
[Botón: ❓ Tengo una consulta]`;

        case 'NEED_TYPE_SELECTED':
          if (data.needType === 'Problema') {
            return `💬 Perfecto, <strong>contame con detalle el problema</strong>.

Por ejemplo:
• "Mi PC no enciende"
• "La impresora no imprime"
• "El servidor está lento"

<em>(El usuario puede escribir libremente)</em>`;
          } else if (data.needType === 'Tarea') {
            return `💬 Perfecto, <strong>contame qué querés hacer</strong>.

Por ejemplo:
• "Instalar un programa"
• "Configurar el email"
• "Crear una copia de seguridad"

<em>(El usuario puede escribir libremente)</em>`;
          } else {
            return `💬 Perfecto, <strong>haceme tu consulta</strong>.

<em>(El usuario puede escribir libremente)</em>`;
          }

        case 'PROBLEM_DESCRIBED':
        case 'PROBLEM_SENT':
          return `🔍 <strong>Analizando tu problema...</strong>

El sistema está:
• Normalizando el texto
• Detectando el dispositivo involucrado
• Clasificando el tipo de problema

<em>(Usuario espera respuesta del bot)</em>`;

        case 'DEVICE_DETECTED':
          const device = data.deviceLabel || data.deviceId || 'dispositivo';
          return `🖥️ <strong>¿Es correcto que el problema es con: ${device}?</strong>

[Botón: Sí, es ese]
[Botón: No, es otro]
[Botón: No lo sé]`;

        case 'DEVICE_CONFIRMED':
          return `✅ <strong>Perfecto, confirmado el dispositivo.</strong>

📝 ¿Ya probaste algunos pasos para solucionarlo? Contame qué hiciste.

<em>(El usuario puede escribir los pasos que realizó)</em>`;

        case 'ASK_STEPS':
          return `📝 <strong>Contame qué pasos realizaste para intentar solucionarlo.</strong>

Por ejemplo:
• "Reinicié la computadora"
• "Revisé los cables"
• "Actualicé el sistema"

<em>(El usuario puede escribir libremente)</em>`;

        default:
          return null;
      }
    }

    function cambiarOrden(orden) {
      sortOrder = orden;
      
      // Actualizar botones activos
      document.getElementById('sortAsc').classList.remove('active');
      document.getElementById('sortDesc').classList.remove('active');
      
      if (orden === 'asc') {
        document.getElementById('sortAsc').classList.add('active');
      } else {
        document.getElementById('sortDesc').classList.add('active');
      }
      
      // Re-renderizar timeline con nuevo orden
      if (currentView === 'timeline') {
        renderTimeline();
      }
      
      console.log('[Timeline] Orden cambiado a:', orden === 'asc' ? 'Antiguo → Nuevo' : 'Nuevo → Antiguo');
    }
    
    function copiarEvento(button) {
      const eventDiv = button.closest('.timeline-event');
      const eventData = JSON.parse(eventDiv.getAttribute('data-event'));
      
      // Obtener la descripción de lo que ve el usuario
      const userView = getUserViewDescription(eventData.type, eventData.data);
      
      // Formatear el evento para copiar
      const texto = `
═══════════════════════════════════════════════
🕐 EVENTO TIMELINE - ${eventData.timestamp}
═══════════════════════════════════════════════

📌 Tipo: ${eventData.type}

📋 Datos:
${JSON.stringify(eventData.data, null, 2)}

${userView ? `
👁️ USUARIO VE:
───────────────────────────────────────────────
${userView.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')}
───────────────────────────────────────────────
` : ''}
═══════════════════════════════════════════════
`.trim();
      
      // Copiar al clipboard
      navigator.clipboard.writeText(texto).then(() => {
        // Feedback visual
        const originalText = button.textContent;
        button.textContent = '✅';
        button.style.background = 'rgba(16,185,129,0.25)';
        button.style.borderColor = 'rgba(16,185,129,0.5)';
        button.style.color = '#10b981';
        
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
          button.style.borderColor = '';
          button.style.color = '';
        }, 1500);
        
        console.log('[Timeline] Evento copiado:', eventData.type);
      }).catch(err => {
        console.error('[Timeline] Error al copiar:', err);
        alert('Error al copiar el evento');
      });
    }

    function cerrarSesion() {
      if (confirm('¿Estás seguro que querés cerrar la sesión de logs?')) {
        if (eventSource) eventSource.close();
        // Llamar al logout en el servidor
        fetch('logout-logs.php', { method: 'POST' })
          .then(() => {
            window.location.href = 'login-logs.php';
          })
          .catch(() => {
            window.location.href = 'login-logs.php';
          });
      }
    }

    // Auto-conectar al cargar
    window.addEventListener('DOMContentLoaded', () => {
      agregarLog('info', 'Iniciando conexión automática...');
      conectar();
    });

    // Limpiar al cerrar
    window.addEventListener('beforeunload', () => {
      if (eventSource) eventSource.close();
      stopConnectionTimer();
    });
  </script>
</body>
</html>
