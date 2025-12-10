/**
 * utils/uxHelpers.js
 * Funciones helper para mejorar la experiencia del usuario
 */

/**
 * Obtiene un saludo personalizado usando el nombre del usuario
 * @param {string} name - Nombre del usuario
 * @param {string} locale - Locale del usuario
 * @param {number} variation - Variación del saludo (0-4)
 * @returns {string} Saludo personalizado
 */
export function getPersonalizedGreeting(name, locale = 'es-AR', variation = 0) {
  if (!name) return '';
  
  const isEn = String(locale).toLowerCase().startsWith('en');
  const capitalizedName = name.split(' ').map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()).join(' ');
  
  const greetings = isEn
    ? [
        `${capitalizedName}`,
        `Perfect, ${capitalizedName}`,
        `Got it, ${capitalizedName}`,
        `Alright, ${capitalizedName}`,
        `Understood, ${capitalizedName}`
      ]
    : [
        `${capitalizedName}`,
        `Perfecto, ${capitalizedName}`,
        `Entendido, ${capitalizedName}`,
        `Dale, ${capitalizedName}`,
        `Bien, ${capitalizedName}`
      ];
  
  return greetings[variation % greetings.length];
}

/**
 * Genera un indicador de progreso para pasos de diagnóstico
 * @param {number} currentStep - Paso actual (1-indexed)
 * @param {number} totalSteps - Total de pasos
 * @param {string} locale - Locale del usuario
 * @returns {string} Indicador de progreso
 */
export function getProgressIndicator(currentStep, totalSteps, locale = 'es-AR') {
  if (!totalSteps || totalSteps === 0) return '';
  
  const isEn = String(locale).toLowerCase().startsWith('en');
  const percentage = Math.round((currentStep / totalSteps) * 100);
  
  // Barra de progreso visual simple
  const filled = Math.round((currentStep / totalSteps) * 10);
  const empty = 10 - filled;
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
  
  return isEn
    ? `\n📊 Progress: Step ${currentStep} of ${totalSteps} (${percentage}%) ${progressBar}`
    : `\n📊 Progreso: Paso ${currentStep} de ${totalSteps} (${percentage}%) ${progressBar}`;
}

/**
 * Genera un mensaje de confirmación para acciones del usuario
 * @param {string} action - Acción confirmada
 * @param {object} data - Datos relacionados
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje de confirmación
 */
export function getConfirmationMessage(action, data = {}, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  const confirmations = {
    problem: isEn
      ? `✅ Got it! I've noted your problem: "${data.problem}"`
      : `✅ Perfecto! Anoté tu problema: "${data.problem}"`,
    
    device: isEn
      ? `✅ Perfect! I've set your device as: ${data.device}`
      : `✅ Perfecto! Configuré tu dispositivo como: ${data.device}`,
    
    step_completed: isEn
      ? `✅ Great! Step ${data.step} completed.`
      : `✅ ¡Genial! Paso ${data.step} completado.`,
    
    ticket_created: isEn
      ? `✅ Ticket created successfully! Your ticket ID is: ${data.ticketId}`
      : `✅ ¡Ticket creado exitosamente! Tu número de ticket es: ${data.ticketId}`,
    
    default: isEn
      ? `✅ Done!`
      : `✅ ¡Listo!`
  };
  
  return confirmations[action] || confirmations.default;
}

/**
 * Genera un mensaje de error amigable
 * @param {Error|string} error - Error original
 * @param {string} locale - Locale del usuario
 * @param {string} context - Contexto de la operación
 * @returns {string} Mensaje de error amigable
 */
export function getFriendlyErrorMessage(error, locale = 'es-AR', context = '') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
  
  // Mapear errores técnicos comunes a mensajes amigables
  const friendlyMessages = {
    'timeout': isEn
      ? "😅 This is taking longer than expected. Would you like to try again or connect with a technician?"
      : "😅 Esto está tomando más tiempo del esperado. ¿Querés intentar de nuevo o que te conecte con un técnico?",
    
    'network': isEn
      ? "🌐 There seems to be a connection issue. Please check your internet and try again."
      : "🌐 Parece que hay un problema de conexión. Por favor verificá tu internet e intentá de nuevo.",
    
    'rate_limit': isEn
      ? "⏱️ You're sending messages too quickly. Please wait a moment and try again."
      : "⏱️ Estás enviando mensajes muy rápido. Por favor esperá un momento e intentá de nuevo.",
    
    'default': isEn
      ? `😅 Oops! Something went wrong: ${errorMessage}. Would you like to try again or connect with a technician?`
      : `😅 ¡Ups! Algo salió mal: ${errorMessage}. ¿Querés intentar de nuevo o que te conecte con un técnico?`
  };
  
  // Detectar tipo de error
  if (errorMessage.toLowerCase().includes('timeout')) {
    return friendlyMessages.timeout;
  } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
    return friendlyMessages.network;
  } else if (errorMessage.toLowerCase().includes('rate') || errorMessage.toLowerCase().includes('limit')) {
    return friendlyMessages.rate_limit;
  }
  
  return friendlyMessages.default;
}

/**
 * Genera un resumen de progreso de la sesión
 * @param {object} session - Objeto de sesión
 * @param {string} locale - Locale del usuario
 * @returns {string} Resumen de progreso
 */
