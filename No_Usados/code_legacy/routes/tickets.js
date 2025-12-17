/**
 * routes/tickets.js
 * Rutas para manejo de tickets
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { maskPII } from '../flowLogger.js';
import { createTicket, generateWhatsAppLink, getTicket, getTicketPublicUrl, listTickets, updateTicketStatus } from '../ticketing.js';
import { validateCSRF } from '../utils/security.js';

const router = express.Router();

// Helper para escapar HTML
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

// Obtener directorio de tickets desde env o usar default
function getTicketsDir() {
  return process.env.TICKETS_DIR || path.join(process.env.DATA_BASE || './data', 'tickets');
}

// GET /api/ticket/:tid - Obtener ticket (JSON o HTML según Accept header)
router.get('/api/ticket/:tid', async (req, res) => {
  const tid = String(req.params.tid || '').replace(/[^A-Za-z0-9._-]/g, '');
  const TICKETS_DIR = getTicketsDir();
  const jsonFile = path.join(TICKETS_DIR, `${tid}.json`);
  const txtFile = path.join(TICKETS_DIR, `${tid}.txt`);

  try {
    await fs.promises.access(txtFile);
  } catch (e) {
    try {
      await fs.promises.access(jsonFile);
    } catch (e2) {
      return res.status(404).json({ ok: false, error: 'Ticket no encontrado' });
    }
  }

  console.log(`[TICKET] Public access granted: ticket=${tid}`);

  const raw = await fs.promises.readFile(txtFile, 'utf8');
  const maskedRaw = maskPII(raw);

  // parse lines into messages
  const lines = maskedRaw.split(/\r?\n/);
  const messages = [];
  for (const ln of lines) {
    if (!ln || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (m) {
      messages.push({ ts: m[1], who: String(m[2]).trim(), text: String(m[3]).trim() });
    } else {
      messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
  }

  // ✅ DETECTAR SI ES PETICIÓN DE NAVEGADOR (HTML) O API (JSON)
  const acceptHeader = req.headers.accept || '';
  const isBrowserRequest = acceptHeader.includes('text/html') || 
                          (!acceptHeader.includes('application/json') && 
                           req.headers['user-agent'] && 
                           !req.headers['user-agent'].includes('curl') &&
                           !req.headers['user-agent'].includes('Postman'));

  // Si es petición de navegador, devolver HTML formateado
  if (isBrowserRequest) {
    // Extraer información del ticket (código simplificado - usar el mismo que está en server.js)
    let ticketName = null;
    let ticketDate = null;
    let ticketDevice = null;
    let ticketSession = null;
    let ticketLanguage = null;
    let ticketProblem = null;
    let ticketSteps = null;
    let inProblemSection = false;
    let inStepsSection = false;
    const stepsLines = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.who === 'system') {
        const text = msg.text;
        if (text.includes('Cliente:')) {
          ticketName = text.replace(/Cliente:\s*/i, '').trim();
        } else if (text.includes('Generado:')) {
          ticketDate = text.replace(/Generado:\s*/i, '').trim();
        } else if (text.includes('Equipo:')) {
          ticketDevice = text.replace(/Equipo:\s*/i, '').trim();
        } else if (text.includes('Sesión:')) {
          ticketSession = text.replace(/Sesión:\s*/i, '').trim();
        } else if (text.includes('Idioma:')) {
          ticketLanguage = text.replace(/Idioma:\s*/i, '').trim();
        } else if (text === '=== RESUMEN DEL PROBLEMA ===') {
          inProblemSection = true;
          inStepsSection = false;
        } else if (text === '=== PASOS PROBADOS / ESTADO ===') {
          inProblemSection = false;
          inStepsSection = true;
        } else if (text === '=== HISTORIAL DE CONVERSACIÓN ===') {
          inProblemSection = false;
          inStepsSection = false;
        } else if (inProblemSection && !text.includes('===')) {
          if (!ticketProblem && text.trim() && !text.includes('sin descripción')) {
            ticketProblem = text.trim();
          }
        } else if (inStepsSection && !text.includes('===')) {
          if (text.trim() && !text.includes('aún sin pasos') && !text.includes('no se pudieron')) {
            stepsLines.push(text.trim());
          }
        }
      }
    }
    
    if (stepsLines.length > 0) {
      ticketSteps = stepsLines.join('\n');
    } else if (!ticketSteps) {
      ticketSteps = '(aún sin pasos registrados)';
    }

    // Generar HTML del chat (código simplificado)
    const chatLines = messages.map(msg => {
      if (msg.who === 'system') {
        if (msg.text.includes('STI • Ticket') || 
            msg.text.includes('Generado:') || 
            msg.text.includes('Cliente:') || 
            msg.text.includes('Equipo:') || 
            msg.text.includes('Sesión:') || 
            msg.text.includes('Idioma:') ||
            msg.text === '=== RESUMEN DEL PROBLEMA ===' ||
            msg.text === '=== PASOS PROBADOS / ESTADO ===' ||
            msg.text === '=== HISTORIAL DE CONVERSACIÓN ===' ||
            msg.text === ticketProblem ||
            msg.text === '(aún sin pasos registrados)') {
          return '';
        }
        if (stepsLines.length > 0 && stepsLines.includes(msg.text.trim())) {
          return '';
        }
        return `<div class="sys-msg">${escapeHtml(msg.text)}</div>`;
      }
      
      const side = (msg.who === 'user' || msg.who === 'usuario' || msg.who.toLowerCase().includes('user')) ? 'user' : 'bot';
      const whoLabel = side === 'user' ? 'Usuario' : 'Tecnos';
      const ts = msg.ts ? `<div class="msg-ts">${escapeHtml(msg.ts)}</div>` : '';
      
      let processedText = escapeHtml(msg.text);
      processedText = processedText.replace(/\[BTN\]\s*(.+?)(?=\n|$)/g, '<span class="btn-tag">🔘 $1</span>');
      processedText = processedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      processedText = processedText.replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      return `<div class="msg-bubble ${side}">
        <div class="msg-inner">
          <div class="msg-who">${escapeHtml(whoLabel)}</div>
          <div class="msg-text">${processedText}</div>
          ${ts}
        </div>
      </div>`;
    }).filter(html => html !== '').join('\n');

    // HTML completo (usar el mismo que está en server.js líneas 3991-4267)
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket ${escapeHtml(tid)} - STI Tecnos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .ticket-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .ticket-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
    }
    .ticket-header h1 {
      font-size: 28px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ticket-header h1::before {
      content: '🎫';
      font-size: 32px;
    }
    .ticket-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }
    .info-item {
      background: rgba(255,255,255,0.15);
      padding: 12px 16px;
      border-radius: 8px;
      backdrop-filter: blur(10px);
    }
    .info-label {
      font-size: 12px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 16px;
      font-weight: 600;
    }
    .ticket-problem {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 20px 30px;
      margin: 0;
    }
    .ticket-problem h2 {
      font-size: 18px;
      color: #856404;
      margin-bottom: 10px;
    }
    .ticket-problem .problem-text {
      font-size: 16px;
      color: #856404;
      font-weight: 500;
    }
    .ticket-steps {
      background: #e7f3ff;
      border-left: 4px solid #2196F3;
      padding: 20px 30px;
      margin: 0;
    }
    .ticket-steps h2 {
      font-size: 18px;
      color: #0d47a1;
      margin-bottom: 10px;
    }
    .ticket-steps .steps-text {
      font-size: 14px;
      color: #0d47a1;
    }
    .chat-section {
      background: #f5f7fb;
      padding: 30px;
    }
    .chat-section h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chat-section h2::before {
      content: '💬';
      font-size: 24px;
    }
    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 600px;
      overflow-y: auto;
      padding: 10px;
    }
    .msg-bubble {
      max-width: 75%;
      display: flex;
      animation: fadeIn 0.3s ease-in;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .msg-bubble.user {
      align-self: flex-end;
      justify-content: flex-end;
    }
    .msg-bubble.bot {
      align-self: flex-start;
      justify-content: flex-start;
    }
    .msg-inner {
      padding: 12px 16px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .msg-bubble.user .msg-inner {
      background: #dcf8c6;
      border-bottom-right-radius: 4px;
    }
    .msg-bubble.bot .msg-inner {
      background: #ffffff;
      border-bottom-left-radius: 4px;
      border: 1px solid #e0e0e0;
    }
    .msg-who {
      font-size: 12px;
      font-weight: 700;
      color: #666;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .msg-bubble.user .msg-who {
      color: #075e54;
    }
    .msg-bubble.bot .msg-who {
      color: #128c7e;
    }
    .msg-text {
      font-size: 15px;
      line-height: 1.5;
      color: #111;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .msg-text strong {
      font-weight: 600;
    }
    .msg-text .btn-tag {
      display: inline-block;
      background: rgba(0,0,0,0.05);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      margin: 2px;
    }
    .msg-ts {
      font-size: 11px;
      color: #999;
      margin-top: 6px;
      text-align: right;
    }
    .sys-msg {
      align-self: center;
      background: transparent;
      color: #999;
      font-size: 13px;
      font-style: italic;
      padding: 8px;
      text-align: center;
    }
    .ticket-footer {
      background: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      color: #666;
      font-size: 14px;
      border-top: 1px solid #e0e0e0;
    }
    .ticket-footer a {
      color: #667eea;
      text-decoration: none;
      margin: 0 10px;
    }
    .ticket-footer a:hover {
      text-decoration: underline;
    }
    @media (max-width: 768px) {
      .ticket-info {
        grid-template-columns: 1fr;
      }
      .msg-bubble {
        max-width: 90%;
      }
      .ticket-header, .ticket-problem, .ticket-steps, .chat-section {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="ticket-container">
    <div class="ticket-header">
      <h1>Ticket ${escapeHtml(tid)}</h1>
      <div class="ticket-info">
        ${ticketName ? `<div class="info-item">
          <div class="info-label">👤 Cliente</div>
          <div class="info-value">${escapeHtml(ticketName)}</div>
        </div>` : ''}
        ${ticketDate ? `<div class="info-item">
          <div class="info-label">📅 Fecha</div>
          <div class="info-value">${escapeHtml(ticketDate)}</div>
        </div>` : ''}
        ${ticketDevice ? `<div class="info-item">
          <div class="info-label">💻 Equipo</div>
          <div class="info-value">${escapeHtml(ticketDevice)}</div>
        </div>` : ''}
        ${ticketSession ? `<div class="info-item">
          <div class="info-label">🔑 Sesión</div>
          <div class="info-value">${escapeHtml(ticketSession)}</div>
        </div>` : ''}
        ${ticketLanguage ? `<div class="info-item">
          <div class="info-label">🌍 Idioma</div>
          <div class="info-value">${escapeHtml(ticketLanguage)}</div>
        </div>` : ''}
      </div>
    </div>
    
    ${ticketProblem ? `<div class="ticket-problem">
      <h2>⚠️ Problema Reportado</h2>
      <div class="problem-text">${escapeHtml(ticketProblem)}</div>
    </div>` : ''}
    
    ${ticketSteps && ticketSteps !== '(aún sin pasos registrados)' ? `<div class="ticket-steps">
      <h2>🔧 Pasos Probados</h2>
      <div class="steps-text">${escapeHtml(ticketSteps).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
    
    <div class="chat-section">
      <h2>Historial de Conversación</h2>
      <div class="chat-messages">
        ${chatLines}
      </div>
    </div>
    
    <div class="ticket-footer">
      <a href="/api/ticket/${encodeURIComponent(tid)}?format=json" target="_blank">Ver JSON</a>
      <span>•</span>
      <a href="/ticket/${encodeURIComponent(tid)}" target="_blank">Vista Alternativa</a>
    </div>
  </div>
</body>
</html>`;

    return res.send(html);
  }

  // Si es petición de API, devolver JSON
  res.json({ ok: true, ticketId: tid, content: maskedRaw, messages });
});

// GET /ticket/:tid - Vista alternativa (legacy)
router.get('/ticket/:tid', async (req, res) => {
  const tid = String(req.params.tid || '').replace(/[^A-Za-z0-9._-]/g, '');
  const TICKETS_DIR = getTicketsDir();
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  
  try {
    await fs.promises.access(file);
  } catch (e) {
    return res.status(404).send('ticket no encontrado');
  }

  const raw = await fs.promises.readFile(file, 'utf8');
  const safeRaw = escapeHtml(raw);

  const lines = raw.split(/\r?\n/);
  const messages = [];
  for (const ln of lines) {
    if (!ln || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (m) {
      messages.push({ ts: m[1], who: String(m[2]).trim().toLowerCase(), text: String(m[3]).trim() });
    } else {
      messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
  }

  const chatLines = messages.map(msg => {
    if (msg.who === 'system') {
      return `<div class="sys">${escapeHtml(msg.text)}</div>`;
    }
    const side = (msg.who === 'user' || msg.who === 'usuario') ? 'user' : 'bot';
    const whoLabel = side === 'user' ? 'Vos' : 'Tecnos';
    const ts = msg.ts ? `<div class="ts">${escapeHtml(msg.ts)}</div>` : '';
    return `<div class="bubble ${side}">
      <div class="bubble-inner">
        <div class="who">${escapeHtml(whoLabel)}</div>
        <div class="txt">${escapeHtml(msg.text)}</div>
        ${ts}
      </div>
    </div>`;
  }).join('\n');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Ticket ${escapeHtml(tid)} — Conversación</title>
      <style>
      :root{--bg:#f5f7fb;--bot:#ffffff;--user:#dcf8c6;--accent:#0b7cff;--muted:#777;}
      body{font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial; margin:12px; background:var(--bg); color:#222;}
      .controls{display:flex;gap:12px;align-items:center;margin-bottom:10px;}
      .btn{background:var(--accent);color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none;}
      .chat-wrap{max-width:860px;margin:0 auto;background:transparent;padding:8px;}
      .chat{background:transparent;padding:10px;display:flex;flex-direction:column;gap:10px;}
      .bubble{max-width:78%;display:flex;}
      .bubble.user{align-self:flex-end;justify-content:flex-end;}
      .bubble.bot{align-self:flex-start;justify-content:flex-start;}
      .bubble-inner{background:var(--bot);padding:10px 12px;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,0.05);}
      .bubble.user .bubble-inner{background:var(--user);border-radius:12px;}
      .bubble .who{font-weight:700;font-size:13px;margin-bottom:6px;color:#111;}
      .bubble .txt{white-space:pre-wrap;font-size:15px;line-height:1.3;color:#111;}
      .bubble .ts{font-size:12px;color:var(--muted);margin-top:6px;text-align:right;}
      .sys{align-self:center;background:transparent;color:var(--muted);font-size:13px;padding:6px 10px;border-radius:8px;}
      pre{background:#fff;border:1px solid #e6e6e6;padding:12px;border-radius:8px;white-space:pre-wrap;}
      @media (max-width:640px){ .bubble{max-width:92%;} }
      </style>
    </head>
    <body>
      <div class="controls">
        <label><input id="fmt" type="checkbox"/> Ver vista cruda</label>
        <a class="btn" href="/api/ticket/${encodeURIComponent(tid)}" target="_blank" rel="noopener">Ver JSON (API)</a>
      </div>

      <div class="chat-wrap">
        <div class="chat" id="chatContent">
          ${chatLines}
        </div>

        <div id="rawView" style="display:none;margin-top:12px;">
          <pre>${safeRaw}</pre>
        </div>
      </div>

      <script>
        (function(){
          const chk = document.getElementById('fmt');
          const chat = document.getElementById('chatContent');
          const raw = document.getElementById('rawView');
          chk.addEventListener('change', ()=> {
            if (chk.checked) { chat.style.display='none'; raw.style.display='block'; }
            else { chat.style.display='flex'; raw.style.display='none'; }
          });
        })();
      </script>
    </body>
  </html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;

