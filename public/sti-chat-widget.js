/**
 * STI Chat Widget - Standalone
 * Widget embebible del chat de STI con efecto "PENSANDO"
 * Actualizado para compatibilidad con server.js v7
 */

(function() {
  'use strict';

  // ========== CONFIGURACIÓN ==========
  const API_URL = 'https://sti-rosario-ai.onrender.com/api';
  let sessionId = null;
  let csrfToken = null;
  let isProcessing = false;
  let isInitialized = false;

  // ========== MAPEO DE TOKENS A ETIQUETAS ==========
  const BUTTON_LABELS = {
    'BTN_SOLVED': 'Lo resolví ✔️',
    'BTN_PERSIST': 'Sigue pasando ❌',
    'BTN_MORE_TESTS': 'Más pruebas 🔍',
    'BTN_CONNECT_TECH': 'Conectar con Técnico 🧑‍💻',
    'BTN_WHATSAPP': 'Enviar WhatsApp 📱',
    'BTN_CLOSE': 'Cerrar chat ❌',
    'BTN_REPHRASE': 'Reformular problema ✏️',
    'BTN_CONFIRM_TICKET': 'Sí, generar ticket ✅',
    'BTN_CANCEL': 'Cancelar ❌',
    'BTN_MORE_SIMPLE': 'Más simple 🔧',
    'BTN_PROBLEMA': 'Tengo un problema',
    'BTN_CONSULTA': 'Tengo una consulta'
  };

  // Mapear token a etiqueta legible
  function getButtonLabel(token) {
    if (token.startsWith('BTN_HELP_')) {
      const stepNum = token.split('_').pop();
      return `Ayuda paso ${stepNum} 🛠️`;
    }
    return BUTTON_LABELS[token] || token;
  }

  // Convertir array de tokens a array de objetos {label, value}
  function tokensToButtons(tokens) {
    if (!Array.isArray(tokens)) return [];
    return tokens.map(token => ({
      label: getButtonLabel(token),
      value: token
    }));
  }

  // ========== INICIALIZACIÓN ==========
  async function initChat() {
    if (isInitialized) return;
    
    // Eventos
    const sendBtn = document.getElementById('sti-send');
    const textInput = document.getElementById('sti-text');
    const attachBtn = document.getElementById('sti-attach-btn');
    const closeBtn = document.getElementById('sti-close');

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (textInput) {
      textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }
    if (attachBtn) attachBtn.addEventListener('click', () => alert('Próximamente: Adjuntar imágenes'));
    if (closeBtn) closeBtn.addEventListener('click', () => {
      const chatBox = document.getElementById('sti-chat-box');
      if (chatBox) chatBox.style.display = 'none';
    });

    // Inicializar sesión llamando a /api/greeting
    try {
      showTypingIndicator();
      const response = await fetch(`${API_URL}/greeting`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      hideTypingIndicator();

      if (data.ok && data.sessionId) {
        sessionId = data.sessionId;
        csrfToken = data.csrfToken;
        isInitialized = true;

        // Mostrar mensaje de bienvenida del servidor
        if (data.reply || data.greeting) {
          const welcomeText = data.reply || data.greeting;
          let buttons = null;
          if (data.buttons && Array.isArray(data.buttons)) {
            // Los botones del greeting vienen como { text, value }
            buttons = data.buttons.map(b => ({
              label: b.text || b.label || b.value,
              value: b.value || b.token || b.text
            }));
          }
          addMessage('bot', welcomeText, buttons);
        } else {
          addMessage('bot', '¡Hola! Soy Tecnos, tu asistente técnico de STI 👋\n\n¿En qué puedo ayudarte hoy?');
        }
      } else {
        // Fallback si falla la inicialización
        sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        isInitialized = true;
        addMessage('bot', '¡Hola! Soy Tecnos, tu asistente técnico de STI 👋\n\n¿En qué puedo ayudarte hoy?');
        console.warn('[STI Chat] No se pudo inicializar sesión correctamente, usando fallback');
      }
    } catch (error) {
      console.error('[STI Chat] Error inicializando:', error);
      hideTypingIndicator();
      // Fallback si falla la conexión
      sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      isInitialized = true;
      addMessage('bot', '¡Hola! Soy Tecnos, tu asistente técnico de STI 👋\n\n¿En qué puedo ayudarte hoy?');
    }
  }

  // ========== MOSTRAR INDICADOR "PENSANDO" ==========
  function showTypingIndicator() {
    const messagesDiv = document.getElementById('sti-messages');
    if (!messagesDiv) return;

    // Crear indicador con la palabra "PENSANDO"
    const typingDiv = document.createElement('div');
    typingDiv.id = 'sti-typing-indicator';
    typingDiv.className = 'sti-msg bot';
    typingDiv.innerHTML = `
      <div class="sti-avatar">🤖</div>
      <div class="sti-bubble">
        <div class="sti-typing">
          <span>P</span>
          <span>E</span>
          <span>N</span>
          <span>S</span>
          <span>A</span>
          <span>N</span>
          <span>D</span>
          <span>O</span>
        </div>
      </div>
    `;
    
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ========== OCULTAR INDICADOR ==========
  function hideTypingIndicator() {
    const typingDiv = document.getElementById('sti-typing-indicator');
    if (typingDiv) typingDiv.remove();
  }

  // ========== AGREGAR MENSAJE ==========
  function addMessage(type, text, buttons = null) {
    const messagesDiv = document.getElementById('sti-messages');
    if (!messagesDiv) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `sti-msg ${type}`;
    
    const avatar = type === 'bot' ? '🤖' : '👤';
    let buttonsHTML = '';
    
    if (buttons && buttons.length > 0) {
      buttonsHTML = '<div class="sti-buttons">';
      buttons.forEach(btn => {
        buttonsHTML += `<button class="sti-btn" onclick="window.stiChatSelectOption('${btn.value}')">${btn.label}</button>`;
      });
      buttonsHTML += '</div>';
    }

    msgDiv.innerHTML = `
      <div class="sti-avatar">${avatar}</div>
      <div class="sti-bubble">
        ${text.replace(/\n/g, '<br>')}
        ${buttonsHTML}
      </div>
    `;
    
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ========== ENVIAR MENSAJE ==========
  async function sendMessage(buttonToken = null, buttonLabel = null) {
    if (isProcessing) return;
    if (!isInitialized) {
      await initChat();
      return;
    }
    
    const textInput = document.getElementById('sti-text');
    if (!textInput) return;
    
    const text = textInput.value.trim();
    
    // Si es un botón, usar el token; si no, usar el texto
    const isButton = buttonToken !== null;
    const displayText = isButton ? (buttonLabel || buttonToken) : text;
    
    if (!displayText) return;

    // Agregar mensaje del usuario
    addMessage('user', displayText);
    textInput.value = '';
    isProcessing = true;

    // Mostrar "PENSANDO"
    showTypingIndicator();

    try {
      // Preparar body según si es botón o texto
      const body = {
        sessionId: sessionId,
        images: []
      };

      if (isButton) {
        // Enviar como botón
        body.action = 'button';
        body.value = buttonToken;
        body.text = buttonLabel || buttonToken; // Para contexto
      } else {
        // Enviar como texto (CORREGIDO: usar 'text' en lugar de 'message')
        body.text = text;
      }

      // Headers con CSRF token si está disponible
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      // Ocultar "PENSANDO"
      hideTypingIndicator();

      if (data.reply) {
        // CORREGIDO: usar 'options' en lugar de 'buttons'
        // El servidor devuelve 'options' como array de tokens
        let buttons = null;
        if (data.options && Array.isArray(data.options)) {
          buttons = tokensToButtons(data.options);
        } else if (data.buttons && Array.isArray(data.buttons)) {
          // Fallback: si viene 'buttons', intentar procesarlo
          buttons = data.buttons.map(b => {
            if (typeof b === 'string') {
              return { label: getButtonLabel(b), value: b };
            }
            return { label: b.label || b.text || b.value, value: b.value || b.token };
          });
        }
        
        addMessage('bot', data.reply, buttons);
      } else {
        addMessage('bot', 'Lo siento, hubo un error. ¿Podrías intentar de nuevo?');
      }
    } catch (error) {
      console.error('[STI Chat] Error:', error);
      hideTypingIndicator();
      addMessage('bot', 'No pude conectarme al servidor. Por favor, verifica tu conexión.');
    } finally {
      isProcessing = false;
    }
  }

  // ========== SELECCIONAR OPCIÓN DE BOTÓN ==========
  window.stiChatSelectOption = function(value) {
    // value es el token del botón (ej: 'BTN_SOLVED')
    const label = getButtonLabel(value);
    sendMessage(value, label);
  };

  // ========== AUTO-INICIALIZAR ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }

})();