export function getProgressSummary(session, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!session) return '';
  
  const parts = [];
  
  // Problema
  if (session.problem) {
    parts.push(isEn ? `Problem: ${session.problem}` : `Problema: ${session.problem}`);
  }
  
  // Dispositivo
  if (session.deviceLabel || session.device) {
    const device = session.deviceLabel || session.device;
    parts.push(isEn ? `Device: ${device}` : `Dispositivo: ${device}`);
  }
  
  // Pasos completados
  if (session.stepProgress) {
    const completed = Object.values(session.stepProgress).filter(status => status === 'completed').length;
    const total = Object.keys(session.stepProgress).length;
    if (total > 0) {
      parts.push(isEn 
        ? `Steps completed: ${completed} of ${total}`
        : `Pasos completados: ${completed} de ${total}`
      );
    }
  }
  
  if (parts.length === 0) return '';
  
  return isEn
    ? `\n📊 Summary: ${parts.join(' | ')}`
    : `\n📊 Resumen: ${parts.join(' | ')}`;
}

/**
 * Genera un tip proactivo relacionado con el problema
 * @param {string} problem - Problema del usuario
 * @param {string} device - Dispositivo
 * @param {string} locale - Locale del usuario
 * @returns {string} Tip relacionado
 */
export function getProactiveTip(problem = '', device = '', locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!problem) return '';
  
  const normalizedProblem = problem.toLowerCase();
  
  // Tips por tipo de problema
  const tips = {
    'no enciende': isEn
      ? "💡 Tip: If your device doesn't turn on, check the power cable and try a different outlet."
      : "💡 Tip: Si tu equipo no enciende, revisá el cable de alimentación y probá en otro enchufe.",
    
    'lento': isEn
      ? "💡 Tip: A slow computer can be caused by too many programs running. Try closing unnecessary apps."
      : "💡 Tip: Una computadora lenta puede ser por muchos programas abiertos. Probá cerrando aplicaciones innecesarias.",
    
    'calor': isEn
      ? "💡 Tip: Overheating can cause performance issues. Make sure the vents are clean and not blocked."
      : "💡 Tip: El sobrecalentamiento puede causar problemas. Asegurate de que las rejillas de ventilación estén limpias.",
    
    'pantalla': isEn
      ? "💡 Tip: If the screen is black, try connecting an external monitor to check if it's a display issue."
      : "💡 Tip: Si la pantalla está negra, probá conectar un monitor externo para ver si es problema de la pantalla.",
    
    'internet': isEn
      ? "💡 Tip: Internet issues? Try restarting your router and checking cable connections."
      : "💡 Tip: ¿Problemas de internet? Probá reiniciar el router y revisar las conexiones de cables.",
    
    'default': isEn
      ? "💡 Tip: Make sure all cables are properly connected before trying advanced solutions."
      : "💡 Tip: Asegurate de que todos los cables estén bien conectados antes de probar soluciones avanzadas."
  };
  
  // Detectar tipo de problema
  if (normalizedProblem.includes('no enciende') || normalizedProblem.includes('no prende') || normalizedProblem.includes('no arranca')) {
    return tips['no enciende'];
  } else if (normalizedProblem.includes('lento') || normalizedProblem.includes('lenta') || normalizedProblem.includes('slow')) {
    return tips['lento'];
  } else if (normalizedProblem.includes('calor') || normalizedProblem.includes('caliente') || normalizedProblem.includes('hot')) {
    return tips['calor'];
  } else if (normalizedProblem.includes('pantalla') || normalizedProblem.includes('monitor') || normalizedProblem.includes('screen')) {
    return tips['pantalla'];
  } else if (normalizedProblem.includes('internet') || normalizedProblem.includes('wifi') || normalizedProblem.includes('red')) {
    return tips['internet'];
  }
  
  return tips.default;
}

/**
 * Genera un mensaje de celebración para logros
 * @param {string} achievement - Tipo de logro
 * @param {object} data - Datos del logro
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje de celebración
 */
export function getCelebrationMessage(achievement, data = {}, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  const celebrations = {
    step_completed: isEn
      ? `🎉 Great job! You completed step ${data.step}. Keep going!`
      : `🎉 ¡Excelente! Completaste el paso ${data.step}. ¡Seguí así!`,
    
    all_steps_completed: isEn
      ? `🎉🎉 Amazing! You've completed all the diagnostic steps. You're doing great!`
      : `🎉🎉 ¡Increíble! Completaste todos los pasos de diagnóstico. ¡Vas muy bien!`,
    
    problem_solved: isEn
      ? `🎉🎉🎉 Fantastic! I'm so glad we could solve your problem together!`
      : `🎉🎉🎉 ¡Fantástico! ¡Me alegra mucho que hayamos podido resolver tu problema juntos!`,
    
    installation_success: isEn
      ? `🎉🎉 Excellent! The installation completed successfully!`
      : `🎉🎉 ¡Excelente! La instalación se completó exitosamente!`,
    
    default: isEn
      ? `🎉 Well done!`
      : `🎉 ¡Bien hecho!`
  };
  
  return celebrations[achievement] || celebrations.default;
}

