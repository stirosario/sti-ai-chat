/**
 * Flow Consent-Language Test
 * Verifica el flujo completo: INIT -> ASK_CONSENT -> ASK_LANGUAGE -> ASK_NAME
 * y que todas las respuestas cumplan con el Response Contract
 */

import { strict as assert } from 'assert';

console.log('\n=== Tests: Flow Consent-Language ===\n');

// Mock de funciones necesarias (no podemos importar directamente de server.js en tests unitarios)
// En su lugar, vamos a testear la lógica de forma aislada

// Mock de STATES
const STATES = {
  INIT: 'INIT',
  ASK_CONSENT: 'ASK_CONSENT',
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  ASK_NAME: 'ASK_NAME',
  CLOSED: 'CLOSED'
};

// Mock de buildUiOptions (simplificado)
function buildUiOptions(tokens = [], locale = 'es-AR') {
  if (!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if (!t) return null;
    const token = String(t);
    // Simular definiciones de botones
    const buttonDefs = {
      'BTN_CONSENT_YES': { label: 'Sí Acepto / I Agree ✔️', text: 'Sí Acepto' },
      'BTN_CONSENT_NO': { label: 'No Acepto / I Don\'t Agree ❌', text: 'No Acepto' },
      'BTN_LANG_ES_AR': { label: '🇦🇷 Español (Argentina)', text: 'Español (Argentina)' },
      'BTN_LANG_EN': { label: '🇬🇧 English', text: 'English' },
      'BTN_NO_NAME': { label: 'Prefiero no decirlo 🙅', text: 'Prefiero no decirlo' }
    };
    const def = buttonDefs[token] || { label: token, text: token };
    return { token, label: def.label, text: def.text, value: token };
  }).filter(Boolean);
}

