/**
 * handlers/deviceDetector.js
 * Detección inteligente de dispositivos con detección automática y manejo de ambigüedades
 */

/**
 * Detecta el tipo de dispositivo de forma inteligente
 * @param {string} userMessage - Mensaje del usuario
 * @param {Object} session - Sesión actual
 * @returns {Object} - { device: string|null, isExplicit: boolean, isAmbiguous: boolean, reason: string }
 */
export function detectDeviceIntelligently(userMessage, session = {}) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { device: null, isExplicit: false, isAmbiguous: false, reason: 'empty_message' };
  }

  const text = userMessage.toLowerCase().trim();
  
  // Si ya hay un dispositivo detectado, no volver a preguntar
  if (session.device && ['desktop', 'notebook', 'all-in-one', 'tablet', 'printer', 'router', 'mobile'].includes(session.device)) {
    return { 
      device: session.device, 
      isExplicit: true, 
      isAmbiguous: false, 
      reason: 'already_detected' 
    };
  }

  // 1. DETECCIÓN EXPLÍCITA - Términos claros que NO requieren aclaración
  const explicitPatterns = {
    'notebook': [
      /\bnotebook\b/i,
      /\blaptop\b/i,
      /\bportátil\b/i,
      /\bportatil\b/i,
      /\bnotebooks\b/i,
      /\blaptops\b/i
    ],
    'desktop': [
      /\bpc\s+de\s+escritorio\b/i,
      /\bcomputadora\s+de\s+escritorio\b/i,
      /\bcomputador\s+de\s+escritorio\b/i,
      /\bdesktop\b/i,
      /\btorre\b/i,
      /\bpc\s+torre\b/i,
      /\bcomputadora\s+torre\b/i
    ],
    'all-in-one': [
      /\ball\s+in\s+one\b/i,
      /\ball-in-one\b/i,
      /\btodo\s+en\s+uno\b/i,
      /\bpantalla\s+con\s+pc\b/i,
      /\bmonitor\s+con\s+pc\b/i
    ]
  };

  // Buscar términos explícitos
  for (const [deviceType, patterns] of Object.entries(explicitPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { 
          device: deviceType, 
          isExplicit: true, 
          isAmbiguous: false, 
          reason: `explicit_${deviceType}` 
        };
      }
    }
  }

  // 2. PISTAS INDIRECTAS - Acciones/objetos que solo aplican a un tipo
  const indirectClues = {
    'notebook': [
      /\bbater[íi]a\b/i,
      /\bcargador\s+de\s+notebook\b/i,
      /\bcargador\s+de\s+laptop\b/i,
      /\ble\s+cambie\s+la\s+bateria\b/i,
      /\ble\s+cambie\s+la\s+batería\b/i,
      /\bcambie\s+la\s+bateria\b/i,
      /\bcambie\s+la\s+batería\b/i,
      /\bdesconecte\s+el\s+cargador\b/i,
      /\bdesconecté\s+el\s+cargador\b/i
    ],
    'desktop': [
      /\bdesconect[ée]\s+el\s+monitor\b/i,
      /\bdesconect[ée]\s+la\s+pantalla\b/i,
      /\bmonitor\s+no\s+funciona\b/i,
      /\bpantalla\s+no\s+funciona\b/i,
      /\bla\s+cpu\s+s[ií]\b/i,
      /\bpero\s+la\s+cpu\s+s[ií]\b/i,
      /\bpero\s+la\s+cpu\s+funciona\b/i,
      /\bmonitor\s+separado\b/i,
      /\bpantalla\s+separada\b/i
    ],
    'all-in-one': [
      /\bpantalla\s+est[áa]\s+pegada\b/i,
      /\bpantalla\s+pegada\s+al\s+equipo\b/i,
      /\bmonitor\s+integrado\b/i,
      /\bpantalla\s+integrada\b/i
    ]
  };

  // Buscar pistas indirectas
  for (const [deviceType, clues] of Object.entries(indirectClues)) {
    for (const clue of clues) {
      if (clue.test(text)) {
        return { 
          device: deviceType, 
          isExplicit: false, 
          isAmbiguous: false, 
          reason: `indirect_clue_${deviceType}` 
        };
      }
    }
  }

  // 3. TÉRMINOS AMBIGUOS - Requieren aclaración
  const ambiguousTerms = [
    /\bcompu\b/i,
    /\bcomputadora\b/i,
    /\bcomputador\b/i,
    /\bordenador\b/i,
    /\bmi\s+m[áa]quina\b/i,
    /\bel\s+equipo\b/i,
    /\bmi\s+equipo\b/i,
    /\bel\s+dispositivo\b/i,
    /\bmi\s+dispositivo\b/i,
    // "pc" solo cuando no está acompañado de especificaciones
    /\b^pc\b/i,
    /\b\spc\s/i,
    /\b\spc[.,!?]?\s*$/i,
    /\bmi\s+pc\b/i,
    /\bla\s+pc\b/i,
    /\bel\s+pc\b/i
  ];

  // Verificar si contiene términos ambiguos
  for (const pattern of ambiguousTerms) {
    if (pattern.test(text)) {
      // Verificar que NO tenga especificaciones que lo hagan explícito
      const hasExplicitSpec = 
        /\b(notebook|laptop|portátil|portatil|escritorio|desktop|torre|all\s+in\s+one|todo\s+en\s+uno)\b/i.test(text);
      
      if (!hasExplicitSpec) {
        return { 
          device: null, 
          isExplicit: false, 
          isAmbiguous: true, 
          reason: 'ambiguous_term' 
        };
      }
    }
  }

  // 4. DETECCIÓN POR CONTEXTO - Si menciona "pc" pero hay contexto que lo aclara
  if (/\bpc\b/i.test(text)) {
    // Si menciona "pc" pero también menciona características específicas
    if (/\b(notebook|laptop|portátil|portatil)\b/i.test(text)) {
      return { 
        device: 'notebook', 
        isExplicit: true, 
        isAmbiguous: false, 
        reason: 'pc_with_notebook_context' 
      };
    }
    if (/\b(escritorio|desktop|torre)\b/i.test(text)) {
      return { 
        device: 'desktop', 
        isExplicit: true, 
        isAmbiguous: false, 
        reason: 'pc_with_desktop_context' 
      };
    }
    if (/\b(all\s+in\s+one|todo\s+en\s+uno)\b/i.test(text)) {
      return { 
        device: 'all-in-one', 
        isExplicit: true, 
        isAmbiguous: false, 
        reason: 'pc_with_allinone_context' 
      };
    }
    
    // Si solo dice "pc" sin más contexto, es ambiguo
    if (/^pc[.,!?]?\s*$/i.test(text.trim()) || /\bmi\s+pc\b/i.test(text) || /\bla\s+pc\b/i.test(text) || /\bel\s+pc\b/i.test(text)) {
      return { 
        device: null, 
        isExplicit: false, 
        isAmbiguous: true, 
        reason: 'pc_without_context' 
      };
    }
  }

  // 5. NO SE PUDO DETECTAR - Ni explícito ni ambiguo (probablemente otro tipo de dispositivo o mensaje no relacionado)
  return { 
    device: null, 
    isExplicit: false, 
    isAmbiguous: false, 
    reason: 'not_detected' 
  };
}

