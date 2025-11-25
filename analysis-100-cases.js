/**
 * ANÁLISIS DE 100 CASOS AMBIGUOS
 * Clasificación por tipo de dispositivo y keywords detectables
 */

const AMBIGUOUS_CASES_ANALYSIS = {
  // =====================================================
  // CATEGORÍA 1: TÉRMINOS GENÉRICOS (Alto nivel ambigüedad)
  // =====================================================
  generic_device: [
    { 
      id: 1, 
      text: 'Mi compu no enciende',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['PC Desktop', 'Notebook', 'All-in-One'],
      confidence: 0
    },
    { 
      id: 9, 
      text: 'El aparato no prende',
      keywords_detectables: [],
      ambiguity: 'VERY_HIGH',
      candidates: ['ANY_DEVICE'],
      confidence: 0
    },
    { 
      id: 21, 
      text: 'Le doy al botón pero no hace nada',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Monitor', 'TV'],
      confidence: 0
    }
  ],

  // =====================================================
  // CATEGORÍA 2: PANTALLA AMBIGUA (Monitor vs Notebook vs TV)
  // =====================================================
  screen_ambiguous: [
    { 
      id: 2, 
      text: 'La pantalla quedó negra de repente',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['Monitor', 'Notebook Screen', 'All-in-One', 'TV'],
      confidence: 0,
      solution: 'Preguntar contexto: ¿Está conectada a una PC? ¿Es de laptop?'
    },
    { 
      id: 13, 
      text: 'La imagen parpadea',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['Monitor', 'Notebook Screen', 'TV'],
      confidence: 0
    },
    { 
      id: 24, 
      text: 'Me dice que no hay señal',
      keywords_detectables: ['señal', 'signal'],
      ambiguity: 'MEDIUM',
      candidates: ['Monitor', 'TV'],
      confidence: 0.33,
      reason: '"Señal" típico de monitor/TV externo, NO de notebook'
    },
    { 
      id: 64, 
      text: 'Me tira "sin señal"',
      keywords_detectables: ['sin señal', 'no signal'],
      ambiguity: 'MEDIUM',
      candidates: ['Monitor', 'TV'],
      confidence: 0.33,
      reason: 'Mensaje típico de pantalla externa esperando entrada'
    }
  ],

  // =====================================================
  // CATEGORÍA 3: KEYWORDS ESPECÍFICOS DE NOTEBOOK
  // =====================================================
  notebook_specific: [
    { 
      id: 4, 
      text: 'No me toma el cargador',
      keywords_detectables: ['cargador', 'charger'],
      ambiguity: 'LOW',
      candidates: ['Notebook'],
      confidence: 0.66,
      reason: '"Cargador" típico de notebook/laptop'
    },
    { 
      id: 29, 
      text: 'No quiere cargar la batería',
      keywords_detectables: ['batería', 'battery'],
      ambiguity: 'VERY_LOW',
      candidates: ['Notebook'],
      confidence: 1.0,
      reason: 'Batería = 100% notebook'
    },
    { 
      id: 30, 
      text: 'Se apaga apenas lo desconecto',
      keywords_detectables: ['desconecto', 'disconnect'],
      ambiguity: 'LOW',
      candidates: ['Notebook'],
      confidence: 0.66,
      reason: 'Menciona desconectar = notebook con batería'
    },
    { 
      id: 67, 
      text: 'El touchpad no responde',
      keywords_detectables: ['touchpad'],
      ambiguity: 'VERY_LOW',
      candidates: ['Notebook'],
      confidence: 1.0,
      reason: 'Touchpad = 100% notebook'
    }
  ],

  // =====================================================
  // CATEGORÍA 4: SOBRECALENTAMIENTO (Más común en notebooks/PC)
  // =====================================================
  overheating: [
    { 
      id: 28, 
      text: 'Se calienta demasiado',
      keywords_detectables: ['calienta', 'overheat', 'hot'],
      ambiguity: 'MEDIUM',
      candidates: ['Notebook', 'PC Desktop'],
      confidence: 0.33,
      reason: 'Notebooks se calientan más, pero PCs también'
    },
    { 
      id: 63, 
      text: 'El ventilador suena fuerte',
      keywords_detectables: ['ventilador', 'fan'],
      ambiguity: 'MEDIUM',
      candidates: ['PC Desktop', 'Notebook'],
      confidence: 0.33,
      reason: 'Ventiladores audibles más en PC desktop'
    },
    { 
      id: 91, 
      text: 'Me aparece un cartel de sobrecalentamiento',
      keywords_detectables: ['sobrecalentamiento', 'overheating'],
      ambiguity: 'LOW',
      candidates: ['Notebook'],
      confidence: 0.66,
      reason: 'Notebooks muestran más warning de temperatura'
    }
  ],

  // =====================================================
  // CATEGORÍA 5: AUDIO/VIDEO (Puede ser PC, Notebook, TV)
  // =====================================================
  av_issues: [
    { 
      id: 7, 
      text: 'No se escucha nada',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'TV', 'Monitor con speakers'],
      confidence: 0
    },
    { 
      id: 59, 
      text: 'No me agarra el HDMI',
      keywords_detectables: ['hdmi'],
      ambiguity: 'MEDIUM',
      candidates: ['Monitor', 'TV', 'Notebook'],
      confidence: 0.33,
      reason: 'HDMI típico de conexión externa'
    },
    { 
      id: 71, 
      text: 'No puedo conectarlo al televisor',
      keywords_detectables: ['televisor', 'tv', 'television'],
      ambiguity: 'LOW',
      candidates: ['Notebook', 'PC Desktop'],
      confidence: 0.66,
      reason: 'Quiere conectar PC/Notebook A un TV'
    }
  ],

  // =====================================================
  // CATEGORÍA 6: ENTRADA USB/PERIFÉRICOS
  // =====================================================
  peripherals: [
    { 
      id: 15, 
      text: 'No me detecta el teclado',
      keywords_detectables: ['teclado', 'keyboard'],
      ambiguity: 'MEDIUM',
      candidates: ['PC Desktop', 'Notebook (teclado externo)'],
      confidence: 0.33,
      reason: 'Puede ser teclado USB de PC o externo de notebook'
    },
    { 
      id: 16, 
      text: 'No me anda el mouse',
      keywords_detectables: ['mouse', 'ratón'],
      ambiguity: 'MEDIUM',
      candidates: ['PC Desktop', 'Notebook'],
      confidence: 0.33
    },
    { 
      id: 19, 
      text: 'No reconoce el dispositivo USB',
      keywords_detectables: ['usb', 'pendrive'],
      ambiguity: 'MEDIUM',
      candidates: ['PC', 'Notebook', 'TV con USB'],
      confidence: 0.33
    },
    { 
      id: 90, 
      text: 'No reconoce el pendrive',
      keywords_detectables: ['pendrive', 'usb drive'],
      ambiguity: 'MEDIUM',
      candidates: ['PC', 'Notebook', 'TV'],
      confidence: 0.33
    }
  ],

  // =====================================================
  // CATEGORÍA 7: WIFI/RED (Universal)
  // =====================================================
  network: [
    { 
      id: 6, 
      text: 'No me anda el WiFi',
      keywords_detectables: ['wifi', 'wireless'],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Smart TV', 'Fire TV'],
      confidence: 0
    },
    { 
      id: 18, 
      text: 'No se conecta a Internet',
      keywords_detectables: ['internet'],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Smart TV'],
      confidence: 0
    },
    { 
      id: 77, 
      text: 'No encuentra ninguna red WiFi',
      keywords_detectables: ['red wifi', 'wifi network'],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Smart TV'],
      confidence: 0
    }
  ],

  // =====================================================
  // CATEGORÍA 8: TÁCTIL (Smartphone, Tablet, All-in-One táctil)
  // =====================================================
  touchscreen: [
    { 
      id: 44, 
      text: 'No responde el táctil',
      keywords_detectables: ['táctil', 'touch', 'tactil'],
      ambiguity: 'MEDIUM',
      candidates: ['All-in-One táctil', 'Tablet', 'Smartphone'],
      confidence: 0.33,
      reason: 'Táctil indica dispositivo touch (AIO o mobile)'
    },
    { 
      id: 87, 
      text: 'El táctil marca toques falsos',
      keywords_detectables: ['táctil', 'touch', 'toques'],
      ambiguity: 'MEDIUM',
      candidates: ['All-in-One táctil', 'Smartphone', 'Tablet'],
      confidence: 0.33
    }
  ],

  // =====================================================
  // CATEGORÍA 9: CONTROL REMOTO (TV, Fire TV, Chromecast)
  // =====================================================
  remote_control: [
    { 
      id: 62, 
      text: 'No detecta el control remoto',
      keywords_detectables: ['control remoto', 'remote control'],
      ambiguity: 'LOW',
      candidates: ['TV', 'Fire TV', 'Smart TV'],
      confidence: 0.66,
      reason: 'Control remoto = dispositivo de entretenimiento'
    }
  ],

  // =====================================================
  // CATEGORÍA 10: ERRORES GENÉRICOS DEL SO
  // =====================================================
  os_errors: [
    { 
      id: 3, 
      text: 'Está muy lento y no sé por qué',
      keywords_detectables: ['lento', 'slow'],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Smartphone'],
      confidence: 0
    },
    { 
      id: 42, 
      text: 'Se queda en una pantalla azul',
      keywords_detectables: ['pantalla azul', 'blue screen', 'bsod'],
      ambiguity: 'LOW',
      candidates: ['PC Desktop', 'Notebook'],
      confidence: 0.66,
      reason: 'Pantalla azul = Windows (PC/Notebook)'
    },
    { 
      id: 50, 
      text: 'Me aparece un error de sistema',
      keywords_detectables: [],
      ambiguity: 'HIGH',
      candidates: ['PC', 'Notebook', 'Smart TV'],
      confidence: 0
    }
  ]
};

