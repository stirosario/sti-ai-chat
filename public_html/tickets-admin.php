<?php
/**
 * ============================================
 * 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
 * ============================================
 * Archivo: tickets-admin.php
 * Propósito: Panel de administración de tickets
 * Seguridad: Sesiones PHP + API Token + Auto-refresh
 * Autor: Sistema STI - GitHub Copilot + Lucas
 * Última modificación: 25/11/2025
 * 
 * ADVERTENCIA: Este código incluye lógica de negocio
 * crítica para el sistema de tickets. No modificar
 * sin realizar pruebas exhaustivas.
 * ============================================
 */

session_start();

// Verificar autenticación
if (!isset($_SESSION['logs_authenticated']) || $_SESSION['logs_authenticated'] !== true) {
    header('Location: login-logs.php');
    exit;
}

// Verificar timeout de sesión (2 horas)
$session_timeout = 7200;
if (isset($_SESSION['logs_login_time']) && (time() - $_SESSION['logs_login_time']) > $session_timeout) {
    session_destroy();
    header('Location: login-logs.php?timeout=1');
    exit;
}

// Refrescar timestamp de actividad
$_SESSION['logs_login_time'] = time();
$current_user = $_SESSION['logs_user'] ?? 'admin';

// URL del API de Render
$API_BASE = 'https://sti-rosario-ai.onrender.com';

// Token directo
$LOG_TOKEN = 'admin.2381_';

// Función para obtener tickets del backend
function obtenerTickets($apiBase, $token) {
    $url = $apiBase . '/api/tickets?token=' . urlencode($token);
    
    $options = [
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: STI-Admin-Panel\r\n",
            'timeout' => 10
        ]
    ];
    
    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);
    
    if ($response === false) {
        return ['error' => 'No se pudo conectar con el servidor'];
    }
    
    $data = json_decode($response, true);
    return $data ?? ['error' => 'Respuesta inválida del servidor'];
}

