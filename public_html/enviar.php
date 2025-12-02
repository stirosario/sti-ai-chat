<?php
// =========================================================
// STI Rosario - enviar.php (protección total anti-bots)
// =========================================================
session_start();

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__.'/phpmailer/src/PHPMailer.php';
require __DIR__.'/phpmailer/src/SMTP.php';
require __DIR__.'/phpmailer/src/Exception.php';

// ===== Config Turnstile =====
$TURNSTILE_SECRET = '0x4AAAAAAB9AB0_35KwkIGq1MQr0vL0SetU'; // 🔐 tu clave secreta de Cloudflare

// ===== Util =====
function clean($s){ return trim(strip_tags($s)); }
function fail($code,$msg){ http_response_code($code); exit($msg); }

// ===== Validaciones básicas =====
if($_SERVER['REQUEST_METHOD']!=='POST'){ fail(405,'Método no permitido'); }

// CSRF
if(empty($_POST['csrf_token']) || $_POST['csrf_token']!==($_SESSION['csrf_token']??'')){
  fail(400,'CSRF token inválido');
}

// Honeypot
if(!empty($_POST['empresa'])){ fail(400,'Spam detectado'); }

// Time-trap (≥3 s)
$startedAt = intval($_POST['started_at'] ?? 0);
if($startedAt>0){
  $elapsedMs = (int)(microtime(true)*1000) - $startedAt;
  if($elapsedMs < 3000){ fail(400,'Envío demasiado rápido'); }
}

// Campos
$nombre   = clean($_POST['nombre'] ?? '');
$email    = clean($_POST['email'] ?? '');
$telefono = clean($_POST['telefono'] ?? '');
$mensaje  = trim($_POST['mensaje'] ?? '');
if(!$nombre || !filter_var($email,FILTER_VALIDATE_EMAIL) || !$mensaje){
  fail(400,'Datos inválidos');
}

// ===== Verificación Cloudflare Turnstile =====
$tsResp = $_POST['cf-turnstile-response'] ?? '';
if(empty($tsResp)){ fail(400,'Validación humana requerida'); }

$verify = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
curl_setopt_array($verify,[
  CURLOPT_RETURNTRANSFER=>true,
  CURLOPT_POST=>true,
  CURLOPT_POSTFIELDS=>http_build_query([
    'secret'=>$TURNSTILE_SECRET,
    'response'=>$tsResp,
    'remoteip'=>$_SERVER['REMOTE_ADDR'] ?? null
  ]),
  CURLOPT_TIMEOUT=>10,
]);
$resp = curl_exec($verify);
curl_close($verify);
$data = $resp ? json_decode($resp,true) : [];
if(empty($data['success'])){ fail(400,'No se pudo validar que sos humano'); }

// =========================================================
// SMTP Donweb / Ferozo (PHPMailer)
// =========================================================
$smtpHost   = 'a0010812.ferozo.com';
$smtpUser   = 'web@stia.com.ar';
$smtpPass   = 'Marco@3838';
$smtpPort   = 465;
$smtpSecure = PHPMailer::ENCRYPTION_SMTPS;

$destino = 'stia@stia.com.ar';
$asunto  = 'Nueva consulta desde stia.com.ar';

// ===== Cuerpo del mensaje =====
$bodyTxt = "Nombre: $nombre\nEmail: $email\nTeléfono: $telefono\n\nMensaje:\n$mensaje\n\n---\n".
           "Fecha: ".date('d/m/Y H:i')."\nIP: ".($_SERVER['REMOTE_ADDR']??'N/D').
           "\nUA: ".($_SERVER['HTTP_USER_AGENT']??'N/D');
$bodyHtml = nl2br($bodyTxt);

// ===== Envío =====
$mail = new PHPMailer(true);
try{
  $mail->isSMTP();
  $mail->Host       = $smtpHost;
  $mail->SMTPAuth   = true;
  $mail->Username   = $smtpUser;
  $mail->Password   = $smtpPass;
  $mail->SMTPSecure = $smtpSecure;
  $mail->Port       = $smtpPort;
  $mail->CharSet    = 'UTF-8';

  $mail->setFrom($smtpUser,'STI Rosario');
  $mail->addAddress($destino,'STI Rosario');
  $mail->addReplyTo($email,$nombre);

  $mail->isHTML(true);
  $mail->Subject = $asunto;
  $mail->Body    = $bodyHtml;
  $mail->AltBody = $bodyTxt;

  $mail->send();

  // Regenerar CSRF
  $_SESSION['csrf_token'] = bin2hex(random_bytes(16));

  header('Location: /gracias.html');
  exit;

}catch(Exception $e){
  fail(500,"❌ No se pudo enviar el mensaje. Error: ".$mail->ErrorInfo);
}
