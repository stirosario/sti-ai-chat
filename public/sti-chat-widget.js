/**
 * STI Chat Widget - Standalone
 * Widget embebible del chat de STI con efecto "PENSANDO"
 */

(function() {
  'use strict';

  // ========== CONFIGURACIÓN ==========
  const API_URL = 'https://sti-rosario-ai.onrender.com/api';
  let sessionId = null;
  let isProcessing = false;

  // ========== INICIALIZACIÓN ==========
  function initChat() {
    // Generar sessionId única
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
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

    // Mensaje de bienvenida
    addMessage('bot', '¡Hola! Soy Tecnos, tu asistente técnico de STI 👋\n\n¿En qué puedo ayudarte hoy?');
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
        const label = btn.label || btn.text || btn.token || btn.value || 'Opción';
        const value = btn.value || btn.token || btn.text || label;
        buttonsHTML += `<button class="sti-btn" onclick="window.stiChatSelectOption('${value}')">${label}</button>`;
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
  async function sendMessage() {
    if (isProcessing) return;
    
    const textInput = document.getElementById('sti-text');
    if (!textInput) return;
    
    const text = textInput.value.trim();
    if (!text) return;

    // Agregar mensaje del usuario
    addMessage('user', text);
    textInput.value = '';
    isProcessing = true;

    // Mostrar "PENSANDO"
    showTypingIndicator();

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          message: text,
          imageUrls: []
        })
      });

      const data = await response.json();
      
      // Ocultar "PENSANDO"
      hideTypingIndicator();

      if (data.reply) {
        addMessage('bot', data.reply, data.buttons || null);
      } else {
        addMessage('bot', 'Lo siento, hubo un error. ¿Podrías intentar de nuevo?');
      }
    } catch (error) {
      console.error('Error:', error);
      hideTypingIndicator();
      addMessage('bot', 'No pude conectarme al servidor. Por favor, verifica tu conexión.');
    } finally {
      isProcessing = false;
    }
  }

  // ========== SELECCIONAR OPCIÓN DE BOTÓN ==========
  window.stiChatSelectOption = function(value) {
    const textInput = document.getElementById('sti-text');
    if (textInput) {
      textInput.value = value;
      sendMessage();
    }
  };

  // ========== AUTO-INICIALIZAR ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }

})();
