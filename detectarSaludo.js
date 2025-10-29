// utils/detectarSaludo.js
export function normalizeGreetingText(s){
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g,' ')
    .trim();
}

export function isGreetingMessage(text){
  const msg = normalizeGreetingText(text);
  const GREET_REGEX = /\b(?:h+o+l+a+a*|holis+s*|o+l+i+|o+l+a+a*!?|buen(?:\s*d[ií]a|as(?:\s*(?:tardes|noches))?)|(?:h?e+y+|e+y+)|q(?:ue)?\s*t[aá]l|wena+s?)\b[\s¡!¿?.,;:]*$/i;
  const EXTRA_SMALL_TALK = /\b(c[oó]mo\s+va|c[oó]mo\s+andas?|todo\s+bien|que\s+onda|como\s+esta[sn])\b/i;
  return GREET_REGEX.test(msg) || EXTRA_SMALL_TALK.test(msg);
}
