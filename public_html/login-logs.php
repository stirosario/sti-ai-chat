<?php
/**
 * ============================================
 * 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
 * ============================================
 * Archivo: login-logs.php
 * Propósito: Gateway de autenticación para paneles admin
 * Seguridad: Sesiones PHP + Timeout 2h + Credentials hardcoded
 * Autor: Sistema STI - GitHub Copilot + Lucas
 * Última modificación: 25/11/2025
 * 
 * ADVERTENCIA: Este archivo contiene credenciales hardcodeadas
 * por estabilidad post-crash. Cualquier modificación requiere
 * validación en entorno de pruebas primero.
 * 
 * NOTA: config.php causó downtime completo del hosting.
 * No reintegrar sin análisis de causa raíz.
 * ============================================
 */

session_start();

// Credenciales directas
define('LOG_ADMIN_USER', 'lucas');
define('LOG_ADMIN_PASS', 'admin.2381_');

$error = '';

// Si ya está autenticado, redirigir a logs
if (isset($_SESSION['logs_authenticated']) && $_SESSION['logs_authenticated'] === true) {
    header('Location: chatlog.php');
    exit;
}

// Procesar login
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = $_POST['username'] ?? '';
    $pass = $_POST['password'] ?? '';
    
    if ($user === LOG_ADMIN_USER && $pass === LOG_ADMIN_PASS) {
        // Login exitoso
        $_SESSION['logs_authenticated'] = true;
        $_SESSION['logs_login_time'] = time();
        $_SESSION['logs_user'] = $user;
        
        // Regenerar session ID para prevenir session fixation
        session_regenerate_id(true);
        
        header('Location: chatlog.php');
        exit;
    } else {
        $error = 'Usuario o contraseña incorrectos';
        // Log de intento fallido (opcional)
        error_log('[Security] Failed login attempt for logs viewer from IP: ' . $_SERVER['REMOTE_ADDR']);
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — STI Logs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: 
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(92,200,255,0.15), transparent),
        linear-gradient(180deg, #0a0e14 0%, #0f161e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-container {
      background: 
        radial-gradient(1200px 160px at 50% -180px, rgba(255,255,255,.05), transparent 60%),
        linear-gradient(180deg, rgba(15,22,30,.95), rgba(10,14,20,.95));
      border: 1px solid rgba(92,200,255,0.3);
      border-radius: 16px;
      box-shadow: 
        0 20px 60px rgba(0,0,0,0.5),
        0 0 28px rgba(92,200,255,0.25),
        inset 0 0 14px rgba(92,200,255,0.15);
      padding: 40px;
      max-width: 400px;
      width: 100%;
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo h1 {
      font-size: 28px;
      color: #5cc8ff;
      text-shadow: 0 0 15px rgba(92,200,255,0.6);
      margin-bottom: 10px;
    }
    .logo p {
      color: #94a3b8;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #e0e0e0;
      font-weight: 600;
      font-size: 14px;
    }
    .form-group input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(92,200,255,0.3);
      border-radius: 8px;
      font-size: 15px;
      background: rgba(15,22,30,0.6);
      color: #e0e0e0;
      transition: all 0.3s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #5cc8ff;
      box-shadow: 0 0 0 3px rgba(92,200,255,0.2);
      background: rgba(15,22,30,0.8);
    }
    .error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #fca5a5;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      text-align: center;
    }
    .btn-login {
      width: 100%;
      padding: 14px;
      background: linear-gradient(90deg, rgba(92,200,255,0.8) 0%, rgba(0,229,255,0.8) 100%);
      color: #fff;
      border: 1px solid rgba(92,200,255,0.6);
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 
        0 0 20px rgba(92,200,255,0.4),
        inset 0 0 12px rgba(92,200,255,0.3);
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 10px 25px rgba(92,200,255,0.5),
        inset 0 0 14px rgba(92,200,255,0.4);
    }
    .btn-login:active {
      transform: translateY(0);
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      color: #64748b;
      font-size: 13px;
    }
    .security-note {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.5);
      color: #6ee7b7;
      padding: 12px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 13px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="logo">
      <h1>🔐 STI Logs</h1>
      <p>Panel de administración</p>
    </div>

    <?php if ($error): ?>
      <div class="error">
        ⚠️ <?= htmlspecialchars($error) ?>
      </div>
    <?php endif; ?>

    <form method="POST" action="">
      <div class="form-group">
        <label for="username">Usuario</label>
        <input 
          type="text" 
          id="username" 
          name="username" 
          required 
          autofocus
          autocomplete="username"
        >
      </div>

      <div class="form-group">
        <label for="password">Contraseña</label>
        <input 
          type="password" 
          id="password" 
          name="password" 
          required
          autocomplete="current-password"
        >
      </div>

      <button type="submit" class="btn-login">
        🚀 Ingresar
      </button>
    </form>

    <div class="security-note">
      🔒 Conexión segura • Sesión expira en 2 horas
    </div>

    <div class="footer">
      STI Rosario © <?= date('Y') ?> • Todos los derechos reservados
    </div>
  </div>
</body>
</html>
