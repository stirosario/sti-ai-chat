/**
 * utils/validationHelpers.js
 * Funciones helper para validación proactiva de información antes de avanzar
 */

/**
 * Valida y confirma información antes de avanzar a un nuevo stage
 * @param {object} session - Sesión actual
 * @param {string} nextStage - Stage al que se quiere avanzar
 * @param {string} locale - Locale del usuario
 * @returns {object|null} Objeto con confirmación requerida o null si no es necesaria
 */
export function validateBeforeAdvancing(session, nextStage, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // Validaciones según el stage de destino
  const validations = {
    'ASK_PROBLEM': () => {
      // Antes de preguntar el problema, verificar que tenemos dispositivo
      if (!session.device && !session.deviceLabel) {
        return {
          needsConfirmation: true,
          message: isEn
            ? "I need to know what device you're using first. Is it a PC, notebook, or all-in-one?"
            : "Necesito saber qué dispositivo estás usando primero. ¿Es una PC, notebook o all-in-one?",
          missingField: 'device',
          options: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_NOTEBOOK', 'BTN_DEV_PC_ALLINONE']
        };
      }
      return null;
    },
    
    'BASIC_TESTS': () => {
      // Antes de generar pasos, verificar que tenemos problema y dispositivo
      if (!session.problem || !session.problem.trim()) {
        return {
          needsConfirmation: true,
          message: isEn
            ? "I need to understand your problem first. What issue are you experiencing?"
            : "Necesito entender tu problema primero. ¿Qué inconveniente estás teniendo?",
          missingField: 'problem',
          options: []
        };
      }
      if (!session.device && !session.deviceLabel) {
        return {
          needsConfirmation: true,
          message: isEn
            ? "I need to know what device you're using. Is it a PC, notebook, or all-in-one?"
            : "Necesito saber qué dispositivo estás usando. ¿Es una PC, notebook o all-in-one?",
          missingField: 'device',
          options: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_NOTEBOOK', 'BTN_DEV_PC_ALLINONE']
        };
      }
      return null;
    },
    
    'ADVANCED_TESTS': () => {
      // Antes de pruebas avanzadas, verificar que ya probamos básicas
      if (!session.tests || !session.tests.basic || session.tests.basic.length === 0) {
        return {
          needsConfirmation: true,
          message: isEn
            ? "Let's try the basic steps first. Have you completed the basic diagnostic steps?"
            : "Primero probemos los pasos básicos. ¿Ya completaste los pasos de diagnóstico básicos?",
          missingField: 'basic_tests',
          options: []
        };
      }
      return null;
    },
    
    'CREATE_TICKET': () => {
      // Antes de crear ticket, verificar información mínima
      const missing = [];
      if (!session.problem || !session.problem.trim()) missing.push('problem');
      if (!session.device && !session.deviceLabel) missing.push('device');
      
      if (missing.length > 0) {
        const missingText = missing.join(' y ');
        return {
          needsConfirmation: true,
          message: isEn
            ? `I need a bit more information before creating your ticket. Please provide: ${missingText}`
            : `Necesito un poco más de información antes de crear tu ticket. Por favor proporcioná: ${missingText}`,
          missingField: missing.join(','),
          options: []
        };
      }
      return null;
    }
  };
  
  const validator = validations[nextStage];
  if (validator) {
    return validator();
  }
  
  return null;
}

/**
 * Confirma información importante antes de avanzar
 * @param {object} session - Sesión actual
 * @param {string} field - Campo a confirmar
 * @param {string} value - Valor actual
 * @param {string} locale - Locale del usuario
 * @returns {string} Mensaje de confirmación
 */
export function getConfirmationPrompt(session, field, value, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  const confirmations = {
    'problem': isEn
      ? `Just to confirm, your problem is: "${value}". Is that correct?`
      : `Solo para confirmar, tu problema es: "${value}". ¿Es correcto?`,
    
    'device': isEn
      ? `Just to confirm, your device is: ${value}. Is that correct?`
      : `Solo para confirmar, tu dispositivo es: ${value}. ¿Es correcto?`,
    
    'name': isEn
      ? `Just to confirm, your name is: ${value}. Is that correct?`
      : `Solo para confirmar, tu nombre es: ${value}. ¿Es correcto?`,
    
    'default': isEn
      ? `Just to confirm: ${value}. Is that correct?`
      : `Solo para confirmar: ${value}. ¿Es correcto?`
  };
  
  return confirmations[field] || confirmations.default;
}

/**
 * Detecta inconsistencias en la información proporcionada
 * @param {object} session - Sesión actual
 * @param {string} newValue - Nuevo valor proporcionado
 * @param {string} field - Campo que se está actualizando
 * @param {string} locale - Locale del usuario
 * @returns {object|null} Objeto con inconsistencia detectada o null
 */
export function detectInconsistency(session, newValue, field, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // Comparar con valores anteriores
  const previousValue = session[field] || session[`${field}Label`];
  
  if (previousValue && previousValue !== newValue) {
    // Normalizar para comparación
    const normalize = (str) => String(str).toLowerCase().trim();
    const prevNorm = normalize(previousValue);
    const newNorm = normalize(newValue);
    
    // Si son significativamente diferentes, detectar inconsistencia
    if (prevNorm !== newNorm && !prevNorm.includes(newNorm) && !newNorm.includes(prevNorm)) {
      return {
        hasInconsistency: true,
        message: isEn
          ? `I noticed you said "${previousValue}" before, but now you're saying "${newValue}". Which one is correct?`
          : `Noté que antes dijiste "${previousValue}", pero ahora decís "${newValue}". ¿Cuál es la correcta?`,
        previousValue,
        newValue,
        options: ['BTN_CONFIRM_PREVIOUS', 'BTN_CONFIRM_NEW']
      };
    }
  }
  
  return null;
}

