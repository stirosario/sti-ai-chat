/* === sti-chat.js — Chat embebible para STI ===
   Requisitos mínimos en el HTML:
   <div id="sti-chat-box">
     <div id="sti-chat-log"></div>
     <form id="sti-chat-form">
       <input id="sti-chat-input" placeholder="Escribí tu consulta..." autocomplete="off" />
       <button type="submit">Enviar</button>
     </form>
     <div id="sti-quick-actions"></div>
   </div>
*/
(function(){
  const API_BASE = (window.STI_API_BASE || 'https://sti-rosario-ai.onrender.com').replace(/\/+$/,'');
  const logEl   = document.getElementById('sti-chat-log');
  const formEl  = document.getElementById('sti-chat-form');
  const inputEl = document.getElementById('sti-chat-input');
  const quickEl = document.getElementById('sti-quick-actions');

  if(!logEl || !formEl || !inputEl || !quickEl){
    console.warn('[STI-CHAT] Falta algún contenedor HTML del chat.');
    return;
  }

  const messages = []; // historial para markers

  // --- Utilidades ---
  const normalize = (s='') => s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Corrección simple de tipeos comunes
  const typoMap = new Map([
    ['cavle','cable'], ['cabke','cable'], ['cble','cable'],
    ['wiffi','wifi'], ['wifii','wifi'], ['wiffy','wifi'],
    ['wi fi','wifi'], ['wi-fi','wifi'],
    ['conecion','conexion'], ['conecsion','conexion'],
    ['windos','windows'], ['winodws','windows'], ['ventana','windows'],
    ['teclaso','teclado'], ['mause','mouse']
  ]);

  function autocorrect(text){
    const words = text.split(/\b/);
    for (let i=0;i<words.length;i++){
      const w = normalize(words[i]);
      if (typoMap.has(w)) {
        const fixed = typoMap.get(w);
        words[i] = /^[A-ZÁÉÍÓÚ]/.test(words[i]) ? fixed.charAt(0).toUpperCase()+fixed.slice(1) : fixed;
      }
    }
    return words.join('');
  }

  // Limpia marca oculta y arma HTML legible
  function formatAssistant(content){
    const whatsapp = 'https://wa.me/5493417422422';
    let txt = String(content || '');

    // 1) Ocultar marcador interno
    txt = txt.replace(/\[\[sti:intent=[^;]+;step=[^\]]+\]\]/gi, '');

    // 2) Reemplazar token de WhatsApp
    txt = txt.replace(/\{\{\s*whatsapp_link\s*\}\}/gi, whatsapp);

    // 3) Normalizar saltos (soporta "\n" literal y saltos reales)
    txt = txt.replace(/\\n/g, '\n');

    // 4) Mejorar bullets simples (• ) → viñetas visuales
    //   - Convertimos líneas que empiezan con "• " a <div class="sti-bullet">• ...</div>
    txt = txt.split('\n').map(line => {
      const ltrim = line.trimStart();
      if (ltrim.startsWith('• ')) {
        return `<div class="sti-bullet">${ltrim.replace(/^•\s*/, '• ')}</div>`;
      }
      return line;
    }).join('\n');

    // 5) Convertir saltos a <br>
    txt = txt.replace(/\n/g, '<br>');

    // 6) Linkear WhatsApp si aparece en el texto plano
    txt = txt.replace(/https?:\/\/wa\.me\/\d+/g, m => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);

    return txt;
  }

  function addBubble(role, content){
    const item = document.createElement('div');
    item.className = 'sti-msg ' + role;
    const html = role === 'assistant' ? formatAssistant(content) : String(content).replace(/\n/g,'<br>');
    item.innerHTML = html;
    logEl.appendChild(item);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setQuickReplies(show){
    quickEl.innerHTML = '';
    if(!show) return;
    const buttons = [
      {text:'✅ Se solucionó', val:'✅ Se solucionó'},
      {text:'❌ Sigue igual', val:'❌ Sigue igual'},
      {text:'🧑‍🔧 Quiero asistencia por WhatsApp', val:'🧑‍🔧 Quiero asistencia por WhatsApp'}
    ];
    for(const b of buttons){
      const btn = document.createElement('button');
      btn.type='button';
      btn.className='sti-quick';
      btn.textContent = b.text;
      btn.onclick = () => {
        inputEl.value = b.val;
        formEl.dispatchEvent(new Event('submit', {cancelable:true}));
      };
      quickEl.appendChild(btn);
    }
  }

  async function send(text){
    const cleaned = autocorrect(text);
    addBubble('user', cleaned);
    messages.push({ role:'user', content: cleaned });

    try{
      const resp = await fetch(API_BASE + '/api/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ message: cleaned, messages })
      });
      const data = await resp.json();

      const reply = data?.reply?.content || data?.reply || 'No pude procesar tu consulta.';
      messages.push({ role:'assistant', content: reply });

      addBubble('assistant', reply);

      // Mostrar quick replies si el backend agregó opciones en el texto
      const hasOptions = /✅|❌|🧑‍🔧/.test(String(reply));
      setQuickReplies(hasOptions);
    }catch(err){
      console.error('[STI-CHAT] Error fetch', err);
      addBubble('assistant', 'Hubo un problema de conexión. Intentá de nuevo en unos segundos.');
    }
  }

  // Envío por formulario
  formEl.addEventListener('submit', (e)=>{
    e.preventDefault();
    const txt = (inputEl.value || '').trim();
    if(!txt) return;
    inputEl.value = '';
    setQuickReplies(false);
    send(txt);
  });

  // Saludo inicial opcional
  if (!logEl.dataset.noWelcome){
    addBubble('assistant', '¡Hola! Soy Tecnos 🤖 ¿En qué te ayudo hoy? Escribí tu consulta o tocá una opción.');
    setQuickReplies(true);
  }
})();
