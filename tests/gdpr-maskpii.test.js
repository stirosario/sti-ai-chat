/**
 * gdpr-maskpii.test.js
 * Test GDPR - Validación de maskPII
 * 
 * Valida que datos sensibles se enmascaran correctamente
 */

import { maskPII } from '../flowLogger.js';

console.log('\n🔐 ============================================');
console.log('   TEST GDPR - maskPII');
console.log('============================================\n');

// Test 1: Datos sensibles
console.log('📋 TEST 1: Enmascarar datos sensibles\n');

const sensitiveCases = [
  ['Mi email es test@example.com', '[EMAIL_REDACTED]', 'Email'],
  ['Mi tarjeta es 4532-1488-0343-6467', '[CARD_REDACTED]', 'Tarjeta'],
  ['Mi DNI es 12345678', '[DNI_REDACTED]', 'DNI'],
  ['Mi teléfono es +54 9 341 5551234', '[PHONE_REDACTED]', 'Teléfono'],
  ['password=secreto123', '[PASSWORD_REDACTED]', 'Contraseña'],
  ['Mi IP es 192.168.1.100', '[IP_REDACTED]', 'IP']
];

let passed = 0;
for (const [input, expected, desc] of sensitiveCases) {
  const masked = maskPII(input);
  if (masked.includes(expected)) {
    console.log(`✅ ${desc}`);
    passed++;
  } else {
    console.error(`❌ ${desc} FAILED`);
    console.error(`   Input: ${input}`);
    console.error(`   Output: ${masked}\n`);
    process.exit(1);
  }
}

console.log(`\n📊 ${passed}/${sensitiveCases.length} tests pasados\n`);

// Test 2: Texto normal
console.log('📋 TEST 2: Preservar texto normal\n');

const normalCases = [
  'Hola, mi compu no prende',
  'El problema es que la pantalla está negra',
  'Ya probé reiniciar el router'
];

let normalPassed = 0;
for (const text of normalCases) {
  const masked = maskPII(text);
  if (masked === text) {
    console.log(`✅ Preservado: "${text.substring(0, 40)}"`);
    normalPassed++;
  } else {
    console.error(`❌ Texto normal modificado: ${text}\n`);
    process.exit(1);
  }
}

console.log(`\n📊 ${normalPassed}/${normalCases.length} tests pasados\n`);

// Resumen
console.log('\n🎉 ============================================');
console.log('   TODOS LOS TESTS PASARON');
console.log('============================================\n');

const total = sensitiveCases.length + normalCases.length;
const totalPassed = passed + normalPassed;

console.log(`📊 Total: ${totalPassed}/${total} tests (100%)`);
console.log('🔒 maskPII FUNCIONAL para GDPR\n');

process.exit(0);
