// test-typos.js
// =============
// Tests de normalización ortográfica con 20 casos reales
// Basado en análisis de 200 frases con errores (100 ES + 100 EN)
//
// Ejecutar:  node test-typos.js

import { normalizarTextoCompleto, corregirTypos } from './normalizarTexto.js';

// ============================================
// CASOS DE TEST (20 seleccionados de 200)
// ============================================

const TEST_CASES = [
  // ===== ESPAÑOL - Alta Confianza =====
  {
    id: 1,
    input: 'Mi kompu no enziende.',
    expectedNormalized: 'mi compu no enciende',
    expectedDevice: 'PC/Notebook',
    confidence: 'LOW',
    typosCorregidos: ['kompu→compu', 'enziende→enciende']
  },
  {
    id: 5,
    input: 'No me toma el cargadoor.',
    expectedNormalized: 'no me toma el cargador',
    expectedDevice: 'Notebook',
    confidence: 'HIGH',
    typosCorregidos: ['cargadoor→cargador']
  },
  {
    id: 29,
    input: 'La bateria no carga bn.',
    expectedNormalized: 'la bateria no carga bn',
    expectedDevice: 'Notebook',
    confidence: 'HIGH',
    typosCorregidos: [] // 'bateria' sin acento es aceptable
  },
  {
    id: 15,
    input: 'No me anda el mause.',
    expectedNormalized: 'no me anda el mouse',
    expectedDevice: 'Mouse',
    confidence: 'HIGH',
    typosCorregidos: ['mause→mouse']
  },
  
  // ===== ESPAÑOL - Media Confianza =====
  {
    id: 2,
    input: 'La pamtaya se puso neggra.',
    expectedNormalized: 'la pantalla se puso negra',
    expectedDevice: 'Screen',
    confidence: 'MEDIUM',
    typosCorregidos: ['pamtaya→pantalla', 'neggra→negra']
  },
  {
    id: 24,
    input: 'Me dice sin señaal.',
    expectedNormalized: 'me dice sin senal',  // 'ñ' se normaliza a 'n'
    expectedDevice: 'Monitor/TV',
    confidence: 'MEDIUM',
    typosCorregidos: ['señaal→señal']
  },
  {
    id: 14,
    input: 'No detecta el teclaco.',
    expectedNormalized: 'no detecta el teclado',
    expectedDevice: 'Keyboard',
    confidence: 'HIGH',
    typosCorregidos: ['teclaco→teclado']
  },
  
  // ===== ESPAÑOL - Baja Confianza =====
  {
    id: 3,
    input: 'El aparto no prende mas.',
    expectedNormalized: 'el aparato no prende mas',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: ['aparto→aparato']
  },
  {
    id: 4,
    input: 'Está mui lento todo.',
    expectedNormalized: 'esta muy lento todo',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: ['mui→muy']
  },
  {
    id: 50,
    input: 'El aparto no ace nada de nada.',
    expectedNormalized: 'el aparato no hace nada de nada',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: ['aparto→aparato', 'ace→hace']
  },
  
  // ===== ENGLISH - Alta Confianza =====
  {
    id: 101,
    input: 'My compuetr wont turn on.',
    expectedNormalized: 'my computer wont turn on',
    expectedDevice: 'PC/Notebook',
    confidence: 'LOW',
    typosCorregidos: ['compuetr→computer', 'wont→wont']
  },
  {
    id: 105,
    input: 'It doesnt take the chager.',
    expectedNormalized: 'it doesn t take the charger',  // apóstrofe se normaliza a espacio
    expectedDevice: 'Notebook',
    confidence: 'HIGH',
    typosCorregidos: ['doesnt→doesn\'t', 'chager→charger']
  },
  {
    id: 129,
    input: 'Batery not chargng.',
    expectedNormalized: 'battery not charging',
    expectedDevice: 'Notebook',
    confidence: 'HIGH',
    typosCorregidos: ['batery→battery', 'chargng→charging']
  },
  {
    id: 115,
    input: 'My mause isnt working.',
    expectedNormalized: 'my mouse isn t working',  // apóstrofe se normaliza a espacio
    expectedDevice: 'Mouse',
    confidence: 'HIGH',
    typosCorregidos: ['mause→mouse', 'isnt→isn\'t']
  },
  
  // ===== ENGLISH - Media Confianza =====
  {
    id: 102,
    input: 'The screan goes black.',
    expectedNormalized: 'the screen goes black',
    expectedDevice: 'Screen',
    confidence: 'MEDIUM',
    typosCorregidos: ['screan→screen']
  },
  {
    id: 124,
    input: 'Shows "no signall".',
    expectedNormalized: 'shows no signall',
    expectedDevice: 'Monitor/TV',
    confidence: 'MEDIUM',
    typosCorregidos: [] // 'signall' no está en diccionario, pero 'signal' sí
  },
  {
    id: 114,
    input: 'Keybord not detected.',
    expectedNormalized: 'keyboard not detected',
    expectedDevice: 'Keyboard',
    confidence: 'HIGH',
    typosCorregidos: ['keybord→keyboard']
  },
  
  // ===== ENGLISH - Baja Confianza =====
  {
    id: 103,
    input: 'The divice wont start.',
    expectedNormalized: 'the device wont start',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: ['divice→device', 'wont→wont']
  },
  {
    id: 104,
    input: 'Its super slow now.',
    expectedNormalized: 'its super slow now',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: []
  },
  {
    id: 150,
    input: 'The device does nothing at alll.',
    expectedNormalized: 'the device does nothing at all',
    expectedDevice: 'Ambiguous',
    confidence: 'VERY_LOW',
    typosCorregidos: ['alll→all'] // Colapsar repeticiones
  }
];

