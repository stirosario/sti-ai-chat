// Estado actual de Tecnos
let tecnosState = "idle";
let recognition = null;
let isListening = false;

// Elementos del DOM
const card = document.getElementById("tecnos-card");
const stateLabel = document.getElementById("tecnos-state-label").querySelector("strong");
const logEl = document.getElementById("tecnos-log");
const userTextEl = document.getElementById("user-text");
const sttHintEl = document.getElementById("stt-hint");

// Botones
const btnIdle = document.getElementById("btn-idle");
const btnThinking = document.getElementById("btn-thinking");
const btnTalking = document.getElementById("btn-talking");
const btnSpeak = document.getElementById("btn-speak");
const btnListen = document.getElementById("btn-listen");

// Cambia visualmente el estado de Tecnos
function setTecnosState(newState, message) {
  tecnosState = newState;
  card.classList.remove("state-idle", "state-thinking", "state-talking", "state-listening");
  card.classList.add(`state-${newState}`);

  let labelText = "";
  switch (newState) {
    case "idle":
      labelText = "Idle";
      break;
    case "thinking":
      labelText = "Pensando";
      break;
    case "talking":
      labelText = "Hablando";
      break;
    case "listening":
      labelText = "Escuchando";
      break;
  }

  stateLabel.textContent = labelText;

  if (message) {
    logEl.textContent = message;
  }
}

// ---- Estados manuales ----
btnIdle.addEventListener("click", () => {
  setTecnosState("idle", "Tecnos vuelve a un estado tranquilo (idle).");
});

btnThinking.addEventListener("click", () => {
  setTecnosState("thinking", "Tecnos está 'pensando' (simulación de procesamiento).");
});

btnTalking.addEventListener("click", () => {
  setTecnosState("talking", "Tecnos está hablando (estado forzado manualmente).");
});

// ---- Voz de Tecnos (TTS local del navegador) ----
function speakWithTecnos(text) {
  if (!("speechSynthesis" in window)) {
    logEl.textContent = "Tu navegador no soporta síntesis de voz (speechSynthesis).";
    return;
  }

  // Detener cualquier voz en curso
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-AR";
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onstart = () => {
    setTecnosState("talking", "Tecnos está hablando…");
  };

  utterance.onend = () => {
    setTecnosState("idle", "Tecnos terminó de hablar.");
  };

  window.speechSynthesis.speak(utterance);
}

btnSpeak.addEventListener("click", () => {
  const text = "Hola, soy Tecnos de S T I. Esta es una prueba de voz local.";
  speakWithTecnos(text);
});

// ---- Reconocimiento de voz (STT local del navegador) ----
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    sttHintEl.textContent = "Tu navegador no soporta reconocimiento de voz (probá Chrome en escritorio).";
    btnListen.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "es-AR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    setTecnosState("listening", "Tecnos está escuchando… Hablá cerca del micrófono.");
    sttHintEl.textContent = "Escuchando…";
  };

  recognition.onerror = (event) => {
    isListening = false;
    setTecnosState("idle", "Ocurrió un error con el micrófono.");
    sttHintEl.textContent = "Error: " + event.error;
  };

  recognition.onend = () => {
    isListening = false;
    if (tecnosState === "listening") {
      setTecnosState("idle", "Tecnos dejó de escuchar.");
    }
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userTextEl.textContent = transcript;
    setTecnosState("thinking", "Tecnos está procesando lo que dijiste…");

    // Por ahora, Tecnos repite lo que escuchó (eco)
    setTimeout(() => {
      speakWithTecnos("Entendí: " + transcript);
    }, 500);
  };

  sttHintEl.textContent = "Listo para usar micrófono.";
}

btnListen.addEventListener("click", () => {
  if (!recognition) {
    logEl.textContent = "Reconocimiento de voz no disponible.";
    return;
  }
  if (isListening) {
    recognition.stop();
    return;
  }
  recognition.start();
});

// Inicializar
setTecnosState("idle", "Listo para probar animaciones y voz local.");
setupSpeechRecognition();
