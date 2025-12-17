// frontend-snippet-fixed.js — STI Chat (sesión unificada v2 + FIX botón WhatsApp superpuesto)
// Última revisión: 2025-11-03

(function () {
  // === CSS inyectado (fix visual WA + burbujas + opciones + listas) ===
  const CSS_ID = 'sti-wa-fix-styles';
  if (!document.getElementById(CSS_ID)) {
    const css = `
/* ===== BURBUJAS DE MENSAJE ===== */
.sti-msg{display:flex;align-items:flex-start;max-width:100%;margin-bottom:12px;position:relative}
.sti-msg.user{justify-content:flex-end}
.sti-msg.bot{justify-content:flex-start}

.sti-bubble{
  max-width:85%;
  padding:10px 12px;
  border-radius:14px;
  line-height:1.5;
  font-size:14px;
  background:#f8fafc;
  white-space:pre-line;
  word-break:normal;
  overflow-wrap:break-word;
  hyphens:none;
  box-sizing:border-box;
  overflow:visible;
}
.sti-msg.user .sti-bubble{background:#3b82f6;color:#fff}
.sti-bubble p{margin:0 0 8px 0;word-wrap:break-word}
.sti-bubble p:last-child{margin-bottom:0}
.sti-bubble strong{font-weight:600}

/* ===== CONTENEDOR WHATSAPP ===== */
.sti-wa-wrapper{display:block;width:100%;margin-top:12px;clear:both;position:relative;z-index:1}
.sti-wa-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:10px 16px;border-radius:8px;border:none;background:#25d366;color:#fff;
  font-size:14px;font-weight:500;cursor:pointer;transition:all .2s ease;
  box-shadow:0 2px 4px rgba(37,211,102,.3);position:relative;z-index:10;width:auto;max-width:100%;
}
.sti-wa-btn:hover{background:#20ba5a;box-shadow:0 3px 6px rgba(37,211,102,.4);transform:translateY(-1px)}
.sti-wa-btn:active{transform:translateY(0)}

/* ===== OPCIONES ===== */
.sti-options{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;width:100%;clear:both}
.sti-opt-btn{padding:8px 14px;border-radius:20px;border:1px solid #cbd5e1;background:#fff;font-size:13px;cursor:pointer;transition:all .2s;white-space:nowrap}
.sti-opt-btn:hover{background:#f1f5f9;border-color:#94a3b8}

/* ===== LISTAS DE PASOS ===== */
.sti-steps{margin:10px 0 0 0;padding-left:22px;font-size:14px;line-height:1.5;list-style:decimal;clear:both}
.sti-steps li{margin:6px 0;padding-left:4px;white-space:normal;word-break:normal;overflow-wrap:break-word;hyphens:none}

/* ===== TYPING (si lo usás) ===== */
.sti-typing{display:flex;gap:4px;margin:6px 0 8px}
.sti-typing .dot{width:6px;height:6px;border-radius:999px;background:#94a3b8;display:inline-block;animation:sti-blink 1s infinite}
.sti-typing .dot:nth-child(2){animation-delay:.2s}.sti-typing .dot:nth-child(3){animation-delay:.4s}
@keyframes sti-blink{0%,80%,100%{opacity:.3}40%{opacity:1}}

/* ===== RESPONSIVE ===== */
@media (max-width:480px){
  .sti-bubble{max-width:90%;font-size:13px}
  .sti-wa-btn{font-size:13px;padding:9px 14px;width:100%}
  .sti-steps{font-size:13px;padding-left:18px}
}
`;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // === API (local vs prod) ===
  const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API_BASE = window.STI_API_BASE || (IS_LOCAL
    ? 'http://localhost:3000'
    : 'https://sti-rosario-ai.onrender.com');

  const API_URL      = API_BASE + '/api/chat';
  const API_GREETING = API_BASE + '/api/greeting';
  const API_TICKET   = API_BASE + '/api/whatsapp-ticket';

  // === Sesión unificada + migración ===
  const SESSION_KEY = 'sti-session-id-v2'; // única clave nueva

  // 1) Eliminar claves viejas (evita que reaparezca “Ricardo”)
  ['sti.sessionId', 'sti_session_id', 'sti-session-id'].forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });

  // 2) Forzar sesión nueva por URL: https://stia.com.ar/?new=1
  const url = new URL(location.href);
  const forceNew = url.searchParams.get('new') === '1';
  if (forceNew) {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // 3) Crear / obtener SID
  let SESSION_ID = localStorage.getItem(SESSION_KEY);
  if (!SESSION_ID) {
    const rnd = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    SESSION_ID = 'web-' + rnd;
    try { localStorage.setItem(SESSION_KEY, SESSION_ID); } catch (e) {}
  }

  // === Headers coherentes (x-session-id + opcional x-session-fresh)
  function baseHeaders() {
    const h = { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID };
    if (forceNew) h['x-session-fresh'] = '1';
    return h;
  }

  // === Elementos UI
  const box   = document.getElementById('sti-chat-box');
  const msgs  = document.getElementById('sti-messages');
  const input = document.getElementById('sti-text');
  const send  = document.getElementById('sti-send');

  // === Render de mensajes
  let typingEl = null;

  function addMsg(text, who = 'bot', options = []) {
    if (!msgs) return null;
    const wrap = document.createElement('div');
    wrap.className = who === 'user' ? 'sti-msg user' : 'sti-msg bot';

    const p = document.createElement('div');
    p.className = 'sti-bubble';
    // Importante: sin whiteSpace inline para no pisar el CSS
    p.textContent = text || '';
    wrap.appendChild(p);

    if (Array.isArray(options) && options.length) {
      const optWrap = document.createElement('div');
      optWrap.className = 'sti-options';
      options.forEach(label => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sti-opt-btn';
        b.textContent = label;
        b.addEventListener('click', () => sendMsg(label));
        optWrap.appendChild(b);
      });
      wrap.appendChild(optWrap);
    }

    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap; // ⬅️ clave: devolvemos el nodo para poder anexar WA al final
  }

  function addTyping() {
    if (typingEl || !msgs) return;
    typingEl = document.createElement('div');
    typingEl.className = 'sti-typing';
    typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    msgs.appendChild(typingEl);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    if (!typingEl) return;
    typingEl.remove();
    typingEl = null;
  }

  // === Saludo inicial
  async function ensureGreet() {
    try {
      console.log('[STI] calling /api/greeting', { API_GREETING, sid: SESSION_ID });
      const r = await fetch(API_GREETING, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ sid: SESSION_ID })
      });
      const d = await r.json().catch((e) => { console.warn('[STI] greeting JSON parse error', e); return {}; });
      console.log('[STI] /api/greeting response', d);
      addMsg(
        d.reply ||
        '⚡ ¡Bienvenido a STI! Soy Tecnos 🤖, tu asistente técnico inteligente 😎\n\n¿Cómo te llamás?',
        'bot',
        d.options || []
      );
    } catch {
      addMsg(
        '⚡ ¡Bienvenido a STI! Soy Tecnos 🤖, tu asistente técnico inteligente 😎\n\n¿Cómo te llamás?',
        'bot',
        []
      );
    }
  }

  // === Envío de mensajes
  async function sendMsg(txt) {
    if (!txt) return;
    if (input) input.value = '';
    addMsg(txt, 'user');
    addTyping();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ sid: SESSION_ID, text: txt })
      });
      const data = await res.json().catch(() => ({}));
      removeTyping();

      // Render del bot y conservar el nodo
      const node = addMsg(data.reply || '🤖', 'bot', data.options || []);

      // --- BOTÓN DE WHATSAPP (si el backend lo habilita) ---
      if (node && data && data.allowWhatsapp) {
        const waWrapper = document.createElement('div');
        waWrapper.className = 'sti-wa-wrapper';

        const wa = document.createElement('button');
        wa.type = 'button';
        wa.className = 'sti-wa-btn';
        wa.textContent = '📲 Enviar por WhatsApp';
        wa.addEventListener('click', openWhatsAppTicket);

        waWrapper.appendChild(wa);
        node.appendChild(waWrapper); // SIEMPRE al final del mismo nodo
        msgs.scrollTop = msgs.scrollHeight;
      }

      if (data.autoSend) {
        await sendMsg(data.autoSend); // reenvío automático si corresponde
      }
    } catch {
      removeTyping();
      addMsg('😕 Hubo un problema de red. Reintentamos en 3 segundos…', 'bot');
      setTimeout(() => sendMsg(txt), 3000);
    }
  }

  // === Ticket de WhatsApp
  async function openWhatsAppTicket() {
    try {
      const r = await fetch(API_TICKET, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ sessionId: SESSION_ID })
      });
      const d = await r.json().catch((e) => { console.warn('[STI] ticket JSON parse error', e); return {}; });
      console.log('[STI] /api/whatsapp-ticket response', d);
      if (d && d.waUrl) window.open(d.waUrl, '_blank');
      else addMsg('No pude generar el ticket ahora.', 'bot');
    } catch {
      addMsg('No pude conectar con el generador de tickets 😕', 'bot');
    }
  }

  // === Eventos de UI
  if (send) {
    send.addEventListener('click', () => sendMsg(input && input.value.trim()));
  }
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg(input.value.trim());
      }
    });
  }

  // === Auto-greeting controlado (ensure-once) ===
  let _stiGreeted = false; // ✅ única declaración

  function stiEnsureGreetOnce(reason = 'unknown') {
    if (_stiGreeted) return;
    _stiGreeted = true;
    try {
      console.log('[STI] ensureGreet()', 'reason:', reason);
      ensureGreet();
    } catch (e) {
      console.warn('[STI] ensureGreet failed:', e);
      _stiGreeted = false; // permitir reintento si falló
      setTimeout(() => stiEnsureGreetOnce('retry_after_error'), 1000);
    }
  }

  function showSTIChat() {
    const chatBox = document.getElementById('sti-chat-box');
    if (chatBox) {
      chatBox.style.display = 'flex';
      stiEnsureGreetOnce('showSTIChat');
    }
  }

  // Bind a botones conocidos
  document.getElementById('btn-asistencia-header')?.addEventListener('click', (e)=>{ e.preventDefault(); showSTIChat(); });
  document.getElementById('btn-asistencia-hero')?.addEventListener('click',   (e)=>{ e.preventDefault(); showSTIChat(); });

  // Fallback: si la URL viene con #asistencia, saludamos
  if (location.hash.includes('asistencia')) {
    stiEnsureGreetOnce('hash_asistencia_initial');
  }

  // Exponer helper global por si lo querés llamar desde HTML
  window.showSTIChat = showSTIChat;

  // 1) DOMContentLoaded fallback (por si el chat abre por defecto)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => stiEnsureGreetOnce('dom_loaded'), 400));
  } else {
    setTimeout(() => stiEnsureGreetOnce('dom_already_loaded'), 400);
  }

  // 2) Foco en input o click en el área del chat
  input?.addEventListener('focus', () => stiEnsureGreetOnce('input_focus'));
  msgs?.addEventListener('click', () => stiEnsureGreetOnce('msgs_click'));

  // 3) Observador: si el chat pasa a visible (display != 'none'), saludamos
  const _stiBox = document.getElementById('sti-chat-box');
  if (_stiBox && 'MutationObserver' in window) {
    const mo = new MutationObserver(() => {
      const visible = getComputedStyle(_stiBox).display !== 'none';
      if (visible) stiEnsureGreetOnce('box_visible');
    });
    mo.observe(_stiBox, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // 4) Fallback URL hash (segundo chequeo por cambios de hash posteriores)
  if (location.hash.includes('asistencia')) {
    stiEnsureGreetOnce('hash_asistencia');
  }

  // === Helpers globales opcionales ===
  window.resetSTISession = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    location.reload(true);
  };
  window.openWhatsAppTicket = openWhatsAppTicket;
})();
