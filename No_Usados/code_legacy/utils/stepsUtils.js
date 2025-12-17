/**
 * utils/stepsUtils.js
 * Utilidades para manejo de pasos de diagnóstico
 */

const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Obtiene el emoji para un índice dado (0-based)
 * Soporta hasta 15 pasos (1-15)
 */
export function emojiForIndex(i) {
  const n = i + 1;
  if (n <= 10) {
    return NUM_EMOJIS[n] || `${n}.`;
  }
  // Para números mayores a 10, combinar emojis
  // Ejemplo: 11 = 1️⃣1️⃣, 12 = 1️⃣2️⃣, etc.
  const digits = String(n).split('');
  return digits.map(d => NUM_EMOJIS[parseInt(d)] || d).join('');
}

/**
 * Obtiene el nivel de dificultad para un índice de paso (0-14)
 * Retorna: { level: 1-5, stars: '⭐' * level, label: 'Muy fácil' | 'Fácil' | 'Intermedio' | 'Difícil' | 'Muy difícil' }
 */
export function getDifficultyForStep(stepIndex) {
  // 0-2: Muy fácil (⭐)
  // 3-5: Fácil (⭐⭐)
  // 6-8: Intermedio (⭐⭐⭐)
  // 9-11: Difícil (⭐⭐⭐⭐)
  // 12-14: Muy difícil (⭐⭐⭐⭐⭐)
  
  if (stepIndex < 3) {
    return { level: 1, stars: '⭐', label: 'Muy fácil' };
  } else if (stepIndex < 6) {
    return { level: 2, stars: '⭐⭐', label: 'Fácil' };
  } else if (stepIndex < 9) {
    return { level: 3, stars: '⭐⭐⭐', label: 'Intermedio' };
  } else if (stepIndex < 12) {
    return { level: 4, stars: '⭐⭐⭐⭐', label: 'Difícil' };
  } else {
    return { level: 5, stars: '⭐⭐⭐⭐⭐', label: 'Muy difícil' };
  }
}

/**
 * Enumera pasos con emojis y niveles de dificultad, incluyendo botón de ayuda debajo de cada paso
 */
export function enumerateStepsWithDifficulty(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => {
    const emoji = emojiForIndex(i);
    const difficulty = getDifficultyForStep(i);
    return `Paso ${emoji} Dificultad: ${difficulty.stars}\n\n${s}\n\n🆘 Ayuda Paso ${emoji}`;
  });
}

/**
 * Enumera pasos con emojis (versión original, mantenida para compatibilidad)
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

/**
 * Formatea una explicación detectando pasos numerados y reemplazándolos con emojis
 * Detecta patrones como "1.", "2.", "1)", "2)", "1-", "2-", etc.
 */
export function formatExplanationWithNumberedSteps(explanation, locale = 'es-AR') {
  if (!explanation || typeof explanation !== 'string') return explanation;
  
  // Dividir en líneas para procesar cada una
  const lines = explanation.split('\n');
  const formattedLines = [];
  let stepCounter = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Patrón para detectar números seguidos de punto, paréntesis, guión, dos puntos, etc.
    // Ejemplos: "1.", "2.", "1)", "2)", "1-", "2-", "1:", "2:", etc.
    const numberedStepPattern = /^(\s*)(\d{1,2})([\.\)\-\:])\s+(.+)$/;
    const match = line.match(numberedStepPattern);
    
    if (match) {
      const [, indent, number, separator, content] = match;
      const stepNumber = parseInt(number, 10);
      const emoji = emojiForIndex(stepNumber - 1); // Convertir a 0-based
      
      // Formatear como lista vertical: emoji en una línea, contenido en la siguiente
      formattedLines.push(`${indent}${emoji}`);
      formattedLines.push(''); // Línea en blanco
      formattedLines.push(`${indent}${content.trim()}`);
      
      stepCounter++;
    } else {
      // Si no es un paso numerado, verificar si es una viñeta
      const bulletPattern = /^(\s*)([-•*])\s+(.+)$/;
      const bulletMatch = line.match(bulletPattern);
      
      if (bulletMatch && stepCounter === 0) {
        // Solo formatear viñetas si no se encontraron pasos numerados antes
        const [, indent, bullet, content] = bulletMatch;
        stepCounter++;
        const emoji = emojiForIndex(stepCounter - 1);
        formattedLines.push(`${indent}${emoji}`);
        formattedLines.push(''); // Línea en blanco
        formattedLines.push(`${indent}${content.trim()}`);
      } else {
        // Mantener la línea original
        formattedLines.push(line);
      }
    }
  }
  
  return formattedLines.join('\n');
}

