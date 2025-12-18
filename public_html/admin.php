<?php
$apiBase = getenv('CHAT_API_BASE') ?: '/api';
$defaultToken = getenv('LOG_TOKEN') ?: '';
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>STI Admin · Historial de Conversaciones</title>
  <style>
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #0a1f33;
      color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    header {
      padding: 16px 24px;
      background: #102a44;
      border-bottom: 1px solid #1c3b5e;
    }
    header h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.5px;
    }
    main {
      padding: 24px;
    }
    .panel {
      background: #112a43;
      border: 1px solid #1f3e60;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 4px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #1f3e60;
      background: #0b2239;
      color: #f5f5f5;
      margin-bottom: 12px;
    }
    button {
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      background: #1f8efa;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
    }
    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid #1c3a59;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #0f253f;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      background: #0c3f6b;
      margin-right: 4px;
    }
    .violations {
      color: #ffb347;
      font-weight: 600;
    }
    .buttons-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .buttons-list span {
      background: #13385a;
      border-radius: 4px;
      padding: 2px 6px;
    }
    pre {
      background: #0b1d2f;
      border-radius: 6px;
      padding: 10px;
      overflow: auto;
    }
    .status-ok {
      color: #5ce65c;
      font-weight: 600;
    }
    .status-error {
      color: #ffa3a3;
      font-weight: 600;
    }
    .chat-message {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
      border-left: 4px solid;
    }
    .chat-message.user {
      background: #0f2a44;
      border-left-color: #1f8efa;
      margin-left: 20%;
    }
    .chat-message.bot {
      background: #0b1d2f;
      border-left-color: #5ce65c;
      margin-right: 20%;
    }
    .chat-message.system {
      background: #1a1a2e;
      border-left-color: #ffb347;
      font-size: 12px;
      font-style: italic;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
      opacity: 0.7;
    }
    .message-role {
      font-weight: 600;
      text-transform: uppercase;
    }
    .message-stage {
      background: #13385a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
    .message-text {
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message-empty {
      color: #ffa3a3;
      font-style: italic;
    }
    .message-buttons {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #1c3a59;
    }
    .button-item {
      display: inline-block;
      background: #13385a;
      border: 1px solid #1f3e60;
      border-radius: 6px;
      padding: 8px 12px;
      margin: 4px;
      cursor: default;
    }
    .button-item .button-label {
      font-weight: 600;
    }
    .button-item .button-token {
      font-size: 11px;
      opacity: 0.6;
      margin-left: 8px;
    }
    .timestamp {
      font-size: 11px;
      opacity: 0.6;
    }
    #chatTimeline {
      padding: 8px;
    }
  </style>
</head>
<body>
  <header>
    <h1>🔎 STI Admin · Historial de Conversaciones</h1>
  </header>
  <main>
    <section class="panel">
      <form id="sessionForm">
        <label for="sessionId">SessionId / ConversationId</label>
        <input id="sessionId" name="sessionId" type="text" placeholder="ej: web-lp9x2m4k" required />

        <label for="adminToken">Token (LOG_TOKEN)</label>
        <input id="adminToken" name="adminToken" type="password" placeholder="Token para /api/historial" value="<?php echo htmlspecialchars($defaultToken, ENT_QUOTES); ?>" />

        <label for="apiBase">API Base</label>
        <input id="apiBase" name="apiBase" type="text" value="<?php echo htmlspecialchars($apiBase, ENT_QUOTES); ?>" />

        <button type="submit">Cargar historial</button>
      </form>
      <p id="statusMessage"></p>
    </section>

    <section class="panel" id="historialPanel" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Historial de Conversación</h2>
        <div>
          <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="toggleDebug" />
            <span>Vista Debug (JSON)</span>
          </label>
          <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; margin-left: 16px;">
            <input type="checkbox" id="toggleRaw" />
            <span>Vista Cruda</span>
          </label>
        </div>
      </div>
      
      <div id="conversationIdHeader" style="margin-bottom: 16px; padding: 12px; background: #0b2239; border-radius: 6px; border: 1px solid #1f3e60;">
        <strong>🆔 ID de Conversación:</strong> <span id="conversationIdValue">-</span>
      </div>
      
      <div id="chatTimeline" style="max-height: 600px; overflow-y: auto;">
        <p>Esperando datos…</p>
      </div>
      
      <div id="metadataSection" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #1c3a59;">
        <h3>Metadata</h3>
        <div id="metadataContent"></div>
      </div>
    </section>

    <section class="panel" id="rawDataPanel" style="display: none;">
      <h2>Datos Crudos (JSON)</h2>
      <pre id="conversationDump" style="max-height: 500px; overflow-y: auto;">Sin datos</pre>
    </section>
  </main>

  <script>
    const form = document.getElementById('sessionForm');
    const statusMessage = document.getElementById('statusMessage');
    const conversationDump = document.getElementById('conversationDump');
    const chatTimeline = document.getElementById('chatTimeline');
    const historialPanel = document.getElementById('historialPanel');
    const rawDataPanel = document.getElementById('rawDataPanel');
    const conversationIdValue = document.getElementById('conversationIdValue');
    const metadataContent = document.getElementById('metadataContent');
    const toggleDebug = document.getElementById('toggleDebug');
    const toggleRaw = document.getElementById('toggleRaw');

    function setStatus(text, isError = false) {
      statusMessage.textContent = text;
      statusMessage.className = isError ? 'status-error' : 'status-ok';
    }

    function formatTimestamp(timestamp) {
      if (!timestamp) return 'Sin fecha';
      try {
        const date = new Date(timestamp);
        return date.toLocaleString('es-AR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch (e) {
        return timestamp;
      }
    }

    function getStageFromEvent(event, currentStage = null) {
      // Si es evento STAGE_CHANGED, usar el stage "to"
      if (event.name === 'STAGE_CHANGED' && event.payload && event.payload.to) {
        return event.payload.to;
      }
      // Si tiene stage en payload
      if (event.payload && event.payload.stage) {
        return event.payload.stage;
      }
      // Usar stage actual como fallback
      return currentStage || 'unknown';
    }

    function renderMessage(event, index, allEvents, currentStage = 'unknown', nextButtons = null) {
      const role = event.role || 'system';
      const timestamp = formatTimestamp(event.t);
      const stage = getStageFromEvent(event, currentStage);
      
      let messageClass = role;
      let roleLabel = role.toUpperCase();
      
      if (role === 'user') {
        roleLabel = '👤 USUARIO';
      } else if (role === 'bot') {
        roleLabel = '🤖 BOT';
      } else {
        roleLabel = '⚙️ SISTEMA';
      }

      let textContent = '';
      let buttonsHtml = '';

      if (event.type === 'text') {
        textContent = event.text || event.reply || '';
        if (!textContent || textContent.trim().length === 0) {
          textContent = '<span class="message-empty">[MENSAJE VACÍO]</span>';
        }
        // Si hay botones del siguiente evento, agregarlos aquí
        if (nextButtons && Array.isArray(nextButtons) && nextButtons.length > 0) {
          buttonsHtml = '<div class="message-buttons"><strong>Botones presentados:</strong><div>';
          nextButtons.forEach(btn => {
            const label = btn.label || btn.value || 'Sin etiqueta';
            const token = btn.token ? `<span class="button-token">(${btn.token})</span>` : '';
            buttonsHtml += `<div class="button-item"><span class="button-label">${label}</span>${token}</div>`;
          });
          buttonsHtml += '</div></div>';
        }
      } else if (event.type === 'buttons') {
        // Si es evento de botones, buscar texto del bot anterior
        for (let i = index - 1; i >= 0; i--) {
          if (allEvents[i].role === 'bot' && allEvents[i].type === 'text' && allEvents[i].text) {
            textContent = allEvents[i].text;
            break;
          }
        }
        if (!textContent) {
          textContent = '<span class="message-empty">[Botones sin mensaje asociado]</span>';
        }
        // Renderizar botones
        if (event.buttons && Array.isArray(event.buttons) && event.buttons.length > 0) {
          buttonsHtml = '<div class="message-buttons"><strong>Botones presentados:</strong><div>';
          event.buttons.forEach(btn => {
            const label = btn.label || btn.value || 'Sin etiqueta';
            const token = btn.token ? `<span class="button-token">(${btn.token})</span>` : '';
            buttonsHtml += `<div class="button-item"><span class="button-label">${label}</span>${token}</div>`;
          });
          buttonsHtml += '</div></div>';
        }
      } else if (event.type === 'button') {
        // Input del usuario desde botón
        textContent = event.label || event.value || '[Botón seleccionado]';
      } else if (event.type === 'event') {
        // Eventos del sistema
        if (event.name === 'STAGE_CHANGED') {
          textContent = `Cambio de stage: ${event.payload?.from || 'unknown'} → ${event.payload?.to || 'unknown'}`;
        } else if (event.name === 'IA_CLASSIFIER_CALL') {
          textContent = '🔍 Llamada a clasificador de IA';
        } else if (event.name === 'IA_CLASSIFIER_RESULT') {
          textContent = `Resultado clasificador: ${event.payload?.intent || 'unknown'}`;
        } else {
          textContent = `Evento: ${event.name || 'unknown'}`;
        }
      } else if (event.type === 'image') {
        textContent = '📷 [Imagen enviada]';
      }

      // Si es el primer mensaje del bot, agregar ID de conversación
      let idInMessage = '';
      const conversationId = document.getElementById('conversationIdValue').textContent;
      if (role === 'bot' && conversationId && conversationId !== '-') {
        // Buscar si es el primer mensaje del bot
        const isFirstBotMessage = !allEvents.slice(0, index).some(e => e.role === 'bot');
        if (isFirstBotMessage) {
          idInMessage = `<div style="margin-top: 8px; padding: 8px; background: #13385a; border-radius: 4px; font-weight: 600; border: 1px solid #1f8efa;">🆔 ID de la conversación: ${conversationId}</div>`;
        }
      }

      return `
        <div class="chat-message ${messageClass}">
          <div class="message-header">
            <span class="message-role">${roleLabel}</span>
            <div>
              <span class="message-stage">${stage}</span>
              <span class="timestamp" style="margin-left: 8px;">${timestamp}</span>
            </div>
          </div>
          <div class="message-text">${textContent}${idInMessage}</div>
          ${buttonsHtml}
        </div>
      `;
    }

    function renderChatTimeline(historial) {
      const transcript = historial.transcript || [];
      
      if (transcript.length === 0) {
        chatTimeline.innerHTML = '<p>No hay mensajes en el transcript.</p>';
        return;
      }

      // Determinar stage inicial y final
      let stageInicial = 'unknown';
      let stageFinal = 'unknown';
      
      for (const event of transcript) {
        if (event.name === 'STAGE_CHANGED' && event.payload) {
          if (stageInicial === 'unknown' && event.payload.from) {
            stageInicial = event.payload.from;
          }
          if (event.payload.to) {
            stageFinal = event.payload.to;
          }
        }
      }

      // Si no hay STAGE_CHANGED, intentar inferir del primer/last mensaje del bot
      if (stageInicial === 'unknown') {
        const firstBotMessage = transcript.find(e => e.role === 'bot');
        if (firstBotMessage && firstBotMessage.payload && firstBotMessage.payload.stage) {
          stageInicial = firstBotMessage.payload.stage;
        }
      }

      let html = '';
      let currentStage = stageInicial;

      transcript.forEach((event, index) => {
        // Actualizar stage actual si hay cambio
        if (event.name === 'STAGE_CHANGED' && event.payload && event.payload.to) {
          currentStage = event.payload.to;
        }
        
        // Si es evento de botones y el anterior ya fue procesado, saltarlo
        if (event.type === 'buttons' && index > 0 && transcript[index - 1].role === 'bot' && transcript[index - 1].type === 'text') {
          // Los botones ya se incluyeron en el mensaje anterior, saltar este evento
          return; // continue en forEach
        }
        
        // Verificar si el siguiente evento es de botones para incluirlos en este mensaje
        let nextEventButtons = null;
        if (index < transcript.length - 1 && transcript[index + 1].type === 'buttons' && transcript[index + 1].role === 'bot') {
          nextEventButtons = transcript[index + 1].buttons;
        }
        
        // Renderizar mensaje, pasando botones del siguiente evento si aplica
        const messageHtml = renderMessage(event, index, transcript, currentStage, nextEventButtons);
        if (messageHtml && messageHtml.trim()) {
          html += messageHtml;
        }
      });

      chatTimeline.innerHTML = html;

      // Actualizar metadata
      const metadata = {
        'ID de Conversación': historial.conversation_id || 'N/A',
        'Stage Inicial': stageInicial,
        'Stage Final': stageFinal,
        'Total Mensajes': transcript.length,
        'Mensajes Usuario': transcript.filter(e => e.role === 'user').length,
        'Mensajes Bot': transcript.filter(e => e.role === 'bot').length,
        'Eventos Sistema': transcript.filter(e => e.role === 'system').length,
        'Fecha Creación': formatTimestamp(historial.created_at),
        'Última Actualización': formatTimestamp(historial.updated_at),
        'Idioma': historial.language || 'N/A',
        'Estado': historial.status || 'N/A'
      };

      metadataContent.innerHTML = Object.entries(metadata).map(([key, value]) => 
        `<div style="margin-bottom: 8px;"><strong>${key}:</strong> ${value}</div>`
      ).join('');
    }

    async function fetchHistorial(sessionId, token, apiBase) {
      const url = `${apiBase.replace(/\/$/, '')}/historial/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }
      return response.json();
    }

    // Toggle para vista debug
    toggleDebug.addEventListener('change', (e) => {
      if (e.target.checked) {
        chatTimeline.style.display = 'none';
        metadataContent.style.display = 'none';
      } else {
        chatTimeline.style.display = 'block';
        metadataContent.style.display = 'block';
      }
    });

    // Toggle para vista cruda
    toggleRaw.addEventListener('change', (e) => {
      rawDataPanel.style.display = e.target.checked ? 'block' : 'none';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const sessionId = document.getElementById('sessionId').value.trim();
      const token = document.getElementById('adminToken').value.trim();
      const apiBase = document.getElementById('apiBase').value.trim() || '/api';

      if (!sessionId) {
        setStatus('Ingresá un sessionId', true);
        return;
      }

      setStatus('Cargando...', false);
      chatTimeline.innerHTML = '<p>Cargando…</p>';
      conversationDump.textContent = 'Cargando…';
      historialPanel.style.display = 'none';
      rawDataPanel.style.display = 'none';

      try {
        const data = await fetchHistorial(sessionId, token, apiBase);
        if (!data.ok) {
          throw new Error(data.error || 'Respuesta inválida');
        }
        
        const historial = data.historial || {};
        
        // Mostrar ID de conversación
        conversationIdValue.textContent = historial.conversation_id || sessionId;
        
        // Renderizar timeline
        renderChatTimeline(historial);
        
        // Mostrar datos crudos
        conversationDump.textContent = JSON.stringify(historial, null, 2);
        
        // Mostrar paneles
        historialPanel.style.display = 'block';
        if (toggleRaw.checked) {
          rawDataPanel.style.display = 'block';
        }
        
        const transcriptLength = (historial.transcript || []).length;
        setStatus(`Cargado: ${transcriptLength} mensajes en el transcript`, false);
      } catch (error) {
        console.error('[admin.php] Error al cargar historial:', error);
        setStatus(`Error: ${error.message}`, true);
        chatTimeline.innerHTML = '<p>Error al cargar historial.</p>';
        conversationDump.textContent = 'Sin datos';
      }
    });
  </script>
</body>
</html>
