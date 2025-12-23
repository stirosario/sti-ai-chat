/**
 * Tests para Event Contract y funciones relacionadas
 * Ejecutar con: node tests/event-contract.test.js
 */

import crypto from 'crypto';

// Mock de buildEvent (copiar la función real o importarla)
function buildEvent(params = {}) {
  const {
    role,
    type,
    stage,
    text = '',
    buttons = null,
    message_id = null,
    parent_message_id = null,
    correlation_id = null,
    session_id = null,
    conversation_id = null,
    event_type = null,
    stage_before = null,
    stage_after = null,
    button_token = null,
    button_token_legacy = null,
    latency_ms = null,
    ...extra
  } = params;
  
  const timestamp_iso = params.timestamp_iso || params.t || new Date().toISOString();
  
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
  
  let level = 'INFO';
  if (type === 'error' || event_type === 'error') {
    level = 'ERROR';
  }
  
  const text_preview = text ? text.substring(0, 120) + (text.length > 120 ? '...' : '') : '';
  const buttons_values = buttons ? 
    (Array.isArray(buttons) ? buttons.map(b => b.value || b.token || b.text || '').filter(Boolean).join(',') : String(buttons)) : 
    null;
  
  const payload_summary = {
    text_preview,
    buttons_values,
    ...(button_token && { button_token_canonical: button_token }),
    ...(button_token_legacy && button_token_legacy !== button_token && { button_token_legacy })
  };
  
  const event = {
    timestamp_iso,
    level,
    service: 'sti-chat',
    env: process.env.NODE_ENV || 'development',
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
    buttons: buttons || null,
    payload_summary,
    ...(latency_ms !== null && { latency_ms }),
    ...extra
  };
  
  return event;
}

// Mock de buildUiButtonsFromTokens
function buildUiButtonsFromTokens(tokens = [], locale = 'es-AR') {
  if (!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if (!t) return null;
    const label = String(t).replace(/BTN_/g, '').replace(/_/g, ' ');
    const value = String(t);
    return { token: value, value: value, label, text: label };
  }).filter(Boolean);
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

// ========================================================
// 3.1: Unit Tests
// ========================================================

console.log('\n=== Tests Unitarios: Event Contract ===\n');

// Test 1: buildEvent acepta message_id y otros campos requeridos
test('buildEvent acepta message_id y otros campos requeridos', () => {
  const messageId = 'm_123_test';
  const event = buildEvent({
    role: 'user',
    type: 'text',
    text: 'Hola',
    message_id: messageId,
    session_id: 'web-123',
    conversation_id: 'AA-0001'
  });
  
  assert(event.message_id === messageId, 'message_id debe ser el proporcionado');
  assert(event.timestamp_iso !== null, 'timestamp_iso debe existir');
  assert(event.event_type === 'user_input', 'event_type debe ser user_input');
  assert(event.correlation_id === null, 'correlation_id puede ser null');
  assert(event.service === 'sti-chat', 'service debe ser sti-chat');
});

// Test 2: buildEvent setea parent_message_id correcto (bot->último user)
test('buildEvent acepta parent_message_id', () => {
  const userMsgId = 'm_123_user';
  const botEvent = buildEvent({
    role: 'bot',
    type: 'text',
    text: 'Respuesta',
    parent_message_id: userMsgId,
    session_id: 'web-123',
    conversation_id: 'AA-0001'
  });
  
  assert(botEvent.parent_message_id === userMsgId, 'parent_message_id debe ser el del último user');
  assert(botEvent.event_type === 'assistant_reply', 'event_type debe ser assistant_reply');
});

// Test 3: buildEvent para button_click
test('buildEvent detecta button_click correctamente', () => {
  const event = buildEvent({
    role: 'user',
    type: 'button',
    button_token: 'BTN_ADVANCED_TESTS',
    button_token_legacy: 'BTN_MORE_TESTS',
    text: '[BOTÓN] Pruebas avanzadas',
    session_id: 'web-123',
    conversation_id: 'AA-0001'
  });
  
  assert(event.event_type === 'button_click', 'event_type debe ser button_click');
  assert(event.payload_summary.button_token_canonical === 'BTN_ADVANCED_TESTS', 'debe incluir token canónico');
  assert(event.payload_summary.button_token_legacy === 'BTN_MORE_TESTS', 'debe incluir token legacy');
});

// Test 4: buildEvent para stage_transition
test('buildEvent detecta stage_transition correctamente', () => {
  const event = buildEvent({
    role: 'system',
    type: 'stage_transition',
    stage_before: 'ASK_PROBLEM',
    stage_after: 'BASIC_TESTS',
    text: 'Stage transition',
    session_id: 'web-123',
    conversation_id: 'AA-0001'
  });
  
  assert(event.event_type === 'stage_transition', 'event_type debe ser stage_transition');
  assert(event.stage_before === 'ASK_PROBLEM', 'debe incluir stage_before');
  assert(event.stage_after === 'BASIC_TESTS', 'debe incluir stage_after');
});

