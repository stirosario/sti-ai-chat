<?php
session_start();
$config = require $_SERVER['DOCUMENT_ROOT'] . '/../config.php';

$openai_key = $config["openai_key"];
$github_token = $config["github_token"];

if (!isset($_SESSION["autenticado"]) || $_SESSION["autenticado"] !== true) {
  http_response_code(403);
  echo "Acceso denegado.";
  exit;
}

function llamarOpenAI($prompt, $model, $api_key) {
  $url = "https://api.openai.com/v1/chat/completions";
  $data = [
    "model" => $model,
    "messages" => [["role" => "user", "content" => $prompt]],
    "temperature" => 0.7
  ];
  $options = [
    "http" => [
      "header" => "Content-type: application/json\r\nAuthorization: Bearer $api_key",
      "method" => "POST",
      "content" => json_encode($data)
    ]
  ];
  $context = stream_context_create($options);
  $result = file_get_contents($url, false, $context);
  $json = json_decode($result, true);
  return $json["choices"][0]["message"]["content"];
}

function consultarGitHub($prompt, $github_token) {
  $url = "https://api.github.com/search/code?q=" . urlencode($prompt) . "+in:file";
  $options = [
    "http" => [
      "header" => "User-Agent: GPT7\r\nAuthorization: Bearer $github_token",
      "method" => "GET"
    ]
  ];
  $context = stream_context_create($options);
  $result = @file_get_contents($url, false, $context);
  if ($result === FALSE) return "GitHub no respondió o hubo un error.";
  $json = json_decode($result, true);
  if (!empty($json["items"])) {
    return "GitHub encontró " . count($json["items"]) . " coincidencias. Ejemplo: " . $json["items"][0]["html_url"];
  } else {
    return "GitHub no encontró coincidencias relevantes.";
  }
}

function fusionarRespuestas($gpt4, $gpt35, $github, $pregunta, $api_key) {
  $fusion_prompt = "Tengo tres respuestas a la pregunta: \"$pregunta\".\n\nGPT-4:\n$gpt4\n\nGPT-3.5:\n$gpt35\n\nGitHub:\n$github\n\nFusiona lo mejor de las tres en una sola respuesta clara, precisa y completa.";
  return llamarOpenAI($fusion_prompt, "gpt-4", $api_key);
}

$prompt = $_POST["user_prompt"] ?? "";

$respuesta_gpt4 = llamarOpenAI($prompt, "gpt-4", $openai_key);
$respuesta_gpt35 = llamarOpenAI($prompt, "gpt-3.5-turbo", $openai_key);
$respuesta_github = consultarGitHub($prompt, $github_token);
$respuesta_final = fusionarRespuestas($respuesta_gpt4, $respuesta_gpt35, $respuesta_github, $prompt, $openai_key);