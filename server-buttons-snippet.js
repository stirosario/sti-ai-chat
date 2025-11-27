// --- INICIO: mapear botones (poner al inicio del handler /api/chat) ---
const incomingAction = req.body && req.body.action ? String(req.body.action) : null;
let incomingText = (req.body && req.body.text) ? String(req.body.text).trim() : '';

if (incomingAction === 'button' && req.body.value) {
  const tok = String(req.body.value);
  // Map de tokens a texto (expande según necesites)
  const tokenMap = {
    'BTN_BASIC_YES': 'sí',
    'BTN_BASIC_NO' : 'no',
    'BTN_ADVANCED' : 'avanzadas',
    'BTN_WHATSAPP' : 'whatsapp',
    'BTN_DEVICE_PC': 'pc',
    'BTN_DEVICE_NOTEBOOK': 'notebook',
    'BTN_DEVICE_MONITOR': 'monitor',
    'BTN_OTHER': '' // frontend debe abrir input libre si se usa BTN_OTHER
  };

  if (tokenMap[tok] !== undefined) {
    incomingText = tokenMap[tok];
  } else if (tok.startsWith('BTN_HELP_')) {
    // Ej: BTN_HELP_eliminar_archivos_temporales -> "ayuda eliminar archivos temporales"
    const slug = tok.slice('BTN_HELP_'.length).replace(/_/g, ' ');
    incomingText = `ayuda ${slug}`;
  } else {
    // fallback: usa el token como texto legible
    incomingText = tok;
  }

  // Log / transcript: registrar que fue un botón
  const btnLabel = (req.body.label ? String(req.body.label) : tok);
  session?.transcript?.push?.({ who: 'user', text: `[BOTON] ${btnLabel} (${tok})`, ts: nowIso() });
}
// Luego usar 'incomingText' en lugar de req.body.text para toda la lógica downstream.
// --- FIN: mapear botones ---