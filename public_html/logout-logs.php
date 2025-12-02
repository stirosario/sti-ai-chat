<?php
/**
 * ============================================
 * 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
 * ============================================
 * Archivo: logout-logs.php
 * Propósito: Destructor de sesiones admin
 * Seguridad: Limpieza completa de sesión + cookies
 * Autor: Sistema STI - GitHub Copilot + Lucas
 * Última modificación: 25/11/2025
 * 
 * ADVERTENCIA: Este código maneja la limpieza segura
 * de sesiones. Modificar puede dejar sesiones activas.
 * ============================================
 */

session_start();

// Destruir sesión
$_SESSION = array();

// Destruir cookie de sesión
if (isset($_COOKIE[session_name()])) {
    setcookie(session_name(), '', time()-3600, '/');
}

session_destroy();

// Redirigir a login
header('Location: login-logs.php');
exit;
