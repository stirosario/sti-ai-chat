// utils/detectarSaludo.js

// --- Normalizador liviano para saludos ---
export function normalizeGreetingText(s = '') {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Detección general (hola, holis, hey, buen día, q tal, etc.) ---
export function isGreetingMessage(text = '') {
  const msg = normalizeGreetingText(text);

  // saludos universales + variantes
  const GREET_REGEX =
    /\b(?:h+o+l+a+a*|holis+s*|o+l+i+|o+l+a+a*!?|buen(?:\s*dias?|as(?:\s*(?:tardes|noches))?)|\bhey+\b|\bey+\b|q(?:ue)?\s*tal|wena+s?)\b/i;

  // small talk frecuente
  const EXTRA_SMALL_TALK =
    /\b(c[oó]mo\s+va|como\s+va|c[oó]mo\s+andas?|como\s+andas?|todo\s+bien|que\s+onda|que\s+tal|como\s+esta[sn])\b/i;

  return GREET_REGEX.test(msg) || EXTRA_SMALL_TALK.test(msg);
}

// --- Detección argenta específica (che, bueeenas, qué onda, etc.) ---
export function isArgGreeting(text = '') {
  const t = normalizeGreetingText(text);

  // priorizamos el inicio del mensaje para evitar falsos positivos
  const start = t.slice(0, 80);

  const RX_START = /^(?:hola\s*che|che\s*hola|che[,!\s]|bue+nas\b|holis\b|que\s*onda\b|como\s*va\b|todo\s*bien\b)/i;
  const RX_TIME  = /\b(?:buen(?:os|as)?\s*dias?|buenas\s*tardes|buenas\s*noches)\b/i;

  return RX_START.test(start) || RX_TIME.test(t);
}

/**
 * Genera un saludo local con emoji y, opcionalmente, anexa menú.
 * Deja al server decidir el contenido de menú y la plantilla (tpl).
 *
 * @param {string} original - mensaje original del usuario
 * @param {object} ctx - contexto para construir la respuesta
 * @param {string} [ctx.greetingsResponse] - saludo base (fallback si no detecta variantes)
 * @param {boolean} [ctx.showMenu=true] - si debe mostrar menú
 * @param {string} [ctx.menuTitle='Temas frecuentes']
 * @param {string[]} [ctx.menuItems=[]] - ítems de menú (texto plano)
 * @param {function} [ctx.tpl=(s)=>s] - función plantilla para reemplazos (p.ej. {{whatsapp_link}})
 * @returns {string} respuesta final
 */
export function buildArgGreetingReply(original = '', ctx = {}) {
  const {
    greetingsResponse = '¡Hola! 👋 Soy Tecnos de STI. ¿En qué te doy una mano hoy?',
    showMenu = true,
    menuTitle = 'Temas frecuentes',
    menuItems = [],
    tpl = (s) => s
  } = ctx;

  const t = normalizeGreetingText(original);
  let base = greetingsResponse;

  // Ajuste por franja (buen día/tardes/noches) o small talk bien argento
  if (/\bbuen(?:os|as)?\s*dias?\b/.test(t))      base = '¡Buen día! ☀️ Soy Tecnos de STI. ¿En qué te doy una mano?';
  else if (/\bbuenas\s*tardes\b/.test(t))        base = '¡Buenas tardes! 🌤️ Soy Tecnos de STI. ¿En qué te ayudo?';
  else if (/\bbuenas\s*noches\b/.test(t))        base = '¡Buenas noches! 🌙 Soy Tecnos de STI. ¿En qué te ayudo?';
  else if (/\b(que\s*onda|como\s*va|todo\s*bien)\b/.test(t))
    base = '¡Todo piola! 🧉 Soy Tecnos de STI. Contame, ¿en qué te ayudo?';

  if (!showMenu) return tpl(base);

  const list = (menuItems || []).map(i => `• ${i}`).join('\n');
  const reply = `${base}\n\n**${menuTitle}**\n${list}`.trim();

  return tpl(reply);
}
