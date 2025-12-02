<?php
session_start();
$config = require $_SERVER['DOCUMENT_ROOT'] . '/../config.php';

$usuario_valido = $config["usuario"];
$contrasena_valida = $config["clave"];

if (!isset($_SESSION["autenticado"])) {
  if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($_POST["usuario"])) {
    if ($_POST["usuario"] === $usuario_valido && $_POST["contrasena"] === $contrasena_valida) {
      $_SESSION["autenticado"] = true;
      header("Location: gpt7.php");
      exit;
    } else {
      echo "<p style='color:red;'>Credenciales incorrectas.</p>";
    }
  }

  echo '<h2>Login GPT7</h2>
  <form method="POST">
    Usuario: <input type="text" name="usuario"><br>
    Contraseña: <input type="password" name="contrasena"><br>
    <button type="submit">Ingresar</button>
  </form>';
  exit;
}
?>

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>GPT7 Fusionador</title>
</head>
<body>
  <h1>GPT7: Fusionador de respuestas</h1>
  <form method="POST">
    <textarea name="user_prompt" rows="6" cols="80" placeholder="Escribe tu pregunta aquí..."></textarea><br>
    <button type="submit">Enviar</button>
  </form>

<?php
if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($_POST["user_prompt"])) {
  require_once("gpt7_backend.php");

  echo "<h2>Respuesta GPT-4:</h2><div style='border:1px solid #ccc;padding:10px;white-space:pre-wrap;'>$respuesta_gpt4</div>";
  echo "<h2>Respuesta GPT-3.5:</h2><div style='border:1px solid #ccc;padding:10px;white-space:pre-wrap;'>$respuesta_gpt35</div>";
  echo "<h2>Resultado GitHub:</h2><div style='border:1px solid #ccc;padding:10px;white-space:pre-wrap;'>$respuesta_github</div>";
  echo "<h2>Respuesta combinada:</h2><div style='border:2px solid #000;padding:10px;white-space:pre-wrap;background:#f9f9f9;'>$respuesta_final</div>";
}
?>
</body>
</html>