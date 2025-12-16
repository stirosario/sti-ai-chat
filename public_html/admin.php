<?php
$apiBase = getenv('CHAT_API_BASE') ?: '/api';
$defaultToken = getenv('LOG_TOKEN') ?: '';
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>STI Admin · Timeline por Turnos</title>
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
  </style>
</head>
<body>
  <header>
    <h1>🔎 STI · Admin Timeline</h1>
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

    <section class="panel">
      <h2>Timeline por Turnos</h2>
      <table id="timelineTable">
        <thead>
          <tr>
            <th>#</th>
            <th>Stage (before → after)</th>
            <th>Evento usuario</th>
            <th>Respuesta bot</th>
            <th>Botones mostrados (count)</th>
            <th>Reason / Violations</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="6">Esperando datos…</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Conversación (fallback)</h2>
      <pre id="conversationDump">Sin datos</pre>
    </section>
  </main>

  <script>
    const form = document.getElementById('sessionForm');
    const tableBody = document.querySelector('#timelineTable tbody');
    const statusMessage = document.getElementById('statusMessage');
    const conversationDump = document.getElementById('conversationDump');

    function setStatus(text, isError = false) {
      statusMessage.textContent = text;
      statusMessage.className = isError ? 'status-error' : 'status-ok';
    }

    function formatUserEvent(event = {}) {
      if (event.type === 'button') {
        return `[BTN] ${event.label || event.token || 'token'}`;
      }
      return event.normalized || event.rawText || '(texto vacío)';
    }

    function renderButtons(buttons = []) {
      if (!buttons.length) {
        return '<span class="badge">0 botones</span>';
      }
      const tags = buttons.map(btn => {
        const label = btn.label || btn.token || 'BTN';
        const token = btn.token ? ` (${btn.token})` : '';
        return `<span>${label}${token}</span>`;
      }).join('');
      return `<div class="buttons-list">${tags}</div>`;
    }

    function renderViolations(list = []) {
      if (!Array.isArray(list) || !list.length) {
        return '';
      }
      return `<div class="violations">${list.map(v => v.code || 'violation').join(', ')}</div>`;
    }

    function renderTimeline(turns = []) {
      if (!turns.length) {
        tableBody.innerHTML = '<tr><td colspan="6">Sin turnos para esta sesión.</td></tr>';
        return;
      }

      tableBody.innerHTML = turns.map((turn, idx) => {
        const buttonsHtml = renderButtons(turn.buttons_shown || []);
        const violations = renderViolations(turn.violations);
        const reason = turn.reason ? `<div class="badge">${turn.reason}</div>` : '';
        const stageBefore = turn.stage_before || 'UNKNOWN';
        const stageAfter = turn.stage_after || stageBefore;

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${stageBefore} → <strong>${stageAfter}</strong></td>
            <td>${formatUserEvent(turn.user_event)}</td>
            <td>${turn.bot_reply || '(sin respuesta)'}</td>
            <td>${buttonsHtml}</td>
            <td>${reason}${violations}</td>
          </tr>
        `;
      }).join('');
    }

    async function fetchHistorial(sessionId, token, apiBase) {
      const url = `${apiBase.replace(/\\/$/, '')}/historial/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`);
      }
      return response.json();
    }

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
      tableBody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
      conversationDump.textContent = 'Cargando…';

      try {
        const data = await fetchHistorial(sessionId, token, apiBase);
        if (!data.ok) {
          throw new Error(data.error || 'Respuesta inválida');
        }
        const historial = data.historial || {};
        const turns = historial.turnLogs || historial.turn_logs || [];
        renderTimeline(turns);

        if (historial.conversacion) {
          conversationDump.textContent = JSON.stringify(historial.conversacion, null, 2);
        } else {
          conversationDump.textContent = 'Sin conversación legacy disponible.';
        }
        setStatus(`Cargado ${turns.length} turnos`, false);
      } catch (error) {
        console.error('[admin.php] Error al cargar historial:', error);
        setStatus(`Error: ${error.message}`, true);
        tableBody.innerHTML = '<tr><td colspan="6">Error al cargar timeline.</td></tr>';
        conversationDump.textContent = 'Sin datos';
      }
    });
  </script>
</body>
</html>
