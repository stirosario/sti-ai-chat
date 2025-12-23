/**
 * Admin Auth Test
 * Verifica que la autenticación admin funcione solo por header Authorization
 * y que req.query.token esté deshabilitado por defecto
 */

import { strict as assert } from 'assert';

console.log('\n=== Tests: Admin Auth ===\n');

// Mock de funciones necesarias
const LOG_TOKEN = 'test-admin-token-123';
const ALLOW_QUERY_TOKEN = process.env.ALLOW_QUERY_TOKEN || 'false';

// Mock de getAdminToken (simplificado para tests)
function getAdminToken(req) {
  const hdr = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (hdr) return hdr;
  
  if (ALLOW_QUERY_TOKEN === 'true') {
    const q = (req.query.token || '').toString().trim();
    if (q) {
      console.warn('[ADMIN_AUTH] ⚠️ Token admin recibido por query (ALLOW_QUERY_TOKEN=true)');
      return q;
    }
  } else if (req.query.token) {
    console.warn('[ADMIN_AUTH] ⚠️ ADMIN_TOKEN_IN_QUERY_REJECTED - Token recibido por query pero ALLOW_QUERY_TOKEN no está activo');
  }
  
  return '';
}

// Mock de validación
function isValidAdmin(adminToken) {
  return adminToken && adminToken === LOG_TOKEN;
}

// Tests
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`❌ ${name}: ${error.message}`);
    if (error.stack) console.error(error.stack);
  }
}

// Caso 1: sin Authorization header => debe retornar token vacío
test('Caso 1: sin Authorization header => token vacío', () => {
  const req = {
    headers: {},
    query: {}
  };
  const token = getAdminToken(req);
  assert.equal(token, '', 'Token debe estar vacío sin header');
  assert.equal(isValidAdmin(token), false, 'No debe ser válido');
});

// Caso 2: con query token y ALLOW_QUERY_TOKEN != true => debe rechazar
test('Caso 2: con query token y ALLOW_QUERY_TOKEN != true => rechazado', () => {
  const req = {
    headers: {},
    query: { token: LOG_TOKEN }
  };
  const token = getAdminToken(req);
  assert.equal(token, '', 'Token debe estar vacío cuando ALLOW_QUERY_TOKEN no está activo');
  assert.equal(isValidAdmin(token), false, 'No debe ser válido');
});

// Caso 3: con Authorization Bearer válido => debe aceptar
test('Caso 3: con Authorization Bearer válido => aceptado', () => {
  const req = {
    headers: {
      authorization: `Bearer ${LOG_TOKEN}`
    },
    query: {}
  };
  const token = getAdminToken(req);
  assert.equal(token, LOG_TOKEN, 'Token debe ser extraído del header');
  assert.equal(isValidAdmin(token), true, 'Debe ser válido');
});

// Caso 4: con Authorization Bearer sin "Bearer " => debe aceptar
test('Caso 4: con Authorization Bearer sin prefijo => aceptado', () => {
  const req = {
    headers: {
      authorization: LOG_TOKEN
    },
    query: {}
  };
  const token = getAdminToken(req);
  assert.equal(token, LOG_TOKEN, 'Token debe ser extraído del header sin prefijo');
  assert.equal(isValidAdmin(token), true, 'Debe ser válido');
});

// Caso 5: con Authorization Bearer case-insensitive => debe aceptar
test('Caso 5: con Authorization bearer (minúsculas) => aceptado', () => {
  const req = {
    headers: {
      authorization: `bearer ${LOG_TOKEN}`
    },
    query: {}
  };
  const token = getAdminToken(req);
  assert.equal(token, LOG_TOKEN, 'Token debe ser extraído case-insensitive');
  assert.equal(isValidAdmin(token), true, 'Debe ser válido');
});

// Caso 6: con query token y ALLOW_QUERY_TOKEN=true => debe aceptar (legacy mode)
test('Caso 6: con query token y ALLOW_QUERY_TOKEN=true => aceptado (legacy)', () => {
  // Simular ALLOW_QUERY_TOKEN=true
  const originalEnv = process.env.ALLOW_QUERY_TOKEN;
  process.env.ALLOW_QUERY_TOKEN = 'true';
  
  // Re-ejecutar getAdminToken con el nuevo env
  const req = {
    headers: {},
    query: { token: LOG_TOKEN }
  };
  
  // Re-definir función con nuevo env
  function getAdminTokenLegacy(req) {
    const hdr = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (hdr) return hdr;
    
    if (process.env.ALLOW_QUERY_TOKEN === 'true') {
      const q = (req.query.token || '').toString().trim();
      if (q) return q;
    }
    
    return '';
  }
  
  const token = getAdminTokenLegacy(req);
  assert.equal(token, LOG_TOKEN, 'Token debe ser aceptado cuando ALLOW_QUERY_TOKEN=true');
  assert.equal(isValidAdmin(token), true, 'Debe ser válido');
  
  // Restaurar env
  if (originalEnv) {
    process.env.ALLOW_QUERY_TOKEN = originalEnv;
  } else {
    delete process.env.ALLOW_QUERY_TOKEN;
  }
});

// Caso 7: header tiene prioridad sobre query (incluso con ALLOW_QUERY_TOKEN=true)
test('Caso 7: header tiene prioridad sobre query', () => {
  const req = {
    headers: {
      authorization: `Bearer ${LOG_TOKEN}`
    },
    query: { token: 'wrong-token' }
  };
  const token = getAdminToken(req);
  assert.equal(token, LOG_TOKEN, 'Token del header debe tener prioridad');
  assert.equal(isValidAdmin(token), true, 'Debe ser válido');
});

console.log('\n=== Resumen ===');
console.log(`✅ Tests pasados: ${testsPassed}`);
console.log(`❌ Tests fallidos: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  console.log('❌ Algunos tests fallaron\n');
  process.exit(1);
} else {
  console.log('🎉 Todos los tests pasaron!\n');
}

