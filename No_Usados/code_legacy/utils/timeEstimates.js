/**
 * utils/timeEstimates.js
 * Funciones para estimar tiempo de resolución por tipo de problema
 * Fase 3: Tiempo estimado
 */

/**
 * Base de datos de tiempos estimados por tipo de problema
 */
const TIME_ESTIMATES = {
  'no enciende': { min: 10, max: 30, unit: 'minutes' },
  'no prende': { min: 10, max: 30, unit: 'minutes' },
  'no arranca': { min: 10, max: 30, unit: 'minutes' },
  'lento': { min: 15, max: 45, unit: 'minutes' },
  'lenta': { min: 15, max: 45, unit: 'minutes' },
  'slow': { min: 15, max: 45, unit: 'minutes' },
  'calor': { min: 20, max: 60, unit: 'minutes' },
  'caliente': { min: 20, max: 60, unit: 'minutes' },
  'overheating': { min: 20, max: 60, unit: 'minutes' },
  'pantalla': { min: 5, max: 20, unit: 'minutes' },
  'monitor': { min: 5, max: 20, unit: 'minutes' },
  'screen': { min: 5, max: 20, unit: 'minutes' },
  'internet': { min: 10, max: 25, unit: 'minutes' },
  'wifi': { min: 10, max: 25, unit: 'minutes' },
  'red': { min: 10, max: 25, unit: 'minutes' },
  'teclado': { min: 5, max: 15, unit: 'minutes' },
  'keyboard': { min: 5, max: 15, unit: 'minutes' },
  'mouse': { min: 5, max: 15, unit: 'minutes' },
  'audio': { min: 10, max: 30, unit: 'minutes' },
  'sonido': { min: 10, max: 30, unit: 'minutes' },
  'sound': { min: 10, max: 30, unit: 'minutes' },
  'default': { min: 15, max: 45, unit: 'minutes' }
};

/**
 * Estima el tiempo de resolución basado en el problema
 * @param {string} problem - Descripción del problema
 * @param {string} device - Tipo de dispositivo
 * @param {string} locale - Locale del usuario
 * @returns {object} Estimación de tiempo
 */
export function estimateResolutionTime(problem = '', device = '', locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!problem) {
    return {
      min: 15,
      max: 45,
      unit: 'minutes',
      message: isEn 
        ? 'Estimated time: 15-45 minutes'
        : 'Tiempo estimado: 15-45 minutos'
    };
  }
  
  const normalizedProblem = problem.toLowerCase();
  
  // Buscar coincidencias en la base de datos
  for (const [key, estimate] of Object.entries(TIME_ESTIMATES)) {
    if (normalizedProblem.includes(key)) {
      const { min, max, unit } = estimate;
      
      // Ajustar según dispositivo (notebooks pueden tomar más tiempo)
      let adjustedMin = min;
      let adjustedMax = max;
      
      if (device && (device.toLowerCase().includes('notebook') || device.toLowerCase().includes('laptop'))) {
        adjustedMin = Math.ceil(min * 1.2);
        adjustedMax = Math.ceil(max * 1.2);
      }
      
      const message = isEn
        ? `⏱️ Estimated time: ${adjustedMin}-${adjustedMax} minutes`
        : `⏱️ Tiempo estimado: ${adjustedMin}-${adjustedMax} minutos`;
      
      return {
        min: adjustedMin,
        max: adjustedMax,
        unit,
        message,
        confidence: 'high'
      };
    }
  }
  
  // Default
  const { min, max } = TIME_ESTIMATES.default;
  return {
    min,
    max,
    unit: 'minutes',
    message: isEn
      ? `⏱️ Estimated time: ${min}-${max} minutes`
      : `⏱️ Tiempo estimado: ${min}-${max} minutos`,
    confidence: 'medium'
  };
}

/**
 * Estima el tiempo por paso individual
 * @param {string} stepText - Texto del paso
 * @param {number} stepIndex - Índice del paso (0-based)
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje con tiempo estimado
 */
export function estimateStepTime(stepText = '', stepIndex = 0, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // Determinar tiempo estimado basado en el índice del paso y su dificultad
  // Pasos 1-3 (Muy fácil): 2-5 minutos
  // Pasos 4-6 (Fácil): 3-6 minutos
  // Pasos 7-9 (Intermedio): 5-10 minutos
  // Pasos 10-12 (Difícil): 10-20 minutos
  // Pasos 13-15 (Muy difícil): 15-30 minutos
  
  if (stepIndex < 3) {
    return isEn ? '2-5 minutes' : '2-5 minutos';
  } else if (stepIndex < 6) {
    return isEn ? '3-6 minutes' : '3-6 minutos';
  } else if (stepIndex < 9) {
    return isEn ? '5-10 minutes' : '5-10 minutos';
  } else if (stepIndex < 12) {
    return isEn ? '10-20 minutes' : '10-20 minutos';
  } else {
    return isEn ? '15-30 minutes' : '15-30 minutos';
  }
}

/**
 * Calcula tiempo total estimado basado en pasos restantes
 * @param {number} stepsRemaining - Pasos restantes
 * @param {number} averageStepTime - Tiempo promedio por paso en minutos
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje con tiempo total estimado
 */
export function estimateTotalTime(stepsRemaining, averageStepTime = 5, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (stepsRemaining <= 0) {
    return '';
  }
  
  const totalMinutes = stepsRemaining * averageStepTime;
  
  if (totalMinutes < 60) {
    return isEn
      ? `⏱️ About ${totalMinutes} minutes remaining`
      : `⏱️ Aproximadamente ${totalMinutes} minutos restantes`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
      return isEn
        ? `⏱️ About ${hours} hour${hours > 1 ? 's' : ''} remaining`
        : `⏱️ Aproximadamente ${hours} hora${hours > 1 ? 's' : ''} restante${hours > 1 ? 's' : ''}`;
    } else {
      return isEn
        ? `⏱️ About ${hours}h ${minutes}m remaining`
        : `⏱️ Aproximadamente ${hours}h ${minutes}m restantes`;
    }
  }
}

