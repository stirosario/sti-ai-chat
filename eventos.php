<?php
/**
 * eventos.php - Visor de eventos del frontend para debugging
 * 
 * Esta página muestra un log de eventos que ocurren en el frontend,
 * especialmente útil para diagnosticar problemas con el botón "Asistencia 24/7"
 * 
 * Autenticación: Misma que tickets-admin (password simple)
 */

session_start();

// Configuración de autenticación
$ADMIN_PASSWORD = 'sti2025'; // Cambiar en producción

// Archivo donde se guardan los eventos
$EVENTS_FILE = __DIR__ . '/data/frontend-events.json';

// Crear directorio data si no existe
if (!file_exists(__DIR__ . '/data')) {
    mkdir(__DIR__ . '/data', 0755, true);
}

// Crear archivo de eventos si no existe
if (!file_exists($EVENTS_FILE)) {
    file_put_contents($EVENTS_FILE, json_encode([], JSON_PRETTY_PRINT));
}

// Manejar logout
if (isset($_GET['logout'])) {
    unset($_SESSION['eventos_auth']);
    header('Location: eventos.php');
    exit;
}

// Manejar login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === $ADMIN_PASSWORD) {
        $_SESSION['eventos_auth'] = true;
        header('Location: eventos.php');
        exit;
    } else {
        $error = 'Contraseña incorrecta';
    }
}

// Manejar API para recibir eventos (desde JavaScript)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'log_event') {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    $event = [
        'timestamp' => date('Y-m-d H:i:s'),
        'type' => $_POST['type'] ?? 'unknown',
        'message' => $_POST['message'] ?? '',
        'data' => $_POST['data'] ?? null,
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'ip' => $_SERVER['REMOTE_ADDR'] ?? ''
    ];
    
    // Leer eventos existentes
    $events = json_decode(file_get_contents($EVENTS_FILE), true) ?: [];
    
    // Agregar nuevo evento al principio
    array_unshift($events, $event);
    
    // Mantener solo los últimos 500 eventos
    $events = array_slice($events, 0, 500);
    
    // Guardar
    file_put_contents($EVENTS_FILE, json_encode($events, JSON_PRETTY_PRINT));
    
    echo json_encode(['success' => true]);
    exit;
}

// Manejar limpiar eventos
if (isset($_GET['clear']) && isset($_SESSION['eventos_auth'])) {
    file_put_contents($EVENTS_FILE, json_encode([], JSON_PRETTY_PRINT));
    header('Location: eventos.php');
    exit;
}

// Verificar autenticación para ver la página
$isAuthenticated = isset($_SESSION['eventos_auth']) && $_SESSION['eventos_auth'] === true;