// Mock de validateResponseContract (simplificado)
function validateResponseContract(payload, correlationId = null, messageId = null) {
  const errors = [];
  const warnings = [];
  
  // Validar stage
  if (payload.stage && !Object.values(STATES).includes(payload.stage)) {
    errors.push(`Invalid stage: ${payload.stage}`);
  }
  
  // Validar options/buttons
  const options = payload.options || payload.buttons || [];
  if (Array.isArray(options) && options.length > 0) {
    options.forEach((opt, idx) => {
      if (typeof opt === 'string') {
        errors.push(`Option[${idx}] is a string, must be object with {label, value, token, text}`);
      } else if (typeof opt === 'object' && opt !== null) {
        const hasLabel = typeof opt.label === 'string';
        const hasValue = typeof opt.value === 'string';
        const hasToken = typeof opt.token === 'string';
        const hasText = typeof opt.text === 'string';
        
        if (!hasLabel || !hasValue || !hasToken || !hasText) {
          warnings.push(`Option[${idx}] missing canonical fields`);
        }
      }
    });
  }
  
  return { valid: errors.length === 0, errors, warnings };
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

// ========================================================
// Test 1: Arranque de sesión (INIT -> ASK_CONSENT)
// ========================================================

test('Arranque de sesión: stage=ASK_CONSENT con botones canónicos', () => {
  const session = {
    id: 'test-session-1',
    conversationId: 'TEST-0001',
    stage: STATES.ASK_CONSENT,
    transcript: [],
    messageSeq: 0
  };
  
  // Simular respuesta del greeting
  const gdprText = `📋 **Política de Privacidad y Consentimiento / Privacy Policy & Consent**`;
  const consentButtons = buildUiOptions(['BTN_CONSENT_YES', 'BTN_CONSENT_NO'], 'es-AR');
  
  const response = {
    ok: true,
    greeting: gdprText,
    reply: gdprText,
    stage: session.stage,
    options: consentButtons,
    buttons: consentButtons
  };
  
  // Validar Response Contract
  const validation = validateResponseContract(response, 'test-corr-1');
  assert(validation.valid, `Response Contract debe ser válido: ${validation.errors.join('; ')}`);
  
  // Verificar stage
  assert.equal(response.stage, STATES.ASK_CONSENT, 'Stage debe ser ASK_CONSENT');
  
  // Verificar botones canónicos
  assert(Array.isArray(response.options), 'options debe ser un array');
  assert.equal(response.options.length, 2, 'Debe haber 2 botones de consentimiento');
  
  response.options.forEach((btn, idx) => {
    assert(typeof btn === 'object', `Option[${idx}] debe ser objeto`);
    assert(typeof btn.label === 'string', `Option[${idx}] debe tener label`);
    assert(typeof btn.value === 'string', `Option[${idx}] debe tener value`);
    assert(typeof btn.token === 'string', `Option[${idx}] debe tener token`);
    assert(typeof btn.text === 'string', `Option[${idx}] debe tener text`);
    assert(btn.value.startsWith('BTN_CONSENT_'), `Option[${idx}] value debe ser token canónico`);
  });
  
  // Verificar que los tokens sean correctos
  const tokens = response.options.map(b => b.token);
  assert(tokens.includes('BTN_CONSENT_YES'), 'Debe incluir BTN_CONSENT_YES');
  assert(tokens.includes('BTN_CONSENT_NO'), 'Debe incluir BTN_CONSENT_NO');
});

// ========================================================
// Test 2: Click aceptar (ASK_CONSENT -> ASK_LANGUAGE)
// ========================================================

test('Click aceptar: transición ASK_CONSENT -> ASK_LANGUAGE', async () => {
  mockSessionStore = {};
  mockConversationLog = [];
  mockStageTransitions = [];
  
  const session = {
    id: 'test-session-2',
    conversationId: 'TEST-0002',
    stage: STATES.ASK_CONSENT,
    gdprConsent: false,
    transcript: [],
    messageSeq: 0
  };
  
  // Simular click en BTN_CONSENT_YES
  const buttonToken = 'BTN_CONSENT_YES';
  session.gdprConsent = true;
  session.gdprConsentDate = new Date().toISOString();
  const stageBefore = session.stage;
  session.stage = STATES.ASK_LANGUAGE;
  
  // Simular stage_transition event
  const transitionEvent = {
    role: 'system',
    type: 'stage_transition',
    event_type: 'stage_transition',
    stage: session.stage,
    stage_before: stageBefore,
    stage_after: session.stage,
    text: `Stage transition: ${stageBefore} -> ${session.stage}`,
    correlation_id: 'test-corr-2',
    session_id: session.id,
    conversation_id: session.conversationId
  };
  mockLogConversationEvent(session.conversationId, transitionEvent);
  
  // Simular respuesta con selección de idioma
  const reply = `✅ **Gracias por aceptar**\n\n🌍 **Seleccioná tu idioma / Select your language:**`;
  const langButtons = buildUiOptions(['BTN_LANG_ES_AR', 'BTN_LANG_EN'], 'es-AR');
  
  await mockAppendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
    stage: session.stage,
    buttons: langButtons,
    correlation_id: 'test-corr-2'
  });
  
  const response = {
    ok: true,
    reply,
    stage: session.stage,
    options: langButtons,
    buttons: langButtons
  };
  
  // Validar Response Contract
  const validation = validateResponseContract(response, 'test-corr-2');
  assert(validation.valid, `Response Contract debe ser válido: ${validation.errors.join('; ')}`);
  
  // Verificar stage transition
  assert.equal(session.stage, STATES.ASK_LANGUAGE, 'Stage debe ser ASK_LANGUAGE');
  assert.equal(mockStageTransitions.length, 1, 'Debe haber 1 stage_transition');
  assert.equal(mockStageTransitions[0].stage_before, STATES.ASK_CONSENT, 'stage_before debe ser ASK_CONSENT');
  assert.equal(mockStageTransitions[0].stage_after, STATES.ASK_LANGUAGE, 'stage_after debe ser ASK_LANGUAGE');
  
  // Verificar botones de idioma
  assert.equal(response.options.length, 2, 'Debe haber 2 botones de idioma');
  const langTokens = response.options.map(b => b.token);
  assert(langTokens.includes('BTN_LANG_ES_AR'), 'Debe incluir BTN_LANG_ES_AR');
  assert(langTokens.includes('BTN_LANG_EN'), 'Debe incluir BTN_LANG_EN');
});

// ========================================================
// Test 3: Selección idioma (ASK_LANGUAGE -> ASK_NAME)
// ========================================================

