/**
 * utils/common.js
 * Utilidades comunes usadas en múltiples módulos
 */

/**
 * Genera timestamp ISO actual
 * @returns {string} Timestamp en formato ISO
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Agrega botones de navegación conversacional cuando sea apropiado
 * @param {Array} options - Array de opciones actuales
 * @param {string} stage - Stage actual de la conversación
 * @param {string} locale - Locale del usuario
 * @returns {Array} Array de opciones con navegación conversacional agregada
 */
export function addConversationalNavigation(options = [], stage, locale = 'es-AR') {
  if (!Array.isArray(options)) {
    options = [];
  }
  
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // Stages donde NO agregar navegación conversacional (son muy tempranos o específicos)
  const skipNavigationStages = ['ASK_LANGUAGE', 'ASK_NAME', 'TICKET_SENT', 'ENDED'];
  
  if (skipNavigationStages.includes(stage)) {
    return options.length > 0 ? options : ['BTN_BACK'];
  }
  
  // Si ya hay opciones, verificar si ya incluyen navegación
  const hasBack = options.some(opt => 
    (typeof opt === 'string' && opt === 'BTN_BACK') ||
    (typeof opt === 'object' && (opt.token === 'BTN_BACK' || opt.value === 'BTN_BACK'))
  );
  const hasChangeTopic = options.some(opt => 
    (typeof opt === 'string' && opt === 'BTN_CHANGE_TOPIC') ||
    (typeof opt === 'object' && (opt.token === 'BTN_CHANGE_TOPIC' || opt.value === 'BTN_CHANGE_TOPIC'))
  );
  const hasMoreInfo = options.some(opt => 
    (typeof opt === 'string' && opt === 'BTN_MORE_INFO') ||
    (typeof opt === 'object' && (opt.token === 'BTN_MORE_INFO' || opt.value === 'BTN_MORE_INFO'))
  );
  
  // Agregar botones de navegación si no están presentes y es apropiado
  const navigationButtons = [];
  
  // Agregar "Más información" si no está presente y hay contexto para expandir
  if (!hasMoreInfo && options.length > 0) {
    navigationButtons.push('BTN_MORE_INFO');
  }
  
  // Agregar "Cambiar de tema" si no está presente y no estamos en un flujo crítico
  const criticalStages = ['BASIC_TESTS', 'ADVANCED_TESTS', 'ESCALATE', 'CREATE_TICKET'];
  if (!hasChangeTopic && !criticalStages.includes(stage)) {
    navigationButtons.push('BTN_CHANGE_TOPIC');
  }
  
  // Agregar "Volver atrás" si no está presente
  if (!hasBack) {
    navigationButtons.push('BTN_BACK');
  }
  
  // Agregar botones de navegación al final (antes de BTN_CLOSE si existe)
  const closeIndex = options.findIndex(opt => 
    (typeof opt === 'string' && opt === 'BTN_CLOSE') ||
    (typeof opt === 'object' && (opt.token === 'BTN_CLOSE' || opt.value === 'BTN_CLOSE'))
  );
  
  if (closeIndex >= 0) {
    // Insertar antes de BTN_CLOSE
    return [...options.slice(0, closeIndex), ...navigationButtons, ...options.slice(closeIndex)];
  } else {
    // Agregar al final
    return [...options, ...navigationButtons];
  }
}

/**
 * Helper para crear objetos con opciones
 * Asegura que siempre haya al menos un botón (BTN_BACK si no hay ninguno)
 * Agrega navegación conversacional cuando sea apropiado
 * @param {object} obj - Objeto base (puede contener session, locale, userLocale)
 * @param {string} locale - Locale del usuario (opcional, se detecta automáticamente si no se proporciona)
 * @returns {object} Objeto con options array agregado (mínimo 1 botón)
 */
export function withOptions(obj, locale = null) {
  const result = { options: [], ...obj };
  
  // Detectar locale automáticamente si no se proporciona
  if (!locale && result.session) {
    locale = result.session.userLocale || result.session.locale || 'es-AR';
  } else if (!locale && result.userLocale) {
    locale = result.userLocale;
  } else if (!locale && result.locale) {
    locale = result.locale;
  } else if (!locale) {
    locale = 'es-AR'; // Default
  }
  
  // ✅ Asegurar que siempre haya al menos un botón
  if (!result.options || result.options.length === 0) {
    // Si no hay botones, agregar "Volver atrás"
    result.options = ['BTN_BACK'];
  } else if (result.stage) {
    // Agregar navegación conversacional si hay stage
    result.options = addConversationalNavigation(result.options, result.stage, locale);
  }
  
  return result;
}