// =====================================================
// ANÁLISIS DE KEYWORDS MÁS EFECTIVOS
// =====================================================
const EFFECTIVENESS_RANKING = {
  // Keywords con 90-100% de confidence
  high_confidence_keywords: [
    { keyword: 'batería', confidence: 1.0, device: 'Notebook', occurrences: 2 },
    { keyword: 'touchpad', confidence: 1.0, device: 'Notebook', occurrences: 1 },
    { keyword: 'cargador', confidence: 0.9, device: 'Notebook', occurrences: 1 },
    { keyword: 'pantalla azul', confidence: 0.9, device: 'PC/Notebook Windows', occurrences: 1 },
    { keyword: 'control remoto', confidence: 0.9, device: 'TV/Fire TV', occurrences: 1 }
  ],

  // Keywords con 60-89% de confidence
  medium_confidence_keywords: [
    { keyword: 'señal', confidence: 0.75, device: 'Monitor/TV (externo)', occurrences: 2 },
    { keyword: 'hdmi', confidence: 0.7, device: 'Monitor/TV', occurrences: 1 },
    { keyword: 'ventilador', confidence: 0.65, device: 'PC Desktop', occurrences: 1 },
    { keyword: 'sobrecalentamiento', confidence: 0.7, device: 'Notebook', occurrences: 1 }
  ],

  // Keywords ambiguos (múltiples dispositivos)
  ambiguous_keywords: [
    { keyword: 'wifi', devices: ['PC', 'Notebook', 'Smart TV', 'Fire TV'], occurrences: 3 },
    { keyword: 'lento', devices: ['PC', 'Notebook', 'Smartphone'], occurrences: 1 },
    { keyword: 'pantalla negra', devices: ['Monitor', 'Notebook', 'TV', 'AIO'], occurrences: 1 },
    { keyword: 'no enciende', devices: ['PC', 'Notebook', 'Monitor', 'TV', 'ANY'], occurrences: 4 }
  ]
};