/**
 * Obtiene el vocabulario apropiado según el tipo de dispositivo
 * @param {string} deviceType - Tipo de dispositivo (desktop, notebook, all-in-one)
 * @param {string} locale - Idioma (es-AR, en, etc.)
 * @returns {Object} - { deviceLabel, deviceArticle, devicePronoun }
 */
export function getDeviceVocabulary(deviceType, locale = 'es-AR') {
  const isEn = locale.toLowerCase().startsWith('en');
  
  const vocabulary = {
    'notebook': {
      es: { label: 'notebook', article: 'la', pronoun: 'tu notebook' },
      en: { label: 'notebook', article: 'your', pronoun: 'your notebook' }
    },
    'desktop': {
      es: { label: 'PC de escritorio', article: 'la', pronoun: 'tu PC' },
      en: { label: 'desktop PC', article: 'your', pronoun: 'your PC' }
    },
    'all-in-one': {
      es: { label: 'all-in-one', article: 'la', pronoun: 'tu all-in-one' },
      en: { label: 'all-in-one', article: 'your', pronoun: 'your all-in-one' }
    }
  };

  const vocab = vocabulary[deviceType];
  if (!vocab) {
    // Fallback genérico
    return {
      deviceLabel: isEn ? 'device' : 'equipo',
      deviceArticle: isEn ? 'your' : 'el',
      devicePronoun: isEn ? 'your device' : 'tu equipo'
    };
  }

  const lang = isEn ? 'en' : 'es';
  return {
    deviceLabel: vocab[lang].label,
    deviceArticle: vocab[lang].article,
    devicePronoun: vocab[lang].pronoun
  };
}

/**
 * Genera el mensaje de aclaración cuando el término es ambiguo
 * @param {string} locale - Idioma
 * @returns {string} - Mensaje de aclaración
 */
export function getAmbiguousDeviceMessage(locale = 'es-AR') {
  const isEn = locale.toLowerCase().startsWith('en');
  
  if (isEn) {
    return "When you say \"computer\", do you mean a desktop PC, a notebook, or an all-in-one? This will help me guide you better. 💻🖥️";
  }
  
  return "Cuando me decís compu/computadora, ¿es una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️";
}

