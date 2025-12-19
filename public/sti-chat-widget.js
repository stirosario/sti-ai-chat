/**
 * STI Chat Widget - Standalone
 * Widget embebible del chat de STI con efecto "PENSANDO"
 * 
 * VERSIÓN: 2.0.0
 * 
 * Para usar con cache busting, carga así:
 * <script src="sti-chat-widget.js?v=2.0.0"></script>
 * <link rel="stylesheet" href="sti-chat.css?v=2.0.0">
 */

(function() {
  'use strict';

  // ========== CONFIGURACIÓN ==========
  const API_URL = 'https://sti-rosario-ai.onrender.com/api';
  const WIDGET_VERSION = '2.0.0'; // Para cache busting - Actualizar en cada release
  const LOG_PREFIX = '[STI-CHAT]';
  let sessionId = null;
  let isProcessing = false;
  let selectedImageBase64 = null;

  function logInfo(message, data) {
    console.info(`${LOG_PREFIX} ${message}`, data || '');
  }
  function logWarn(message, data) {
    console.warn(`${LOG_PREFIX} ${message}`, data || '');
  }
  function logError(message, data) {
    console.error(`${LOG_PREFIX} ${message}`, data || '');
  }

  // ========== INICIALIZACIÓN ==========
  function initChat() {
    // Generar sessionId única
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    logInfo('Init chat widget', { sessionId, version: WIDGET_VERSION });
    
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
    if (attachBtn) {
      attachBtn.addEventListener('click', handleAttachClick);
      // Crear input file oculto
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      fileInput.id = 'sti-file-input';
      fileInput.addEventListener('change', handleFileSelect);
      document.body.appendChild(fileInput);
    }
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
    const roleLabel = type === 'bot' ? 'Bot' : 'User';
    const prefixedText = `${roleLabel}: ${text}`;
    let buttonsHTML = '';
    
    if (buttons && buttons.length > 0) {
      buttonsHTML = '<div class="sti-buttons">';
      buttons.forEach(btn => {
        // Priorizar label, luego text, luego value, luego token
        const label = btn.label || btn.text || btn.value || btn.token || 'Opción';
        const value = btn.value || btn.token || btn.text || label;
        // Escapar comillas para evitar problemas en onclick
        const safeValue = String(value).replace(/'/g, "\\'");
        const safeLabel = String(label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        buttonsHTML += `<button class="sti-btn" onclick="window.stiChatSelectOption('${safeValue}')">${safeLabel}</button>`;
      });
      buttonsHTML += '</div>';
    }

    msgDiv.innerHTML = `
      <div class="sti-avatar">${avatar}</div>
      <div class="sti-bubble">
        ${prefixedText.replace(/\n/g, '<br>')}
        ${buttonsHTML}
      </div>
    `;
    
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ========== MANEJAR CLICK EN BOTÓN ADJUNTAR ==========
  function handleAttachClick() {
    const fileInput = document.getElementById('sti-file-input');
    if (fileInput) {
      logInfo('Attach button clicked');
      fileInput.click();
    }
  }

  // ========== MANEJAR SELECCIÓN DE ARCHIVO ==========
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tipo MIME
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona solo archivos de imagen (JPG, PNG, GIF, etc.)');
      event.target.value = '';
      return;
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('La imagen es demasiado grande. Por favor, selecciona una imagen menor a 5MB.');
      event.target.value = '';
      return;
    }

    // Convertir a base64
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedImageBase64 = e.target.result;
      logInfo('Imagen seleccionada', { size: file.size, type: file.type });
      
      // Mostrar preview y habilitar botón
      const attachBtn = document.getElementById('sti-attach-btn');
      if (attachBtn) {
        attachBtn.classList.add('enabled');
        attachBtn.title = 'Imagen seleccionada. Haz clic para enviar.';
        // Mostrar indicador visual
        const preview = document.createElement('div');
        preview.id = 'sti-image-preview';
        preview.style.cssText = 'position: fixed; bottom: 80px; right: 20px; background: white; border: 2px solid #10b981; border-radius: 8px; padding: 8px; max-width: 150px; z-index: 10000;';
        preview.innerHTML = `
          <img src="${selectedImageBase64}" style="max-width: 100%; height: auto; border-radius: 4px;" />
          <div style="margin-top: 4px; font-size: 12px; color: #10b981;">✓ Imagen lista</div>
        `;
        document.body.appendChild(preview);
      }
    };
    reader.onerror = () => {
      alert('Error al leer el archivo. Por favor, intenta de nuevo.');
      logError('Error leyendo archivo seleccionado');
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  // ========== ENVIAR MENSAJE ==========
  async function sendMessage() {
    if (isProcessing) return;
    
    const textInput = document.getElementById('sti-text');
    if (!textInput) return;
    
    const text = textInput.value.trim();
    if (!text && !selectedImageBase64) return;

    // Agregar mensaje del usuario (con preview de imagen si hay)
    let userMessage = text;
    if (selectedImageBase64) {
      userMessage = text ? text + ' [Imagen adjunta]' : '[Imagen adjunta]';
    }
    addMessage('user', userMessage);
    textInput.value = '';
    isProcessing = true;

    // Limpiar preview de imagen
    const preview = document.getElementById('sti-image-preview');
    if (preview) preview.remove();
    const attachBtn = document.getElementById('sti-attach-btn');
    if (attachBtn) {
      attachBtn.classList.remove('enabled');
      attachBtn.title = 'Adjuntar imagen';
    }

    // Mostrar "PENSANDO"
    showTypingIndicator();
    logInfo('Enviando mensaje', { sessionId, hasImage: !!selectedImageBase64, textLength: text.length });

    try {
      const requestBody = {
        sessionId: sessionId,
        message: text || '',
        request_id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Agregar imageBase64 si hay imagen seleccionada
      if (selectedImageBase64) {
        requestBody.imageBase64 = selectedImageBase64;
        // Extraer solo la parte base64 (sin el prefijo data:image/...;base64,)
        if (requestBody.imageBase64.includes(',')) {
          requestBody.imageBase64 = requestBody.imageBase64.split(',')[1];
        }
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      logInfo('Respuesta recibida', { status: response.status, ok: data.ok, stage: data.stage, buttons: data.buttons?.length || 0 });
      
      // Ocultar "PENSANDO"
      hideTypingIndicator();

      // Limpiar imagen seleccionada
      selectedImageBase64 = null;
      const fileInput = document.getElementById('sti-file-input');
      if (fileInput) fileInput.value = '';

      // Manejar respuesta
      if (data.ok === false) {
        // Error del servidor
        addMessage('bot', data.error || 'Lo siento, hubo un error. ¿Podrías intentar de nuevo?');
        logWarn('Respuesta con error del servidor', { status: response.status, error: data.error });
      } else if (data.reply) {
        addMessage('bot', data.reply, data.buttons || null);
      } else {
        addMessage('bot', 'Lo siento, hubo un error. ¿Podrías intentar de nuevo?');
      }
    } catch (error) {
      logError('Error en envío', { message: error?.message });
      hideTypingIndicator();
      addMessage('bot', 'No pude conectarme al servidor. Por favor, verifica tu conexión.');
      // Restaurar imagen si hubo error
      selectedImageBase64 = null;
    } finally {
      isProcessing = false;
    }
  }

  // ========== SELECCIONAR OPCIÓN DE BOTÓN ==========
  window.stiChatSelectOption = function(value) {
    const textInput = document.getElementById('sti-text');
    if (textInput) {
      logInfo('Botón seleccionado', { value });
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