// ============================================
// FUNCIONES DE TEST
// ============================================

function testNormalization() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTS DE NORMALIZACIÓN ORTOGRÁFICA');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of TEST_CASES) {
    const result = normalizarTextoCompleto(testCase.input);
    const isMatch = result === testCase.expectedNormalized;
    
    if (isMatch) {
      passed++;
      console.log(`✅ TEST #${testCase.id} PASS`);
      console.log(`   Input:    "${testCase.input}"`);
      console.log(`   Output:   "${result}"`);
      console.log(`   Expected: "${testCase.expectedNormalized}"`);
      if (testCase.typosCorregidos.length > 0) {
        console.log(`   Typos:    ${testCase.typosCorregidos.join(', ')}`);
      }
    } else {
      failed++;
      console.log(`❌ TEST #${testCase.id} FAIL`);
      console.log(`   Input:    "${testCase.input}"`);
      console.log(`   Output:   "${result}"`);
      console.log(`   Expected: "${testCase.expectedNormalized}"`);
      console.log(`   Diff:     "${highlightDiff(result, testCase.expectedNormalized)}"`);
    }
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 RESULTADOS: ${passed}/${TEST_CASES.length} tests pasados`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return { passed, failed, total: TEST_CASES.length };
}

function testTypoCorrection() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔧 TESTS DE CORRECCIÓN DE TYPOS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const typoTests = [
    // Español
    { input: 'kompu', expected: 'compu' },
    { input: 'pamtaya', expected: 'pantalla' },
    { input: 'enziende', expected: 'enciende' },
    { input: 'cargadoor', expected: 'cargador' },
    { input: 'mause', expected: 'mouse' },
    { input: 'teclaco', expected: 'teclado' },
    { input: 'dispocitivo', expected: 'dispositivo' },
    { input: 'aparto', expected: 'aparato' },
    { input: 'mui', expected: 'muy' },
    { input: 'ase', expected: 'hace' },
    
    // English
    { input: 'compuetr', expected: 'computer' },
    { input: 'screan', expected: 'screen' },
    { input: 'wont', expected: 'wont' }, // Acepta sin apóstrofe
    { input: 'doesnt', expected: 'doesn\'t' },
    { input: 'chager', expected: 'charger' },
    { input: 'keybord', expected: 'keyboard' },
    { input: 'batery', expected: 'battery' },
    { input: 'divice', expected: 'device' },
    { input: 'alot', expected: 'a lot' },
    { input: 'wierd', expected: 'weird' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of typoTests) {
    const result = corregirTypos(test.input);
    const isMatch = result === test.expected;
    
    if (isMatch) {
      passed++;
      console.log(`✅ "${test.input}" → "${result}"`);
    } else {
      failed++;
      console.log(`❌ "${test.input}" → "${result}" (expected: "${test.expected}")`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 RESULTADOS: ${passed}/${typoTests.length} correcciones exitosas`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / typoTests.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return { passed, failed, total: typoTests.length };
}

