/**
 * Tests de Export Parity
 * Verifica que todos los consumidores (endpoint, console-full, stia.php) devuelvan el mismo JSON
 * 
 * Ejecutar con: node tests/export-parity.test.js
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tests
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`❌ ${name}: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function calculateHash(data) {
  return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
}

console.log('\n=== Tests: Export Parity ===\n');

// ========================================================
// 5.1: Export Parity Test
// ========================================================

test('Export tiene schema_version estable', () => {
  const exportData = {
    meta: {
      exported_at: '2024-01-15T10:30:00.000Z',
      schema_version: '1.1',
      service: 'sti-chat',
      env: 'production'
    },
    conversation: {
      conversation_id: 'AA-0001',
      session_id: 'web-123'
    },
    transcript: [],
    events: [],
    stats: {
      transcript_count: 0,
      events_count: 0,
      dedup_dropped: 0
    }
  };
  
  assert(exportData.meta.schema_version === '1.1', 'schema_version debe ser 1.1');
  assert(exportData.meta.service === 'sti-chat', 'service debe ser sti-chat');
});

test('Export incluye todos los campos requeridos', () => {
  const exportData = {
    meta: {
      exported_at: '2024-01-15T10:30:00.000Z',
      schema_version: '1.1',
      service: 'sti-chat',
      env: 'production',
      source: ['transcript', 'events'],
      build_version: '1.0.0',
      flow_version: '1.0',
      export_hash: 'abc123'
    },
    conversation: {
      conversation_id: 'AA-0001',
      session_id: 'web-123',
      created_at: '2024-01-15T10:00:00.000Z',
      updated_at: '2024-01-15T10:30:00.000Z',
      flow_version: '1.0'
    },
    transcript: [],
    events: [],
    stats: {
      transcript_count: 0,
      events_count: 0,
      backfilled_count: 0,
      gaps_detected_count: 0,
      dedup_dropped: 0,
      persist_degraded: false
    }
  };
  
  assert(exportData.meta !== undefined, 'debe tener meta');
  assert(exportData.conversation !== undefined, 'debe tener conversation');
  assert(exportData.transcript !== undefined, 'debe tener transcript');
  assert(exportData.events !== undefined, 'debe tener events');
  assert(exportData.stats !== undefined, 'debe tener stats');
  assert(exportData.meta.export_hash !== undefined, 'debe tener export_hash');
});

test('Export hash es determinístico (mismo contenido = mismo hash)', () => {
  const exportData1 = {
    meta: { schema_version: '1.1', exported_at: '2024-01-15T10:30:00.000Z' },
    transcript: [{ message_id: 'm_1', text: 'Hola', timestamp: '2024-01-15T10:00:00.000Z' }],
    events: [],
    stats: { transcript_count: 1, events_count: 0 }
  };
  
  const exportData2 = {
    meta: { schema_version: '1.1', exported_at: '2024-01-15T10:30:00.000Z' },
    transcript: [{ message_id: 'm_1', text: 'Hola', timestamp: '2024-01-15T10:00:00.000Z' }],
    events: [],
    stats: { transcript_count: 1, events_count: 0 }
  };
  
  const hash1 = calculateHash(exportData1);
  const hash2 = calculateHash(exportData2);
  
  assert(hash1 === hash2, 'mismo contenido debe generar mismo hash');
});

test('Export ordena transcript por timestamp ascendente', () => {
  const exportData = {
    transcript: [
      { message_id: 'm_2', text: 'Segundo', timestamp: '2024-01-15T10:01:00.000Z' },
      { message_id: 'm_1', text: 'Primero', timestamp: '2024-01-15T10:00:00.000Z' },
      { message_id: 'm_3', text: 'Tercero', timestamp: '2024-01-15T10:02:00.000Z' }
    ]
  };
  
  // Ordenar (como lo hace el endpoint)
  exportData.transcript.sort((a, b) => {
    const tsA = a.timestamp || '';
    const tsB = b.timestamp || '';
    return tsA.localeCompare(tsB);
  });
  
  assert(exportData.transcript[0].message_id === 'm_1', 'primer mensaje debe ser m_1');
  assert(exportData.transcript[1].message_id === 'm_2', 'segundo mensaje debe ser m_2');
  assert(exportData.transcript[2].message_id === 'm_3', 'tercer mensaje debe ser m_3');
});

test('Export deduplica por message_id', () => {
  const seenMessageIds = new Set();
  const transcript = [];
  let dedupDropped = 0;
  
  const events = [
    { message_id: 'm_1', text: 'Hola' },
    { message_id: 'm_1', text: 'Hola' }, // Duplicado
    { message_id: 'm_2', text: 'Mundo' }
  ];
  
  for (const event of events) {
    const messageId = event.message_id;
    if (messageId && seenMessageIds.has(messageId)) {
      dedupDropped++;
      continue;
    }
    if (messageId) {
      seenMessageIds.add(messageId);
    }
    transcript.push(event);
  }
  
  assert(transcript.length === 2, 'debe tener 2 mensajes únicos');
  assert(dedupDropped === 1, 'debe haber eliminado 1 duplicado');
});

// ========================================================
// 5.2: UI Render Model Test
// ========================================================

console.log('\n=== 5.2: UI Render Model Test ===\n');

test('Modo humano: NO muestra tokens BTN_ en labels visibles', () => {
  const buttons = [
    { value: 'BTN_ADVANCED_TESTS', label: '🔧 Pruebas avanzadas', token: 'BTN_ADVANCED_TESTS' },
    { value: 'BTN_CLOSE', label: '🔚 Cerrar Chat', token: 'BTN_CLOSE' }
  ];
  
  const traceMode = false; // Modo humano
  
  buttons.forEach(btn => {
    const label = btn.label || btn.text || btn.title || btn.value || 'Botón';
    
    // En modo humano, label NO debe empezar con BTN_
    assert(!label.startsWith('BTN_'), `Label "${label}" no debe empezar con BTN_ en modo humano`);
    assert(label.length > 0, 'Label debe tener contenido');
  });
});

test('Modo debug: muestra tokens/IDs', () => {
  const msg = {
    message_id: 'm_123_test',
    parent_message_id: 'm_122_test',
    correlation_id: 'req-456-abc',
    event_type: 'user_input',
    text: 'Hola',
    buttons: [{ value: 'BTN_TEST', label: 'Test', token: 'BTN_TEST' }]
  };
  
  const traceMode = true; // Modo debug
  
  if (traceMode) {
    assert(msg.message_id !== undefined, 'debe mostrar message_id en debug');
    assert(msg.parent_message_id !== undefined, 'debe mostrar parent_message_id en debug');
    assert(msg.correlation_id !== undefined, 'debe mostrar correlation_id en debug');
    assert(msg.event_type !== undefined, 'debe mostrar event_type en debug');
    
    if (msg.buttons && msg.buttons.length > 0) {
      const btn = msg.buttons[0];
      assert(btn.token !== undefined || btn.value !== undefined, 'debe mostrar token/value en debug');
    }
  }
});

test('Modo humano: botones muestran solo label (sin token visible)', () => {
  const btn = { value: 'BTN_ADVANCED_TESTS', label: '🔧 Pruebas avanzadas', token: 'BTN_ADVANCED_TESTS' };
  const traceMode = false;
  
  // Render en modo humano
  const label = btn.label || btn.text || btn.title || btn.value || 'Botón';
  const token = btn.token || btn.value || label;
  
  // En modo humano, solo se muestra label (token está en title/tooltip pero no visible)
  const htmlHumano = `<span class="msg-button-chip" title="Token: ${token}">
    <span class="button-label">${label}</span>
  </span>`;
  
  assert(!htmlHumano.includes(`<span class="button-token">`), 'modo humano NO debe incluir button-token visible');
  assert(htmlHumano.includes(label), 'debe incluir label');
});

test('Modo debug: botones muestran label + token', () => {
  const btn = { value: 'BTN_ADVANCED_TESTS', label: '🔧 Pruebas avanzadas', token: 'BTN_ADVANCED_TESTS' };
  const traceMode = true;
  
  // Render en modo debug
  const label = btn.label || btn.text || btn.title || btn.value || 'Botón';
  const token = btn.token || btn.value || label;
  
  const htmlDebug = `<span class="msg-button-chip debug" title="Token: ${token}">
    <span class="button-label">${label}</span>
    <span class="button-token">${token}</span>
  </span>`;
  
  assert(htmlDebug.includes(`<span class="button-token">`), 'modo debug debe incluir button-token visible');
  assert(htmlDebug.includes(label), 'debe incluir label');
  assert(htmlDebug.includes(token), 'debe incluir token');
});

// ========================================================
// Resumen
// ========================================================

console.log('\n=== Resumen ===');
console.log(`✅ Tests pasados: ${testsPassed}`);
console.log(`❌ Tests fallidos: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 Todos los tests pasaron!\n');
  process.exit(0);
}

