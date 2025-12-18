/**
 * Script de prueba: Path Traversal en /api/images
 * Verifica que el endpoint bloquea intentos de path traversal
 */

import fetch from 'node-fetch';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const LOG_TOKEN = process.env.LOG_TOKEN || '319d90a7d481f6574d37e9685ca1abf164989b7bb5e394962f03f02cd5858cfc';

// IDs de prueba (formato válido)
const TEST_CONV_ID = 'AA0001';
const TEST_FILENAME = 'test.jpg';

// Casos de prueba de path traversal
const traversalTests = [
  {
    name: 'Path traversal básico (../)',
    conversationId: TEST_CONV_ID,
    filename: '../server.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando ../'
  },
  {
    name: 'Path traversal URL encoded (%2e%2e%2f)',
    conversationId: TEST_CONV_ID,
    filename: '%2e%2e%2fserver.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando %2e%2e%2f'
  },
  {
    name: 'Path traversal doble (../../)',
    conversationId: TEST_CONV_ID,
    filename: '../../server.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando ../../'
  },
  {
    name: 'Path traversal con barra inicial (/../)',
    conversationId: TEST_CONV_ID,
    filename: '/../server.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando /../'
  },
  {
    name: 'Path traversal con null byte',
    conversationId: TEST_CONV_ID,
    filename: '../server.js%00.jpg',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando null byte'
  },
  {
    name: 'Path traversal con caracteres especiales',
    conversationId: TEST_CONV_ID,
    filename: '..\\server.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando backslash'
  },
  {
    name: 'Path traversal con múltiples niveles',
    conversationId: TEST_CONV_ID,
    filename: '../../../server.js',
    expectedStatus: [400, 403],
    description: 'Intento de leer server.js usando múltiples niveles'
  },
  {
    name: 'Path traversal con nombre de archivo válido pero path inválido',
    conversationId: TEST_CONV_ID,
    filename: '../test.jpg',
    expectedStatus: [400, 403],
    description: 'Intento de leer archivo fuera del directorio permitido'
  }
];

// Caso de prueba positivo (debe funcionar si el archivo existe)
const positiveTest = {
  name: 'Acceso válido a imagen',
  conversationId: TEST_CONV_ID,
  filename: TEST_FILENAME,
  expectedStatus: [200, 404], // 200 si existe, 404 si no (ambos válidos)
  description: 'Acceso válido a imagen dentro del directorio permitido'
};

async function testPathTraversal() {
  console.log('🧪 Iniciando prueba de Path Traversal en /api/images...\n');
  console.log(`🌐 Servidor: ${SERVER_URL}\n`);
  
  let passed = 0;
  let failed = 0;
  const results = [];
  
  // Ejecutar pruebas de traversal
  console.log('📋 Ejecutando pruebas de Path Traversal (deben bloquearse):\n');
  
  for (const test of traversalTests) {
    try {
      const url = `${SERVER_URL}/api/images/${test.conversationId}/${encodeURIComponent(test.filename)}?token=${LOG_TOKEN}`;
      console.log(`  🔍 ${test.name}...`);
      
      const response = await fetch(url, { method: 'GET' });
      const status = response.status;
      
      const isBlocked = test.expectedStatus.includes(status);
      
      if (isBlocked) {
        console.log(`    ✅ BLOQUEADO (status: ${status})`);
        passed++;
        results.push({ test: test.name, status: 'PASS', statusCode: status });
      } else {
        console.log(`    ❌ NO BLOQUEADO (status: ${status}, esperado: ${test.expectedStatus.join(' o ')})`);
        failed++;
        results.push({ test: test.name, status: 'FAIL', statusCode: status, expected: test.expectedStatus });
      }
    } catch (err) {
      console.log(`    ⚠️  ERROR: ${err.message}`);
      failed++;
      results.push({ test: test.name, status: 'ERROR', error: err.message });
    }
  }
  
  // Ejecutar prueba positiva
  console.log('\n📋 Ejecutando prueba positiva (acceso válido):\n');
  try {
    const url = `${SERVER_URL}/api/images/${positiveTest.conversationId}/${encodeURIComponent(positiveTest.filename)}?token=${LOG_TOKEN}`;
    console.log(`  🔍 ${positiveTest.name}...`);
    
    const response = await fetch(url, { method: 'GET' });
    const status = response.status;
    
    const isValid = positiveTest.expectedStatus.includes(status);
    
    if (isValid) {
      console.log(`    ✅ ACCESO VÁLIDO (status: ${status})`);
      passed++;
      results.push({ test: positiveTest.name, status: 'PASS', statusCode: status });
    } else {
      console.log(`    ⚠️  Status inesperado (status: ${status}, esperado: ${positiveTest.expectedStatus.join(' o ')})`);
      // No contar como fallo porque puede que el archivo no exista
      results.push({ test: positiveTest.name, status: 'WARN', statusCode: status });
    }
  } catch (err) {
    console.log(`    ⚠️  ERROR: ${err.message}`);
    results.push({ test: positiveTest.name, status: 'ERROR', error: err.message });
  }
  
  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN:');
  console.log('='.repeat(60));
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${r.test}: ${r.status}${r.statusCode ? ` (${r.statusCode})` : ''}${r.error ? ` - ${r.error}` : ''}`);
  });
  
  console.log(`\n  Total pruebas: ${results.length}`);
  console.log(`  ✅ Pasadas: ${passed}`);
  console.log(`  ❌ Fallidas: ${failed}`);
  console.log(`  ⚠️  Advertencias: ${results.filter(r => r.status === 'WARN' || r.status === 'ERROR').length}`);
  
  const allTraversalBlocked = traversalTests.every((test, idx) => {
    const result = results[idx];
    return result && result.status === 'PASS';
  });
  
  console.log(`\n  ${allTraversalBlocked ? '✅' : '❌'} RESULTADO FINAL: ${allTraversalBlocked ? 'PASS (todos los traversal bloqueados)' : 'FAIL (algunos traversal no bloqueados)'}`);
  
  process.exit(allTraversalBlocked ? 0 : 1);
}

// Ejecutar prueba
testPathTraversal().catch(err => {
  console.error('❌ Error fatal en prueba:', err);
  process.exit(1);
});

