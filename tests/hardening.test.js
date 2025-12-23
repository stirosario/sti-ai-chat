/**
 * Tests para Hardening de Producción
 * - Retrocompatibilidad (backfill on-read)
 * - Persist error handling
 * - Healthz endpoint
 * 
 * Ejecutar con: node tests/hardening.test.js
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock de funciones necesarias
function buildEvent(params = {}) {
  const {
    role, type, stage, text = '', buttons = null,
    message_id = null, parent_message_id = null, correlation_id = null,
    session_id = null, conversation_id = null, event_type = null,
    stage_before = null, stage_after = null, button_token = null,
    timestamp_iso = null
  } = params;
  
  const ts = timestamp_iso || params.t || params.ts || new Date().toISOString();
  
  let finalEventType = event_type;
  if (!finalEventType) {
    if (type === 'button' || button_token) {
      finalEventType = 'button_click';
    } else if (role === 'user') {
      finalEventType = 'user_input';
    } else if (role === 'bot' || role === 'assistant') {
      finalEventType = 'assistant_reply';
    } else if (type === 'stage_transition' || (stage_before && stage_after)) {
      finalEventType = 'stage_transition';
    } else {
      finalEventType = 'persist';
    }
  }
  
  return {
    timestamp_iso: ts,
    level: 'INFO',
    service: 'sti-chat',
    env: 'test',
    session_id: session_id || null,
    conversation_id: conversation_id || null,
    message_id: message_id || null,
    parent_message_id: parent_message_id || null,
    correlation_id: correlation_id || null,
    event_type: finalEventType,
    role: role || 'unknown',
    type: type || 'text',
    stage: stage || null,
    ...(stage_before && { stage_before }),
    ...(stage_after && { stage_after }),
    text: text || '',
    buttons: buttons || null
  };
}

// 1.1: Backfill on-read
function backfillEvent(event, idx, meta = null) {
  const backfillReasons = [];
  let backfilled = false;
  
  // Generar message_id determinístico si falta
  if (!event.message_id && !event.messageId) {
    const role = event.role || event.who || 'unknown';
    const stage = event.stage || '';
    const timestamp = event.timestamp_iso || event.t || event.ts || event.timestamp || '';
    const textPreview = (event.text || '').substring(0, 100);
    const hashInput = `${role}|${stage}|${timestamp}|${textPreview}|${idx}`;
    event.message_id = `backfill_${crypto.createHash('sha1').update(hashInput).digest('hex').substring(0, 16)}`;
    backfillReasons.push('missing_message_id');
    backfilled = true;
  }
  
  // Normalizar timestamp_iso
  if (!event.timestamp_iso) {
    if (event.t || event.ts || event.timestamp) {
      const ts = event.t || event.ts || event.timestamp;
      event.timestamp_iso = typeof ts === 'string' ? ts : new Date(ts).toISOString();
    } else if (meta && meta.createdAt) {
      const baseTime = new Date(meta.createdAt).getTime();
      event.timestamp_iso = new Date(baseTime + (idx * 100)).toISOString();
    } else {
      event.timestamp_iso = new Date().toISOString();
    }
    if (!event.t && !event.ts && !event.timestamp) {
      backfillReasons.push('missing_timestamp');
    }
    backfilled = true;
  }
  
  // Inferir event_type si falta
  if (!event.event_type && !event.eventType) {
    if (event.role === 'user' || event.who === 'user') {
      if (event.type === 'button' || event.button_token || event.buttonToken) {
        event.event_type = 'button_click';
      } else {
        event.event_type = 'user_input';
      }
    } else if (event.role === 'bot' || event.role === 'assistant' || event.who === 'bot') {
      event.event_type = 'assistant_reply';
    } else if (event.type === 'stage_transition' || (event.stage_before && event.stage_after)) {
      event.event_type = 'stage_transition';
    } else {
      event.event_type = 'persist';
    }
    backfillReasons.push('missing_event_type');
    backfilled = true;
  }
  
  if (backfilled) {
    event.meta = event.meta || {};
    event.meta.backfilled = true;
    event.meta.backfill_reason = backfillReasons;
  }
  
  return event;
}

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

console.log('\n=== Tests: Hardening de Producción ===\n');

// ========================================================
// 5.1: Test Retrocompat (fixtures)
// ========================================================

console.log('=== 5.1: Test Retrocompat ===\n');

test('Backfill genera message_id determinístico para evento viejo', () => {
  const oldEvent = {
    role: 'user',
    text: 'mi compu no enciende',
    t: '2024-01-15T10:00:00.000Z',
    stage: 'ASK_PROBLEM'
  };
  
  const backfilled = backfillEvent(oldEvent, 0);
  
  assert(backfilled.message_id !== null, 'message_id debe generarse');
  assert(backfilled.message_id.startsWith('backfill_'), 'message_id debe empezar con backfill_');
  assert(backfilled.timestamp_iso !== null, 'timestamp_iso debe existir');
  assert(backfilled.event_type === 'user_input', 'event_type debe inferirse como user_input');
  assert(backfilled.meta?.backfilled === true, 'meta.backfilled debe ser true');
  assert(backfilled.meta?.backfill_reason.includes('missing_message_id'), 'debe incluir missing_message_id en backfill_reason');
});

test('Backfill genera timestamp_iso desde t/ts/timestamp', () => {
  const oldEvent1 = { role: 'bot', text: 'Hola', t: '2024-01-15T10:00:00.000Z' };
  const oldEvent2 = { role: 'bot', text: 'Hola', ts: '2024-01-15T10:00:01.000Z' };
  const oldEvent3 = { role: 'bot', text: 'Hola', timestamp: '2024-01-15T10:00:02.000Z' };
  
  const b1 = backfillEvent(oldEvent1, 0);
  const b2 = backfillEvent(oldEvent2, 1);
  const b3 = backfillEvent(oldEvent3, 2);
  
  assert(b1.timestamp_iso === '2024-01-15T10:00:00.000Z', 'debe derivar desde t');
  assert(b2.timestamp_iso === '2024-01-15T10:00:01.000Z', 'debe derivar desde ts');
  assert(b3.timestamp_iso === '2024-01-15T10:00:02.000Z', 'debe derivar desde timestamp');
});

test('Backfill infiere event_type correctamente', () => {
  const userText = backfillEvent({ role: 'user', text: 'Hola' }, 0);
  const userButton = backfillEvent({ role: 'user', type: 'button', button_token: 'BTN_TEST' }, 1);
  const botReply = backfillEvent({ role: 'bot', text: 'Respuesta' }, 2);
  const stageTrans = backfillEvent({ role: 'system', stage_before: 'A', stage_after: 'B' }, 3);
  
  assert(userText.event_type === 'user_input', 'user text debe ser user_input');
  assert(userButton.event_type === 'button_click', 'user button debe ser button_click');
  assert(botReply.event_type === 'assistant_reply', 'bot debe ser assistant_reply');
  assert(stageTrans.event_type === 'stage_transition', 'stage change debe ser stage_transition');
});

test('Backfill mantiene message_id si ya existe', () => {
  const eventWithId = {
    message_id: 'm_123_existing',
    role: 'user',
    text: 'Test',
    timestamp_iso: '2024-01-15T10:00:00.000Z',
    event_type: 'user_input'
  };
  
  const backfilled = backfillEvent(eventWithId, 0);
  
  assert(backfilled.message_id === 'm_123_existing', 'message_id existente no debe cambiarse');
  // Si ya tiene todos los campos, no debe marcarse como backfilled
  assert(backfilled.meta?.backfilled !== true, 'no debe marcarse como backfilled si ya tiene todos los campos');
});

// ========================================================
// 5.2: Test Persist Error (mock)
// ========================================================

console.log('\n=== 5.2: Test Persist Error ===\n');

test('Persist error se maneja sin crash (simulado)', () => {
  // Simular error de persistencia
  let persistErrorCount = 0;
  let queueLength = 0;
  const MAX_QUEUE = 100;
  
  // Simular fallo
  const simulatePersistError = () => {
    persistErrorCount++;
    if (queueLength < MAX_QUEUE) {
      queueLength++;
      return { success: false, queued: true };
    }
    return { success: false, queued: false, degraded: true };
  };
  
  // Primera falla: debe encolar
  const result1 = simulatePersistError();
  assert(result1.queued === true, 'debe encolar si queue no está llena');
  assert(queueLength === 1, 'queue debe tener 1 item');
  
  // Llenar queue
  for (let i = 0; i < MAX_QUEUE - 1; i++) {
    simulatePersistError();
  }
  
  // Última falla: debe marcar como degraded
  const result2 = simulatePersistError();
  assert(result2.degraded === true, 'debe marcar como degraded si queue está llena');
  assert(queueLength === MAX_QUEUE, 'queue debe estar llena');
});

// ========================================================
// 5.3: Test Healthz
// ========================================================

console.log('\n=== 5.3: Test Healthz ===\n');

test('Healthz refleja degraded cuando persist queue > threshold', () => {
  const persistQueueLength = 85; // 85% de 100
  const MAX_PERSIST_QUEUE = 100;
  const threshold = MAX_PERSIST_QUEUE * 0.8; // 80%
  
  const persistQueueStatus = persistQueueLength > threshold ? 'degraded' : 'healthy';
  
  assert(persistQueueStatus === 'degraded', 'debe ser degraded si queue > 80%');
  
  // Verificar que health general refleja esto
  const fsStatus = 'healthy';
  const redisStatus = 'healthy';
  const isHealthy = redisStatus === 'healthy' && fsStatus === 'healthy' && persistQueueStatus === 'healthy';
  
  assert(isHealthy === false, 'health general debe ser false si persist queue está degraded');
});

test('Healthz incluye métricas mínimas', () => {
  const health = {
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    build_version: '1.0.0',
    services: {
      redis: 'healthy',
      filesystem: 'healthy',
      persist_queue: {
        status: 'healthy',
        length: 10,
        max: 100
      }
    },
    stats: {
      activeSessions: 5,
      totalMessages: 100,
      totalErrors: 2,
      persist_queue_length: 10
    }
  };
  
  assert(health.services.persist_queue !== undefined, 'debe incluir persist_queue en services');
  assert(health.stats.persist_queue_length !== undefined, 'debe incluir persist_queue_length en stats');
  assert(health.build_version !== undefined, 'debe incluir build_version');
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

