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
  const API_BASE = (window.STI_API_BASE || 'https://sti-rosario-ai.onrender.com').replace(/\/+$/,''); // configurable
  const logEl = document.getElementById('sti-chat-log');
  const formEl = document.getElementById('sti-chat-form');
  const inputEl = document.getElementById('sti-chat-input');
  const quickEl = document.getElementById('sti-quick-actions');

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
        // conservar mayúsculas iniciales simples
        words[i] = /^[A-ZÁÉÍÓÚ]/.test(words[i]) ? fixed.charAt(0).toUpperCase()+fixed.slice(1) : fixed;
      }
    }
    return words.join('');
  }

  function addBubble(role, content){
    const item = document.createElement('div');
    item.className = 'sti-msg ' + role;
    item.innerHTML = content.replace(/\n/g,'<br>');
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
    // autocorrección suave
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
      const hasOptions = /✅|❌|🧑‍🔧/.test(reply);
      setQuickReplies(hasOptions);
    }catch(err){
      addBubble('assistant', 'Hubo un problema de conexión. Intentá de nuevo en unos segundos.');
    }
  }

  // Envío por formulario
  formEl?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const txt = (inputEl?.value || '').trim();
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
