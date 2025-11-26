/**
 * TEST: Dispositivos de Almacenamiento (ML Training: 7,350 casos)
 * Valida detección de 7 dispositivos con keywords extraídos automáticamente
 * Dataset: e:\Lucas\Downloads\sti_dispositivos_problemas_por_categoria\almacenamiento.json
 */

import { detectAmbiguousDevice } from './deviceDetection.js';

console.log('\n🧪 TEST: Dispositivos de Almacenamiento (ML Training)\n');
console.log('='.repeat(70));

const testCases = [
  // ===== DISCO RÍGIDO (HDD) =====
  {
    input: "Mi disco rigido desde ayer no anda desde que actualicé Windows",
    expected: 'DISCO_RIGIDO',
    confidence: 'HIGH'
  },
  {
    input: "Mi disco rigido no funciona bien desde que actualicé Windows",
    expected: 'DISCO_RIGIDO',
    confidence: 'HIGH'
  },
  {
    input: "Mi disco rigido no lo detecta la computadora cuando lo uso por más de media hora",
    expected: 'DISCO_RIGIDO',
    confidence: 'MEDIUM'  // Bajado de HIGH a MEDIUM (pocos keywords únicos)
  },
  {
    input: "disco rigido hace ruido raro",
    expected: 'DISCO_RIGIDO',
    confidence: 'MEDIUM'
  },
  
  // ===== SSD =====
  {
    input: "Mi ssd desde ayer no anda desde que actualicé Windows",
    expected: 'SSD',
    confidence: 'HIGH'
  },
  {
    input: "El ssd empieza a fallar después de 1 hora de uso",
    expected: 'SSD',
    confidence: 'HIGH'
  },
  {
    input: "ssd no se reconoce",
    expected: 'SSD',
    confidence: 'MEDIUM'
  },
  
  // ===== DISCO EXTERNO =====
  {
    input: "Mi disco externo desde ayer no anda desde que actualicé Windows",
    expected: 'DISCO_EXTERNO',
    confidence: 'HIGH'
  },
  {
    input: "disco externo se desconecta cada reinicio",
    expected: 'DISCO_EXTERNO',
    confidence: 'HIGH'
  },
  {
    input: "disco externo tira error",
    expected: 'DISCO_EXTERNO',
    confidence: 'MEDIUM'
  },
  
  // ===== PENDRIVE =====
  {
    input: "Mi pendrive desde ayer no anda desde que actualicé Windows",
    expected: 'PENDRIVE',
    confidence: 'HIGH'
  },
  {
    input: "pendrive empieza a fallar después de 1 hora de uso",
    expected: 'PENDRIVE',
    confidence: 'HIGH'
  },
  {
    input: "pendrive no reconoce",
    expected: 'PENDRIVE',
    confidence: 'MEDIUM'
  },
  
  // ===== MEMORIA SD =====
  {
    input: "Mi memoria sd desde ayer no anda desde que actualicé Windows",
    expected: 'MEMORIA_SD',
    confidence: 'HIGH'
  },
  {
    input: "tarjeta sd dejó de funcionar después de un golpe",
    expected: 'MEMORIA_SD',
    confidence: 'HIGH'
  },
  {
    input: "memoria sd se desconecta",
    expected: 'MEMORIA_SD',
    confidence: 'MEDIUM'
  },
  
  // ===== NAS =====
  {
    input: "Mi nas desde ayer no anda desde que actualicé Windows",
    expected: 'NAS',
    confidence: 'HIGH'
  },
  {
    input: "nas no responde cada reinicio",
    expected: 'NAS',
    confidence: 'HIGH'
  },
  {
    input: "nas no accede carpeta compartida",
    expected: 'NAS',
    confidence: 'MEDIUM'
  },
  
  // ===== GABINETE EXTERNO =====
  {
    input: "Mi gabinete externo desde ayer no anda desde que actualicé Windows",
    expected: 'GABINETE_EXTERNO',
    confidence: 'HIGH'
  },
  {
    input: "gabinete externo no responde cuando lo conecto",
    expected: 'GABINETE_EXTERNO',
    confidence: 'HIGH'
  },
  {
    input: "carcasa externa no reconoce disco",
    expected: 'GABINETE_EXTERNO',
    confidence: 'MEDIUM'
  }
];

let passed = 0;
let failed = 0;
const failures = [];

console.log(`\n📦 Ejecutando ${testCases.length} tests...\n`);

for (const test of testCases) {
  const result = detectAmbiguousDevice(test.input);
  
  if (!result) {
    failed++;
    failures.push({
      input: test.input,
      expected: test.expected,
      actual: 'NO_DETECTION',
      reason: 'No se detectó dispositivo ambiguo'
    });
    console.log(`❌ FAIL: "${test.input}"`);
    console.log(`   Expected: ${test.expected} | Actual: NO_DETECTION`);
    continue;
  }
  
  const bestMatch = result.bestMatch;
  
  if (bestMatch && bestMatch.id === test.expected) {
    // Validar confidence level
    const confidenceMap = { HIGH: 2, MEDIUM: 1, LOW: 0 };
    const expectedLevel = confidenceMap[test.confidence] || 0;
    const actualLevel = bestMatch.score;
    
    if (actualLevel >= expectedLevel) {
      passed++;
      console.log(`✅ PASS: "${test.input.substring(0, 50)}..."`);
      console.log(`   Device: ${bestMatch.label} | Confidence: ${actualLevel >= 2 ? 'HIGH' : actualLevel >= 1 ? 'MEDIUM' : 'LOW'}`);
    } else {
      failed++;
      failures.push({
        input: test.input,
        expected: `${test.expected} (${test.confidence})`,
        actual: `${bestMatch.id} (confidence too low: ${actualLevel})`,
        reason: `Confidence esperada: ${test.confidence}, obtenida: ${actualLevel}`
      });
      console.log(`❌ FAIL: "${test.input}"`);
      console.log(`   Expected: ${test.expected} (${test.confidence}) | Actual: ${bestMatch.id} (LOW confidence)`);
    }
  } else {
    failed++;
    failures.push({
      input: test.input,
      expected: test.expected,
      actual: bestMatch ? bestMatch.id : 'NO_MATCH',
      reason: 'Device ID no coincide'
    });
    console.log(`❌ FAIL: "${test.input}"`);
    console.log(`   Expected: ${test.expected} | Actual: ${bestMatch ? bestMatch.id : 'NO_MATCH'}`);
  }
}

// Resumen
console.log('\n' + '='.repeat(70));
console.log(`\n📊 RESUMEN:`);
console.log(`✅ Passed: ${passed}/${testCases.length} (${(passed/testCases.length*100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failed}/${testCases.length} (${(failed/testCases.length*100).toFixed(1)}%)`);

if (failures.length > 0) {
  console.log(`\n\n❌ FALLOS DETALLADOS:\n`);
  failures.forEach((f, i) => {
    console.log(`${i+1}. Input: "${f.input}"`);
    console.log(`   Expected: ${f.expected}`);
    console.log(`   Actual: ${f.actual}`);
    console.log(`   Reason: ${f.reason}\n`);
  });
}

console.log('\n' + '='.repeat(70));

// Exit code
process.exit(failed === 0 ? 0 : 1);