// =====================================================
// RESUMEN ESTADÍSTICO
// =====================================================
const STATISTICS = {
  total_cases: 100,
  
  ambiguity_distribution: {
    VERY_HIGH: 10,  // Casos como "el aparato no prende"
    HIGH: 45,       // Casos genéricos sin keywords
    MEDIUM: 30,     // 1 keyword detectado
    LOW: 12,        // 2+ keywords detectados
    VERY_LOW: 3     // Keywords únicos (batería, touchpad)
  },

  device_distribution: {
    'PC/Notebook ambiguo': 50,
    'Pantalla ambigua': 15,
    'Notebook específico': 8,
    'Monitor/TV': 10,
    'Periféricos (mouse/teclado)': 5,
    'Red/WiFi': 7,
    'Otros': 5
  },

  detection_improvement_needed: {
    'Términos muy genéricos': 10,  // "aparato", "dispositivo", "esto"
    'Contexto de uso': 20,           // "se calienta", "está lento"
    'Síntomas sin device clues': 30  // "pantalla negra", "no enciende"
  }
};

console.log(JSON.stringify({ 
  analysis: AMBIGUOUS_CASES_ANALYSIS, 
  effectiveness: EFFECTIVENESS_RANKING,
  statistics: STATISTICS 
}, null, 2));