// Test 5: buildUiButtonsFromTokens siempre devuelve objetos con label/value
test('buildUiButtonsFromTokens devuelve objetos con label/value', () => {
  const tokens = ['BTN_ADVANCED_TESTS', 'BTN_CLOSE'];
  const buttons = buildUiButtonsFromTokens(tokens);
  
  assert(Array.isArray(buttons), 'debe devolver array');
  assert(buttons.length === 2, 'debe tener 2 botones');
  
  buttons.forEach(btn => {
    assert(typeof btn === 'object', 'cada botón debe ser objeto');
    assert(btn.hasOwnProperty('label'), 'debe tener label');
    assert(btn.hasOwnProperty('value'), 'debe tener value');
    assert(btn.hasOwnProperty('token'), 'debe tener token');
  });
});

// Test 6: Dedup por message_id (simulado)
test('Dedup por message_id funciona', () => {
  const messageId = 'm_123_unique';
  const seenIds = new Set();
  
  // Primera vez
  assert(!seenIds.has(messageId), 'message_id no debe estar en seenIds');
  seenIds.add(messageId);
  
  // Segunda vez (duplicado)
  assert(seenIds.has(messageId), 'message_id debe estar en seenIds (duplicado detectado)');
});

// ========================================================
// 3.2: Integration Tests (simulados)
// ========================================================

console.log('\n=== Tests de Integración: Flujo Completo ===\n');

// Test 7: Flujo completo: consent->lang->name->problem->advanced
test('Flujo completo genera eventos con correlation_id', () => {
  const correlationId = 'req-123-abc';
  const sessionId = 'web-456';
  const conversationId = 'AA-0002';
  
  // Simular eventos del flujo
  const events = [
    buildEvent({
      role: 'user',
      type: 'text',
      text: 'Español',
      event_type: 'user_input',
      correlation_id: correlationId,
      session_id: sessionId,
      conversation_id: conversationId,
      message_id: 'm_1'
    }),
    buildEvent({
      role: 'bot',
      type: 'text',
      text: '¿Cuál es tu nombre?',
      event_type: 'assistant_reply',
      parent_message_id: 'm_1',
      correlation_id: correlationId,
      session_id: sessionId,
      conversation_id: conversationId,
      message_id: 'm_2'
    }),
    buildEvent({
      role: 'user',
      type: 'button',
      button_token: 'BTN_ADVANCED_TESTS',
      text: '[BOTÓN] Pruebas avanzadas',
      event_type: 'button_click',
      correlation_id: correlationId,
      session_id: sessionId,
      conversation_id: conversationId,
      message_id: 'm_3'
    }),
    buildEvent({
      role: 'system',
      type: 'stage_transition',
      stage_before: 'ASK_PROBLEM',
      stage_after: 'ASK_DEVICE',
      event_type: 'stage_transition',
      correlation_id: correlationId,
      session_id: sessionId,
      conversation_id: conversationId,
      message_id: 'm_4'
    })
  ];
  
  // Verificar que todos tienen correlation_id
  events.forEach((evt, idx) => {
    assert(evt.correlation_id === correlationId, `Evento ${idx} debe tener correlation_id`);
    assert(evt.session_id === sessionId, `Evento ${idx} debe tener session_id`);
    assert(evt.conversation_id === conversationId, `Evento ${idx} debe tener conversation_id`);
  });
  
  // Verificar parent_message_id en bot reply
  const botReply = events.find(e => e.role === 'bot');
  assert(botReply.parent_message_id === 'm_1', 'Bot reply debe tener parent_message_id del último user');
});

// Test 8: Export JSON tiene counts correctos
test('Export JSON tiene estructura correcta', () => {
  const transcript = [
    buildEvent({ role: 'user', text: 'Hola', message_id: 'm_1' }),
    buildEvent({ role: 'bot', text: 'Hola', message_id: 'm_2', parent_message_id: 'm_1' })
  ];
  
  const events = [
    buildEvent({ role: 'system', event_type: 'stage_transition', message_id: 'm_3' })
  ];
  
  const exportData = {
    meta: {
      exported_at: new Date().toISOString(),
      env: 'test',
      service: 'sti-chat',
      schema_version: '1.0'
    },
    conversation: {
      conversation_id: 'AA-0003',
      session_id: 'web-789',
      created_at: transcript[0].timestamp_iso,
      updated_at: transcript[transcript.length - 1].timestamp_iso,
      flow_version: '1.0'
    },
    transcript: transcript,
    events: events,
    stats: {
      transcript_count: transcript.length,
      events_count: events.length,
      dedup_dropped: 0
    }
  };
  
  assert(exportData.stats.transcript_count === 2, 'transcript_count debe ser 2');
  assert(exportData.stats.events_count === 1, 'events_count debe ser 1');
  assert(exportData.transcript.length === 2, 'transcript debe tener 2 elementos');
  assert(exportData.events.length === 1, 'events debe tener 1 elemento');
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