// Leer eventos
$events = [];
if ($isAuthenticated && file_exists($EVENTS_FILE)) {
    $events = json_decode(file_get_contents($EVENTS_FILE), true) ?: [];
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STI - Visor de Eventos</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0a1628 0%, #1a2a4a 100%);
            min-height: 100vh;
            color: #e8f4fc;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            margin-bottom: 20px;
        }
        
        h1 {
            font-size: 24px;
            color: #5cc8ff;
        }
        
        .actions {
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
            text-decoration: none;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #0066cc, #004499);
            color: white;
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #dc3545, #a71d2a);
            color: white;
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        /* Login form */
        .login-box {
            max-width: 400px;
            margin: 100px auto;
            padding: 40px;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 16px;
            border: 1px solid rgba(92, 200, 255, 0.3);
        }
        
        .login-box h2 {
            text-align: center;
            margin-bottom: 30px;
            color: #5cc8ff;
        }
        
        .login-box input {
            width: 100%;
            padding: 15px;
            margin-bottom: 15px;
            border: 1px solid rgba(92, 200, 255, 0.3);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 16px;
        }
        
        .login-box input::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        
        .login-box .error {
            background: rgba(220, 53, 69, 0.2);
            border: 1px solid #dc3545;
            color: #ff6b7a;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 15px;
            text-align: center;
        }
        
        /* Events list */
        .events-list {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .event {
            padding: 15px 20px;
            border-bottom: 1px solid rgba(92, 200, 255, 0.1);
            transition: background 0.2s;
        }
        
        .event:hover {
            background: rgba(92, 200, 255, 0.05);
        }
        
        .event:last-child {
            border-bottom: none;
        }
        
        .event-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .event-type {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .event-type.click { background: #28a745; }
        .event-type.error { background: #dc3545; }
        .event-type.info { background: #17a2b8; }
        .event-type.warning { background: #ffc107; color: #000; }
        .event-type.init { background: #6f42c1; }
        .event-type.show { background: #20c997; }
        .event-type.hide { background: #6c757d; }
        
        .event-time {
            color: rgba(255, 255, 255, 0.5);
            font-size: 13px;
        }
        
        .event-message {
            font-size: 15px;
            margin-bottom: 8px;
        }
        
        .event-data {
            font-family: monospace;
            font-size: 12px;
            background: rgba(0, 0, 0, 0.3);
            padding: 10px;
            border-radius: 6px;
            overflow-x: auto;
            color: #7fdbff;
        }
        
        .event-meta {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.4);
            margin-top: 8px;
        }
        
        .no-events {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .no-events h3 {
            margin-bottom: 10px;
        }
        
        .stats {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .stat {
            background: rgba(0, 0, 0, 0.3);
            padding: 15px 25px;
            border-radius: 10px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: #5cc8ff;
        }
        
        .stat-label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
        }
        
        .refresh-notice {
            text-align: center;
            padding: 10px;
            background: rgba(92, 200, 255, 0.1);
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        
        @media (max-width: 768px) {
            .event-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }
            
            .stats {
                flex-wrap: wrap;
            }
            
            .stat {
                flex: 1;
                min-width: 100px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <?php if (!$isAuthenticated): ?>
            <!-- Login Form -->
            <div class="login-box">
                <h2>🔒 Visor de Eventos</h2>
                <?php if (isset($error)): ?>
                    <div class="error"><?= htmlspecialchars($error) ?></div>
                <?php endif; ?>
                <form method="POST">
                    <input type="password" name="password" placeholder="Contraseña" required autofocus>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Ingresar</button>
                </form>
            </div>
        <?php else: ?>
            <!-- Events Viewer -->
            <header>
                <h1>📊 Visor de Eventos - STI</h1>
                <div class="actions">
                    <a href="?" class="btn btn-secondary">🔄 Actualizar</a>
                    <a href="?clear=1" class="btn btn-danger" onclick="return confirm('¿Limpiar todos los eventos?')">🗑️ Limpiar</a>
                    <a href="?logout=1" class="btn btn-secondary">🚪 Salir</a>
                </div>
            </header>
            
            <div class="refresh-notice">
                ⏱️ Esta página muestra eventos en tiempo real. Los eventos se registran cuando los usuarios interactúan con el chat.
            </div>
            
            <?php
            // Calcular estadísticas
            $totalEvents = count($events);
            $clickEvents = count(array_filter($events, fn($e) => $e['type'] === 'click'));
            $errorEvents = count(array_filter($events, fn($e) => $e['type'] === 'error'));
            $showEvents = count(array_filter($events, fn($e) => $e['type'] === 'show'));
            ?>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value"><?= $totalEvents ?></div>
                    <div class="stat-label">Total Eventos</div>
                </div>
                <div class="stat">
                    <div class="stat-value"><?= $clickEvents ?></div>
                    <div class="stat-label">Clicks</div>
                </div>
                <div class="stat">
                    <div class="stat-value"><?= $showEvents ?></div>
                    <div class="stat-label">Chat Abierto</div>
                </div>
                <div class="stat">
                    <div class="stat-value"><?= $errorEvents ?></div>
                    <div class="stat-label">Errores</div>
                </div>
            </div>
            
            <div class="events-list">
                <?php if (empty($events)): ?>
                    <div class="no-events">
                        <h3>📭 No hay eventos registrados</h3>
                        <p>Los eventos aparecerán aquí cuando los usuarios interactúen con el chat.</p>
                        <p style="margin-top: 15px;">
                            <strong>Nota:</strong> Asegurate de que el código de eventos esté desplegado en producción.
                        </p>
                    </div>
                <?php else: ?>
                    <?php foreach ($events as $event): ?>
                        <div class="event">
                            <div class="event-header">
                                <span class="event-type <?= htmlspecialchars($event['type']) ?>">
                                    <?= htmlspecialchars($event['type']) ?>
                                </span>
                                <span class="event-time"><?= htmlspecialchars($event['timestamp']) ?></span>
                            </div>
                            <div class="event-message"><?= htmlspecialchars($event['message']) ?></div>
                            <?php if (!empty($event['data'])): ?>
                                <div class="event-data"><?= htmlspecialchars(is_string($event['data']) ? $event['data'] : json_encode($event['data'])) ?></div>
                            <?php endif; ?>
                            <div class="event-meta">
                                IP: <?= htmlspecialchars(substr($event['ip'] ?? '', 0, -3) . 'xxx') ?> |
                                UA: <?= htmlspecialchars(substr($event['userAgent'] ?? '', 0, 80)) ?>...
                            </div>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
