/**
 * Test script para el sistema de desambiguación de dispositivos
 * Ejecutar: node test-disambiguation.js
 */

// Importar la función normalizeText desde server.js
function normalizeText(t) {
  if (!t || typeof t !== 'string') return '';
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Copiar DEVICE_DISAMBIGUATION del server.js
const DEVICE_DISAMBIGUATION = {
  'compu|computadora|equipo|maquina|máquina|torre|aparato|ordenador|pc\\b|notebook|laptop|portatil|portátil': {
    candidates: [
      { 
        id: 'PC_DESKTOP', 
        icon: '💻', 
        label: 'PC de Escritorio',
        description: 'Torre con monitor separado',
        keywords: ['torre', 'gabinete', 'debajo escritorio', 'cables', 'cpu', 'fuente', 'placa madre', 'desktop']
      },
      { 
        id: 'NOTEBOOK', 
        icon: '💼', 
        label: 'Notebook / Laptop',
        description: 'Computadora portátil con batería',
        keywords: ['bateria', 'batería', 'touchpad', 'tapa', 'portatil', 'portátil', 'llevar', 'cerrar', 'abrir', 'notebook', 'laptop']
      },
      { 
        id: 'ALL_IN_ONE', 
        icon: '🖥️', 
        label: 'All-in-One',
        description: 'Pantalla y procesador integrados',
        keywords: ['pantalla tactil', 'táctil', 'todo junto', 'sin torre', 'integrado', 'un solo equipo', 'all in one', 'aio']
      }
    ]
  },
  
  'pantalla|monitor|display|screen': {
    candidates: [
      { 
        id: 'MONITOR', 
        icon: '🖥️', 
        label: 'Monitor Externo',
        description: 'Pantalla conectada a PC',
        keywords: ['hdmi', 'vga', 'displayport', 'entrada', 'segundo monitor', 'externo', 'cable', 'input', 'signal', 'señal', 'senal']
      },
      { 
        id: 'NOTEBOOK_SCREEN', 
        icon: '💼', 
        label: 'Pantalla de Notebook',
        description: 'Pantalla integrada de laptop',
        keywords: ['integrada', 'bisagras', 'tapa', 'notebook', 'laptop', 'cerrar pantalla', 'portatil', 'portátil']
      },
      { 
        id: 'ALL_IN_ONE_SCREEN', 
        icon: '🖥️', 
        label: 'Pantalla All-in-One',
        description: 'Computadora todo en uno',
        keywords: ['tactil', 'táctil', 'todo junto', 'integrado', 'sin torre', 'all in one']
      },
      { 
        id: 'TV', 
        icon: '📺', 
        label: 'TV / Smart TV',
        description: 'Televisor',
        keywords: ['control remoto', 'canales', 'smart tv', 'televisor', 'hdmi tv', 'chromecast', 'fire tv', 'tv']
      }
    ]
  },
  
  'raton|ratón|mouse|bicho|touchpad': {
    candidates: [
      { 
        id: 'MOUSE_WIRELESS', 
        icon: '🖱️', 
        label: 'Mouse Inalámbrico',
        description: 'Mouse sin cable (Bluetooth/RF)',
        keywords: ['pilas', 'bateria', 'batería', 'bluetooth', 'sin cable', 'inalambrico', 'inalámbrico', 'dongle', 'wireless']
      },
      { 
        id: 'MOUSE_USB', 
        icon: '🖱️', 
        label: 'Mouse USB',
        description: 'Mouse con cable USB',
        keywords: ['cable', 'conectado', 'puerto', 'usb', 'alambrico', 'alámbrico', 'con cable']
      },
      { 
        id: 'TOUCHPAD', 
        icon: '👆', 
        label: 'Touchpad',
        description: 'Mouse táctil de notebook',
        keywords: ['integrado', 'notebook', 'laptop', 'tactil', 'táctil', 'panel', 'touchpad']
      }
    ]
  }
};

function detectAmbiguousDevice(text) {
  const normalized = normalizeText(text.toLowerCase());
  
  for (const [pattern, config] of Object.entries(DEVICE_DISAMBIGUATION)) {
    const regex = new RegExp(`\\b(${pattern})`, 'i');
    const match = normalized.match(regex);
    
    if (match) {
      let maxScore = 0;
      let bestDevice = null;
      
      for (const candidate of config.candidates) {
        let score = 0;
        for (const keyword of candidate.keywords) {
          if (normalized.includes(keyword.toLowerCase())) {
            score++;
          }
        }
        
        if (score > maxScore) {
          maxScore = score;
          bestDevice = candidate;
        }
      }
      
      const confidence = maxScore / 3;
      
      return {
        term: match[1],
        candidates: config.candidates,
        confidence: Math.min(confidence, 1),
        bestMatch: bestDevice,
        matchedKeywords: maxScore
      };
    }
  }
  
  return null;
}

// Test cases
const testCases = [
  { 
    input: 'Mi compu no prende', 
    expected: 'AMBIGUOUS',
    description: 'Término genérico sin keywords específicos'
  },
  { 
    input: 'Mi notebook no carga la batería', 
    expected: 'HIGH_CONFIDENCE',
    description: 'Keyword "batería" indica notebook con alta confianza'
  },
  { 
    input: 'La torre de mi PC no enciende', 
    expected: 'HIGH_CONFIDENCE',
    description: 'Keyword "torre" indica PC Desktop'
  },
  { 
    input: 'Mi pantalla no funciona', 
    expected: 'AMBIGUOUS',
    description: 'Término genérico sin keywords'
  },
  { 
    input: 'El monitor no recibe señal HDMI', 
    expected: 'HIGH_CONFIDENCE',
    description: 'Keywords "HDMI" indica monitor externo'
  },
  { 
    input: 'Mi mouse inalámbrico no responde', 
    expected: 'HIGH_CONFIDENCE',
    description: 'Keyword "inalámbrico" indica mouse wireless'
  },
  { 
    input: 'El touchpad de mi laptop no funciona', 
    expected: 'HIGH_CONFIDENCE',
    description: 'Keywords "touchpad" y "laptop" indican touchpad'
  },
  { 
    input: 'Mi equipo se calienta mucho cuando trabajo', 
    expected: 'AMBIGUOUS',
    description: 'Término genérico "equipo" sin keywords'
  }
];

console.log('\n🧪 TESTING DEVICE DISAMBIGUATION SYSTEM\n');
console.log('='.repeat(80) + '\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.description}`);
  console.log(`Input: "${test.input}"`);
  
  const result = detectAmbiguousDevice(test.input);
  
  if (!result) {
    console.log('❌ FAILED: No ambiguous term detected\n');
    failed++;
    return;
  }
  
  console.log(`Detected term: "${result.term}"`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Best match: ${result.bestMatch ? result.bestMatch.label : 'None'}`);
  console.log(`Matched keywords: ${result.matchedKeywords}`);
  
  const isHighConfidence = result.confidence >= 0.33; // Ajustado threshold
  const actualType = isHighConfidence ? 'HIGH_CONFIDENCE' : 'AMBIGUOUS';
  
  if (actualType === test.expected) {
    console.log(`✅ PASSED: ${actualType}\n`);
    passed++;
  } else {
    console.log(`❌ FAILED: Expected ${test.expected}, got ${actualType}\n`);
    failed++;
  }
  
  console.log('Candidates:');
  result.candidates.forEach(c => {
    console.log(`  ${c.icon} ${c.label} - ${c.description}`);
  });
  console.log('\n' + '-'.repeat(80) + '\n');
});

console.log('='.repeat(80));
console.log(`\n📊 RESULTS: ${passed}/${testCases.length} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
} else {
  console.log('⚠️  SOME TESTS FAILED\n');
  process.exit(1);
}