function testDeviceKeywords() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎯 TESTS DE DETECCIÓN DE KEYWORDS (Simulado)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const keywordTests = [
    // Alta confianza - keywords específicos presentes
    { input: 'Mi kompu no carga la bateria', keywords: ['compu', 'bateria'], device: 'Notebook', confidence: 'HIGH' },
    { input: 'La pamtaya no da señaal', keywords: ['pantalla', 'señal'], device: 'Monitor', confidence: 'MEDIUM' },
    { input: 'El mause no responde', keywords: ['mouse'], device: 'Mouse', confidence: 'HIGH' },
    
    // Baja confianza - solo término genérico
    { input: 'El aparto no enciende', keywords: ['aparato'], device: 'Ambiguous', confidence: 'LOW' },
    { input: 'Mi dispocitivo está lento', keywords: ['dispositivo'], device: 'Ambiguous', confidence: 'LOW' }
  ];
  
  for (const test of keywordTests) {
    const normalized = normalizarTextoCompleto(test.input);
    const foundKeywords = test.keywords.filter(k => normalized.includes(k));
    
    console.log(`📝 Input: "${test.input}"`);
    console.log(`   Normalized: "${normalized}"`);
    console.log(`   Keywords found: ${foundKeywords.join(', ')}`);
    console.log(`   Expected device: ${test.device}`);
    console.log(`   Expected confidence: ${test.confidence}\n`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

function highlightDiff(actual, expected) {
  let diff = '';
  const maxLen = Math.max(actual.length, expected.length);
  
  for (let i = 0; i < maxLen; i++) {
    if (actual[i] !== expected[i]) {
      diff += `[${actual[i] || '∅'}≠${expected[i] || '∅'}]`;
    } else {
      diff += actual[i] || '';
    }
  }
  
  return diff;
}

// ============================================
// EJECUTAR TESTS
// ============================================

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                                                               ║');
console.log('║   🧪 TEST SUITE: NORMALIZACIÓN ORTOGRÁFICA                   ║');
console.log('║   Basado en 200 casos reales con errores (100 ES + 100 EN)   ║');
console.log('║                                                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('\n');

// Test 1: Corrección individual de typos
const typoResults = testTypoCorrection();

// Test 2: Normalización completa de frases
const normResults = testNormalization();

// Test 3: Detección de keywords (simulado)
testDeviceKeywords();

// ============================================
// RESUMEN FINAL
// ============================================

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    📊 RESUMEN FINAL                           ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const totalPassed = typoResults.passed + normResults.passed;
const totalTests = typoResults.total + normResults.total;
const globalSuccessRate = ((totalPassed / totalTests) * 100).toFixed(1);

console.log(`🎯 Tests de Typos:         ${typoResults.passed}/${typoResults.total} (${((typoResults.passed/typoResults.total)*100).toFixed(1)}%)`);
console.log(`🎯 Tests de Normalización: ${normResults.passed}/${normResults.total} (${((normResults.passed/normResults.total)*100).toFixed(1)}%)`);
console.log('─────────────────────────────────────────────────────────────────');
console.log(`🏆 TOTAL:                  ${totalPassed}/${totalTests} (${globalSuccessRate}%)\n`);

if (normResults.failed === 0 && typoResults.failed === 0) {
  console.log('✅ ¡TODOS LOS TESTS PASARON! Sistema listo para producción.\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${normResults.failed + typoResults.failed} tests fallaron. Revisar correcciones.\n`);
  process.exit(1);
}
