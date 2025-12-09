/**
 * utils/stepsUtils.js
 * Utilidades para manejo de pasos de diagnóstico
 */

const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Obtiene el emoji para un índice dado
 */
export function emojiForIndex(i) {
  const n = i + 1;
  return NUM_EMOJIS[n] || `${n}.`;
}

/**
 * Enumera pasos con emojis
 */
export function enumerateSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => `${emojiForIndex(i)} ${s}`);
}

/**
 * Normaliza el texto de un paso para comparación
 */
export function normalizeStepText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

