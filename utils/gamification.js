/**
 * utils/gamification.js
 * Funciones para gamificación sutil y logros
 * Fase 3: Gamificación sutil
 */

/**
 * Calcula el progreso visual como porcentaje
 * @param {number} completed - Pasos completados
 * @param {number} total - Total de pasos
 * @returns {number} Porcentaje de progreso (0-100)
 */
export function calculateProgressPercentage(completed, total) {
  if (!total || total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Genera una barra de progreso visual
 * @param {number} percentage - Porcentaje de progreso (0-100)
 * @param {number} length - Longitud de la barra (default: 20)
 * @returns {string} Barra de progreso visual
 */
export function generateProgressBar(percentage, length = 20) {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Detecta logros alcanzados
 * @param {object} session - Sesión actual
 * @returns {Array} Array de logros alcanzados
 */
export function detectAchievements(session) {
  const achievements = [];
  
  if (!session) return achievements;
  
  // Logro: Primer paso completado
  const completedSteps = Object.values(session.stepProgress || {}).filter(s => s === 'completed' || s === 'done').length;
  if (completedSteps === 1 && !session.achievements?.firstStep) {
    achievements.push({
      id: 'first_step',
      name: 'Primer Paso',
      description: 'Completaste tu primer paso de diagnóstico',
      emoji: '🎯',
      unlocked: true
    });
  }
  
  // Logro: Todos los pasos básicos completados
  const basicSteps = session.tests?.basic?.length || 0;
  if (completedSteps >= basicSteps && basicSteps > 0 && !session.achievements?.allBasicSteps) {
    achievements.push({
      id: 'all_basic_steps',
      name: 'Diagnóstico Básico',
      description: 'Completaste todos los pasos básicos',
      emoji: '🏆',
      unlocked: true
    });
  }
  
  // Logro: Problema resuelto
  if (session.stage === 'ENDED' && session.problem && !session.achievements?.problemSolved) {
    achievements.push({
      id: 'problem_solved',
      name: 'Problema Resuelto',
      description: '¡Lograste resolver tu problema!',
      emoji: '🎉',
      unlocked: true
    });
  }
  
  // Logro: Persistencia (completó pruebas avanzadas)
  const advancedSteps = session.tests?.advanced?.length || 0;
  if (advancedSteps > 0 && completedSteps >= (basicSteps + advancedSteps) && !session.achievements?.persistence) {
    achievements.push({
      id: 'persistence',
      name: 'Persistencia',
      description: 'Completaste todas las pruebas, incluyendo avanzadas',
      emoji: '💪',
      unlocked: true
    });
  }
  
  return achievements;
}

/**
 * Genera mensaje de logro desbloqueado
 * @param {object} achievement - Objeto de logro
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje de logro
 */
export function getAchievementMessage(achievement, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  return isEn
    ? `${achievement.emoji} **Achievement Unlocked:** ${achievement.name}\n${achievement.description}`
    : `${achievement.emoji} **Logro Desbloqueado:** ${achievement.name}\n${achievement.description}`;
}

/**
 * Genera mensaje motivacional según progreso
 * @param {number} percentage - Porcentaje de progreso
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje motivacional
 */
export function getMotivationalMessage(percentage, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (percentage >= 100) {
    return isEn
      ? '🎉🎉🎉 Amazing! You completed everything!'
      : '🎉🎉🎉 ¡Increíble! ¡Completaste todo!';
  } else if (percentage >= 75) {
    return isEn
      ? '🔥 Almost there! You\'re doing great!'
      : '🔥 ¡Casi terminás! ¡Vas muy bien!';
  } else if (percentage >= 50) {
    return isEn
      ? '💪 Halfway there! Keep going!'
      : '💪 ¡Ya vas por la mitad! ¡Seguí así!';
  } else if (percentage >= 25) {
    return isEn
      ? '👍 Good start! You\'re making progress!'
      : '👍 ¡Buen comienzo! ¡Estás avanzando!';
  } else {
    return isEn
      ? '🚀 Let\'s get started! You\'ve got this!'
      : '🚀 ¡Empecemos! ¡Vos podés!';
  }
}

/**
 * Actualiza los logros en la sesión
 * @param {object} session - Sesión actual
 * @param {Array} newAchievements - Nuevos logros desbloqueados
 */
export function updateSessionAchievements(session, newAchievements) {
  if (!session.achievements) {
    session.achievements = {};
  }
  
  newAchievements.forEach(achievement => {
    session.achievements[achievement.id] = {
      unlocked: true,
      unlockedAt: new Date().toISOString(),
      name: achievement.name
    };
  });
}