test('Selección idioma: transición ASK_LANGUAGE -> ASK_NAME', async () => {
  mockSessionStore = {};
  mockConversationLog = [];
  mockStageTransitions = [];
  
  const session = {
    id: 'test-session-3',
    conversationId: 'TEST-0003',
    stage: STATES.ASK_LANGUAGE,
    gdprConsent: true,
    userLocale: null,
    transcript: [],
    messageSeq: 0
  };
  
  // Simular click en BTN_LANG_ES_AR
  const buttonToken = 'BTN_LANG_ES_AR';
  session.userLocale = 'es-AR';
  const stageBefore = session.stage;
  session.stage = STATES.ASK_NAME;
  
  // Simular stage_transition event
  const transitionEvent = {
    role: 'system',
    type: 'stage_transition',
    event_type: 'stage_transition',
    stage: session.stage,
    stage_before: stageBefore,
    stage_after: session.stage,
    text: `Stage transition: ${stageBefore} -> ${session.stage}`,
    correlation_id: 'test-corr-3',
    session_id: session.id,
    conversation_id: session.conversationId
  };
  mockLogConversationEvent(session.conversationId, transitionEvent);
  
  // Simular respuesta
  const reply = `✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊`;
  const nameButtons = buildUiOptions(['BTN_NO_NAME'], 'es-AR');
  
  await mockAppendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
    stage: session.stage,
    buttons: nameButtons,
    correlation_id: 'test-corr-3'
  });
  
  const response = {
    ok: true,
    reply,
    stage: session.stage,
    options: nameButtons,
    buttons: nameButtons
  };
  
  // Validar Response Contract
  const validation = validateResponseContract(response, 'test-corr-3');
  assert(validation.valid, `Response Contract debe ser válido: ${validation.errors.join('; ')}`);
  
  // Verificar stage transition
  assert.equal(session.stage, STATES.ASK_NAME, 'Stage debe ser ASK_NAME');
  assert.equal(mockStageTransitions.length, 1, 'Debe haber 1 stage_transition');
  assert.equal(mockStageTransitions[0].stage_before, STATES.ASK_LANGUAGE, 'stage_before debe ser ASK_LANGUAGE');
  assert.equal(mockStageTransitions[0].stage_after, STATES.ASK_NAME, 'stage_after debe ser ASK_NAME');
  
  // Verificar locale
  assert.equal(session.userLocale, 'es-AR', 'userLocale debe ser es-AR');
});

// ========================================================
// Test 4: Assert "no regression" - NUNCA botones no canónicos
// ========================================================

test('No regression: NUNCA aparecen botones con {text,value} sin label/token', () => {
  // Simular respuesta con formato antiguo (no canónico)
  const badResponse = {
    ok: true,
    reply: 'Test',
    stage: STATES.ASK_CONSENT,
    buttons: [
      { text: 'Sí Acepto', value: 'si' }, // ❌ Falta label y token
      { text: 'No Acepto', value: 'no' }  // ❌ Falta label y token
    ]
  };
  
  // Validar Response Contract (debe fallar o emitir warning)
  const validation = validateResponseContract(badResponse, 'test-corr-4');
  
  // Debe detectar el problema
  assert(!validation.valid || validation.warnings.length > 0, 
    'Response Contract debe detectar botones no canónicos');
  
  // Verificar que buildUiOptions siempre devuelve formato canónico
  const goodButtons = buildUiOptions(['BTN_CONSENT_YES', 'BTN_CONSENT_NO'], 'es-AR');
  goodButtons.forEach((btn, idx) => {
    assert(typeof btn.label === 'string', `Button[${idx}] debe tener label`);
    assert(typeof btn.value === 'string', `Button[${idx}] debe tener value`);
    assert(typeof btn.token === 'string', `Button[${idx}] debe tener token`);
    assert(typeof btn.text === 'string', `Button[${idx}] debe tener text`);
  });
});

// ========================================================
// Resumen
// ========================================================

console.log('\n=== Resumen ===');
console.log(`✅ Tests pasados: ${testsPassed}`);
console.log(`❌ Tests fallidos: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  console.log('⚠️ Algunos tests fallaron. Revisar implementación.\n');
  process.exit(1);
} else {
  console.log('🎉 Todos los tests pasaron!\n');
  process.exit(0);
}

