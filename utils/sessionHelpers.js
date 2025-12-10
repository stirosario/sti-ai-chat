/**
 * utils/sessionHelpers.js
 * Funciones helper para gestión avanzada de sesiones
 * Fase 3: Recordatorios, seguimiento y detección de inactividad
 */

/**
 * Detecta si el usuario está volviendo después de un período de inactividad
 * @param {object} session - Sesión actual
 * @param {number} inactivityThreshold - Umbral de inactividad en milisegundos (default: 5 minutos)
 * @returns {object|null} Información sobre el retorno o null si no aplica
 */
export function detectReturnAfterInactivity(session, inactivityThreshold = 5 * 60 * 1000) {
  if (!session || !session.transcript || session.transcript.length === 0) {
    return null;
  }
  
  // Buscar último mensaje del usuario
  const lastUserMessage = session.transcript
    .slice()
    .reverse()
    .find(msg => msg.who === 'user');
  
  if (!lastUserMessage || !lastUserMessage.ts) {
    return null;
  }
  
  const lastActivityTime = new Date(lastUserMessage.ts).getTime();
  const now = Date.now();
  const timeSinceLastActivity = now - lastActivityTime;
  
  // Si pasó más del umbral, considerar que está volviendo
  if (timeSinceLastActivity > inactivityThreshold) {
    // Buscar último mensaje del bot para contexto
    const lastBotMessage = session.transcript
      .slice()
      .reverse()
      .find(msg => msg.who === 'bot');
    
    return {
      isReturning: true,
      timeSinceLastActivity,
      minutesAway: Math.floor(timeSinceLastActivity / (60 * 1000)),
      lastBotMessage: lastBotMessage?.text || null,
      lastStage: lastBotMessage?.stage || session.stage,
      context: {
        problem: session.problem,
        device: session.deviceLabel || session.device,
        currentStage: session.stage,
        stepsCompleted: Object.values(session.stepProgress || {}).filter(s => s === 'completed' || s === 'done').length,
        totalSteps: (session.tests?.basic?.length || 0) + (session.tests?.advanced?.length || 0)
      }
    };
  }
  
  return null;
}

/**
 * Genera mensaje de bienvenida al volver después de inactividad
 * @param {object} returnInfo - Información del retorno (de detectReturnAfterInactivity)
 * @param {string} locale - Locale del usuario
 * @param {object} session - Sesión actual (opcional, para obtener userName)
 * @returns {string} Mensaje de bienvenida personalizado
 */
export function getWelcomeBackMessage(returnInfo, locale = 'es-AR', session = null) {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!returnInfo || !returnInfo.isReturning) {
    return '';
  }
  
  const { minutesAway, context } = returnInfo;
  const userName = session?.userName || '';
  const greeting = userName 
    ? (isEn ? `Welcome back, ${userName}! 👋` : `¡Hola de nuevo, ${userName}! 👋`)
    : (isEn ? `Welcome back! 👋` : `¡Hola de nuevo! 👋`);
  
  // Mensaje según tiempo de ausencia
  let timeMessage = '';
  if (minutesAway < 10) {
    timeMessage = isEn 
      ? "I see you're back. Let's continue where we left off."
      : "Veo que volviste. Sigamos donde lo dejamos.";
  } else if (minutesAway < 60) {
    timeMessage = isEn
      ? `It's been about ${minutesAway} minutes. Let's continue helping you.`
      : `Pasaron unos ${minutesAway} minutos. Sigamos ayudándote.`;
  } else {
    const hours = Math.floor(minutesAway / 60);
    timeMessage = isEn
      ? `It's been about ${hours} hour${hours > 1 ? 's' : ''}. Let me remind you where we were.`
      : `Pasaron unas ${hours} hora${hours > 1 ? 's' : ''}. Te recuerdo dónde estábamos.`;
  }
  
  // Resumen del contexto
  let contextSummary = '';
  if (context.problem) {
    contextSummary += isEn
      ? `\n\n📋 **We were working on:** "${context.problem}"`
      : `\n\n📋 **Estábamos trabajando en:** "${context.problem}"`;
  }
  
  if (context.device) {
    contextSummary += isEn
      ? `\n💻 **Your device:** ${context.device}`
      : `\n💻 **Tu dispositivo:** ${context.device}`;
  }
  
  if (context.totalSteps > 0) {
    const progress = context.stepsCompleted > 0 
      ? `${context.stepsCompleted}/${context.totalSteps}`
      : `0/${context.totalSteps}`;
    contextSummary += isEn
      ? `\n📊 **Progress:** ${progress} steps completed`
      : `\n📊 **Progreso:** ${progress} pasos completados`;
  }
  
  // Opciones de continuación
  const continueOptions = isEn
    ? `\n\nWhat would you like to do?\n• Continue with the diagnostic steps\n• Start over with a new problem\n• Connect with a technician`
    : `\n\n¿Qué querés hacer?\n• Continuar con los pasos de diagnóstico\n• Empezar de nuevo con otro problema\n• Conectar con un técnico`;
  
  return `${greeting}\n\n${timeMessage}${contextSummary}${continueOptions}`;
}

/**
 * Actualiza el timestamp de última actividad de la sesión
 * @param {object} session - Sesión actual
 */
export function updateLastActivity(session) {
  if (!session) return;
  
  session.lastActivity = new Date().toISOString();
  
  // También actualizar en metadata si existe
  if (!session.metadata) {
    session.metadata = {};
  }
  session.metadata.lastActivity = session.lastActivity;
  session.metadata.totalInteractions = (session.metadata.totalInteractions || 0) + 1;
}

