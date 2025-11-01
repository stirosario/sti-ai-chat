// === Snippet front minimal (única addMsg + typing + autoSend) ===
async function sendMsg(txt) {
  if (!txt) return;
  addMsg(txt, 'user');
  addTyping();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: SESSION_ID, text: txt })
    });
    const data = await res.json();
    removeTyping();
    addMsg(data.reply, 'bot', data.options || []);
    if (data.autoSend) {
      await sendMsg(data.autoSend); // reenvía el problema pendiente automáticamente
    }
  } catch (e) {
    removeTyping();
    addMsg("Ups, hubo un problema de red. Reintentamos en 3 segundos…", 'bot');
    setTimeout(() => sendMsg(txt), 3000);
  }
}