// Obtener tickets
$tickets_data = obtenerTickets($API_BASE, $LOG_TOKEN);
$tickets = isset($tickets_data['tickets']) ? $tickets_data['tickets'] : [];
$error = isset($tickets_data['error']) ? $tickets_data['error'] : null;
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Administración de Tickets — STI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --metal-blue: #5cc8ff;
            --metal-blue-glow: rgba(92, 200, 255, 0.55);
            --dark-bg: #0a0e14;
            --darker-bg: #0f161e;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(180deg, var(--darker-bg), var(--dark-bg));
            background-attachment: fixed;
            color: #e0e6ed;
            min-height: 100vh;
            padding: 20px;
            position: relative;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(1200px 160px at 50% -180px, rgba(255, 255, 255, 0.05), transparent 60%);
            pointer-events: none;
            z-index: 0;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
            background: rgba(15, 22, 30, 0.6);
            border: 1px solid rgba(92, 200, 255, 0.3);
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(92, 200, 255, 0.1);
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid rgba(92, 200, 255, 0.2);
            position: relative;
        }

        header::before {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--metal-blue), transparent);
            opacity: 0.5;
        }

        h1 {
            color: var(--metal-blue);
            font-size: 2rem;
            font-weight: 700;
            text-shadow: 0 0 20px var(--metal-blue-glow);
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .user-info p {
            color: #a0aec0;
            font-size: 0.95rem;
        }

        .btn {
            padding: 10px 20px;
            border: 1px solid currentColor;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: 600;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .btn-primary {
            background: linear-gradient(135deg, rgba(92, 200, 255, 0.2), rgba(92, 200, 255, 0.1));
            color: var(--metal-blue);
            border-color: var(--metal-blue);
        }

        .btn-primary:hover {
            background: linear-gradient(135deg, rgba(92, 200, 255, 0.3), rgba(92, 200, 255, 0.2));
            box-shadow: 0 0 20px var(--metal-blue-glow);
            transform: translateY(-2px);
        }

        .btn-secondary {
            background: linear-gradient(135deg, rgba(100, 150, 255, 0.2), rgba(100, 150, 255, 0.1));
            color: #6496ff;
            border-color: #6496ff;
        }

        .btn-secondary:hover {
            background: linear-gradient(135deg, rgba(100, 150, 255, 0.3), rgba(100, 150, 255, 0.2));
            box-shadow: 0 0 20px rgba(100, 150, 255, 0.4);
            transform: translateY(-2px);
        }

        .btn-danger {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
            color: #ef4444;
            border-color: #ef4444;
        }

        .btn-danger:hover {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.2));
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
            transform: translateY(-2px);
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(92, 200, 255, 0.05);
            border: 1px solid rgba(92, 200, 255, 0.2);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(92, 200, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--metal-blue);
            text-shadow: 0 0 15px var(--metal-blue-glow);
            margin-bottom: 5px;
        }

        .stat-label {
            color: #a0aec0;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .filters {
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
            flex-wrap: wrap;
        }

        .filter-btn {
            padding: 8px 16px;
            background: rgba(15, 22, 30, 0.6);
            border: 1px solid rgba(92, 200, 255, 0.2);
            border-radius: 6px;
            color: #a0aec0;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }

        .filter-btn:hover,
        .filter-btn.active {
            background: rgba(92, 200, 255, 0.15);
            border-color: var(--metal-blue);
            color: var(--metal-blue);
            box-shadow: 0 0 15px rgba(92, 200, 255, 0.2);
        }

        .error-message {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 15px;
            color: #ef4444;
            margin-bottom: 20px;
            text-align: center;
        }

        .tickets-grid {
            display: grid;
            gap: 20px;
            margin-bottom: 20px;
        }

        .ticket-card {
            background: rgba(15, 22, 30, 0.8);
            border: 1px solid rgba(92, 200, 255, 0.2);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.3s ease;
        }

        .ticket-card:hover {
            border-color: var(--metal-blue);
            box-shadow: 0 4px 20px rgba(92, 200, 255, 0.15);
            transform: translateY(-2px);
        }

        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(92, 200, 255, 0.1);
        }

        .ticket-id {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--metal-blue);
            text-shadow: 0 0 10px var(--metal-blue-glow);
        }

        .ticket-status {
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-open {
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .status-pending {
            background: rgba(251, 191, 36, 0.2);
            color: #fbbf24;
            border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .status-closed {
            background: rgba(107, 114, 128, 0.2);
            color: #9ca3af;
            border: 1px solid rgba(107, 114, 128, 0.3);
        }

        .ticket-body {
            display: grid;
            gap: 10px;
        }

        .ticket-field {
            display: flex;
            gap: 10px;
        }

        .ticket-label {
            color: #a0aec0;
            font-weight: 600;
            min-width: 120px;
        }

        .ticket-value {
            color: #e0e6ed;
        }

        .ticket-description {
            background: rgba(10, 14, 20, 0.5);
            border: 1px solid rgba(92, 200, 255, 0.1);
            border-radius: 6px;
            padding: 12px;
            margin-top: 10px;
            color: #cbd5e0;
            line-height: 1.6;
        }

        .ticket-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(92, 200, 255, 0.1);
        }

        .no-tickets {
            text-align: center;
            padding: 60px 20px;
            color: #a0aec0;
            font-size: 1.1rem;
        }

        .no-tickets::before {
            content: '📋';
            display: block;
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }

        footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid rgba(92, 200, 255, 0.1);
            color: #6b7280;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            h1 {
                font-size: 1.5rem;
            }

            .user-info {
                flex-direction: column;
                align-items: flex-end;
                gap: 10px;
            }

            .stats {
                grid-template-columns: 1fr;
            }

            .ticket-header {
                flex-direction: column;
                gap: 10px;
            }

            .ticket-actions {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>
                <span>🎫</span>
                Administración de Tickets
            </h1>
            <div class="user-info">
                <p>👤 Sesión: <?= htmlspecialchars($current_user) ?></p>
                <button class="btn btn-secondary" onclick="window.location.href='chatlog.php'">📊 Ver Logs</button>
                <button class="btn btn-danger" onclick="cerrarSesion()">🚪 Cerrar sesión</button>
            </div>
        </header>

        <?php if ($error): ?>
            <div class="error-message">
                ⚠️ <?= htmlspecialchars($error) ?>
            </div>
        <?php endif; ?>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value" id="total-tickets"><?= count($tickets) ?></div>
                <div class="stat-label">Total Tickets</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="open-tickets">0</div>
                <div class="stat-label">Abiertos</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="pending-tickets">0</div>
                <div class="stat-label">Pendientes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="closed-tickets">0</div>
                <div class="stat-label">Cerrados</div>
            </div>
        </div>

        <div class="filters">
            <button class="filter-btn active" data-filter="all">📋 Todos</button>
            <button class="filter-btn" data-filter="open">✅ Abiertos</button>
            <button class="filter-btn" data-filter="pending">⏳ Pendientes</button>
            <button class="filter-btn" data-filter="closed">🔒 Cerrados</button>
        </div>

        <div class="tickets-grid" id="tickets-container">
            <?php if (empty($tickets)): ?>
                <div class="no-tickets">
                    No hay tickets registrados en el sistema.
                </div>
            <?php else: ?>
                <?php foreach ($tickets as $ticket): ?>
                    <div class="ticket-card" data-status="<?= htmlspecialchars($ticket['status'] ?? 'open') ?>">
                        <div class="ticket-header">
                            <div class="ticket-id"><?= htmlspecialchars($ticket['ticketId'] ?? 'N/A') ?></div>
                            <span class="ticket-status status-<?= htmlspecialchars($ticket['status'] ?? 'open') ?>">
                                <?= htmlspecialchars($ticket['status'] ?? 'open') ?>
                            </span>
                        </div>
                        <div class="ticket-body">
                            <div class="ticket-field">
                                <span class="ticket-label">Nombre:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['userName'] ?? 'N/A') ?></span>
                            </div>
                            <div class="ticket-field">
                                <span class="ticket-label">Email:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['email'] ?? 'N/A') ?></span>
                            </div>
                            <div class="ticket-field">
                                <span class="ticket-label">Teléfono:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['phone'] ?? 'N/A') ?></span>
                            </div>
                            <div class="ticket-field">
                                <span class="ticket-label">Dispositivo:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['device'] ?? 'N/A') ?></span>
                            </div>
                            <div class="ticket-field">
                                <span class="ticket-label">Problema:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['problemType'] ?? 'N/A') ?></span>
                            </div>
                            <div class="ticket-field">
                                <span class="ticket-label">Fecha:</span>
                                <span class="ticket-value"><?= htmlspecialchars($ticket['createdAt'] ?? 'N/A') ?></span>
                            </div>
                            <?php if (!empty($ticket['description'])): ?>
                                <div class="ticket-description">
                                    <?= nl2br(htmlspecialchars($ticket['description'])) ?>
                                </div>
                            <?php endif; ?>
                        </div>
                        <div class="ticket-actions">
                            <button class="btn btn-primary" onclick="verDetalles('<?= htmlspecialchars($ticket['ticketId']) ?>')">
                                👁️ Ver detalles
                            </button>
                            <button class="btn btn-secondary" onclick="descargarTicket('<?= htmlspecialchars($ticket['ticketId']) ?>')">
                                💾 Descargar
                            </button>
                        </div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <footer>
            <p>Sistema de Gestión de Tickets — STI Rosario</p>
            <p style="margin-top: 5px; font-size: 0.85rem;">Sesión expira en 2 horas de inactividad</p>
        </footer>
    </div>

    <script>
        const tickets = <?= json_encode($tickets) ?>;
        
        // Calcular estadísticas
        function calcularEstadisticas() {
            const stats = {
                total: tickets.length,
                open: 0,
                pending: 0,
                closed: 0
            };
            
            tickets.forEach(ticket => {
                const status = (ticket.status || 'open').toLowerCase();
                if (status === 'open') stats.open++;
                else if (status === 'pending') stats.pending++;
                else if (status === 'closed') stats.closed++;
            });
            
            document.getElementById('total-tickets').textContent = stats.total;
            document.getElementById('open-tickets').textContent = stats.open;
            document.getElementById('pending-tickets').textContent = stats.pending;
            document.getElementById('closed-tickets').textContent = stats.closed;
        }
        
        // Filtrar tickets
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                // Actualizar botón activo
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                // Filtrar tickets
                const filter = this.dataset.filter;
                const ticketCards = document.querySelectorAll('.ticket-card');
                
                ticketCards.forEach(card => {
                    if (filter === 'all') {
                        card.style.display = 'block';
                    } else {
                        const status = card.dataset.status;
                        card.style.display = status === filter ? 'block' : 'none';
                    }
                });
            });
        });
        
        // Ver detalles (abrir en nueva ventana o modal)
        function verDetalles(ticketId) {
            const API_BASE = '<?= $API_BASE ?>';
            const LOG_TOKEN = '<?= $LOG_TOKEN ?>';
            const url = `${API_BASE}/api/ticket/${ticketId}?token=${encodeURIComponent(LOG_TOKEN)}`;
            window.open(url, '_blank');
        }
        
        // Descargar ticket como JSON
        function descargarTicket(ticketId) {
            const ticket = tickets.find(t => t.ticketId === ticketId);
            if (!ticket) return;
            
            const dataStr = JSON.stringify(ticket, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${ticketId}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        
        // Cerrar sesión
        function cerrarSesion() {
            if (confirm('¿Estás seguro de que deseas cerrar la sesión?')) {
                fetch('logout-logs.php', { method: 'POST' })
                    .then(() => {
                        window.location.href = 'login-logs.php';
                    })
                    .catch(() => {
                        window.location.href = 'login-logs.php';
                    });
            }
        }
        
        // Inicializar
        calcularEstadisticas();
        
        // Auto-refresh cada 30 segundos
        setInterval(() => {
            location.reload();
        }, 30000);
    </script>
</body>
</html>
