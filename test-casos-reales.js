/**
 * TEST E2E: Casos reales de usuarios (de las imágenes)
 * Valida detección correcta con servidor corriendo
 */

import { detectAmbiguousDevice } from './deviceDetection.js';

console.log('\n🧪 TEST E2E: Casos Reales de Usuarios\n');
console.log('='.repeat(70));

const realUserCases = [
  // IMAGEN 1
  {
    input: "El equipo no arranca, quedan luces prendidas y no da imagen",
    expectedCategory: 'computadora',
    expectedDevice: ['PC_DESKTOP', 'NOTEBOOK', 'ALL_IN_ONE'],
    description: 'Usuario describe problema técnico válido'
  },
  
  // IMAGEN 2
  {
    input: "Mi compu no arranca",
    expectedCategory: 'computadora',
    expectedDevice: ['PC_DESKTOP', 'NOTEBOOK', 'ALL_IN_ONE'],
    description: 'Término genérico "compu" debe detectar dispositivos'
  },
  
  // IMAGEN 3
  {
    input: "Mi pc de escritorio hace un ruido extraño",
    expectedCategory: 'computadora',
    expectedDevice: ['PC_DESKTOP'],
    description: 'Ya específico "pc de escritorio" - no necesita desambiguación'
  },
  
  // IMAGEN 4
  {
    input: "Mi impresora no imprime",
    expectedCategory: 'impresion',
    expectedDevice: ['IMPRESORA_LASER', 'IMPRESORA_INKJET', 'IMPRESORA_MULTIFUNCION', 'IMPRESORA_TERMICA'],
    description: 'Debe detectar dispositivos de impresión'
  },
  
  // IMAGEN 5
  {
    input: "No tengo Internet",
    expectedCategory: 'conectividad',
    expectedDevice: null, // No hay dispositivo específico, pero debe entender el problema
    description: 'Problema de conectividad válido'
  },
  
  // IMAGEN 6
  {
    input: "Windows no reconoce mi pen drive",
    expectedCategory: 'almacenamiento',
    expectedDevice: ['PENDRIVE'],
    description: '"pen drive" con espacio debe detectarse como PENDRIVE'
  }
];

let passed = 0;
let failed = 0;
const failures = [];

console.log(`\n📦 Ejecutando ${realUserCases.length} tests...\n`);

for (const test of realUserCases) {
  const result = detectAmbiguousDevice(test.input);
  
  console.log(`\n📝 INPUT: "${test.input}"`);
  console.log(`   Descripción: ${test.description}`);
  
  if (test.expectedDevice === null) {
    // Caso especial: no debe detectar dispositivo específico
    if (!result) {
      console.log(`   ✅ CORRECTO: No detectó dispositivo (como esperado)`);
      passed++;
    } else {
      console.log(`   ❌ INCORRECTO: Detectó dispositivo cuando no debería`);
      console.log(`      Detectado: ${result.term} → ${result.candidates.map(c => c.id).join(', ')}`);
      failed++;
      failures.push({
        input: test.input,
        expected: 'NO_DEVICE',
        actual: result.term,
        reason: 'Detectó dispositivo en caso de conectividad pura'
      });
    }
    continue;
  }
  
  if (!result) {
    console.log(`   ❌ FALLO: NO detectó dispositivo`);
    console.log(`      Esperado: ${test.expectedDevice.join(' o ')}`);
    failed++;
    failures.push({
      input: test.input,
      expected: test.expectedDevice.join('/'),
      actual: 'NO_DETECTION',
      reason: 'No se detectó ningún dispositivo'
    });
    continue;
  }
  
  // Verificar si el dispositivo detectado está en la lista esperada
  const detectedIds = result.candidates.map(c => c.id);
  const hasExpected = test.expectedDevice.some(id => detectedIds.includes(id));
  
  if (hasExpected) {
    console.log(`   ✅ CORRECTO: Detectó categoría correcta`);
    console.log(`      Term: "${result.term}"`);
    console.log(`      Candidates: ${detectedIds.join(', ')}`);
    
    if (result.bestMatch) {
      console.log(`      Best Match: ${result.bestMatch.label} (score: ${result.bestMatch.score})`);
    }
    
    passed++;
  } else {
    console.log(`   ❌ FALLO: Detectó categoría incorrecta`);
    console.log(`      Esperado: ${test.expectedDevice.join(' o ')}`);
    console.log(`      Actual: ${detectedIds.join(', ')}`);
    failed++;
    failures.push({
      input: test.input,
      expected: test.expectedDevice.join('/'),
      actual: detectedIds.join('/'),
      reason: 'Categoría de dispositivo incorrecta'
    });
  }
}

// Resumen
console.log('\n' + '='.repeat(70));
console.log(`\n📊 RESUMEN:`);
console.log(`✅ Passed: ${passed}/${realUserCases.length} (${(passed/realUserCases.length*100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failed}/${realUserCases.length} (${(failed/realUserCases.length*100).toFixed(1)}%)`);

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
