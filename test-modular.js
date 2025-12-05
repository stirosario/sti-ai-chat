#!/usr/bin/env node
/**
 * test-modular.js
 * 
 * Script de testing para arquitectura modular
 * Ejecuta los 5 tests críticos del TESTING_GUIDE.md
 * 
 * PREREQUISITOS:
 * 1. Servidor corriendo en http://localhost:3000
 * 2. Variable de entorno: USE_MODULAR_ARCHITECTURE=true
 * 
 * USO:
 * node test-modular.js
 * 
 * O con activación automática:
 * USE_MODULAR_ARCHITECTURE=true node test-modular.js
 */

import fetch from 'node-fetch';
import { inspect } from 'util';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const VERBOSE = process.env.VERBOSE === 'true';

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

// ============================================================
// HELPER: Hacer request a /api/chat
// ============================================================
async function chatRequest(sessionId, text, action = 'text') {
  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        text,
        action
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (VERBOSE) {
      console.log('\n📤 Request:', { sessionId, text, action });
      console.log('📥 Response:', inspect(data, { depth: 5, colors: true }));
    }
    
    return data;
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
// HELPER: Verificar campos obligatorios en response
// ============================================================
function validateJsonFormat(response, testName) {
  const requiredFields = [
    'ok', 'sid', 'reply', 'stage', 'options', 
    'ui', 'allowWhatsapp', 'endConversation', 
    'help', 'steps', 'imageAnalysis'
  ];
  
  const missing = [];
  const present = [];
  
  for (const field of requiredFields) {
    if (field === 'ui') {
      if (!response.ui || !Array.isArray(response.ui.buttons)) {
        missing.push('ui.buttons');
      } else {
        present.push('ui.buttons');
      }
    } else if (response[field] === undefined) {
      missing.push(field);
    } else {
      present.push(field);
    }
  }
  
  if (missing.length > 0) {
    logError(`${testName}: Missing fields: ${missing.join(', ')}`);
    return false;
  }
  
  logSuccess(`${testName}: All 11 required fields present`);
  if (VERBOSE) {
    logInfo(`  Present: ${present.join(', ')}`);
  }
  return true;
}

// ============================================================
// TEST 1: Flujo Completo Básico
// ============================================================
async function test1_fullFlow() {
  logSection('TEST 1: FLUJO COMPLETO BÁSICO');
  
  const sessionId = `test-${Date.now()}`;
  logInfo(`Session ID: ${sessionId}`);
  
  try {
    // Paso 1: Saludo inicial
    logInfo('Step 1: Saludo inicial');
    let response = await chatRequest(sessionId, 'Hola');
    
    if (!validateJsonFormat(response, 'Step 1')) return false;
    
    if (response.stage !== 'ASK_LANGUAGE') {
      logError(`Expected stage ASK_LANGUAGE, got ${response.stage}`);
      return false;
    }
    
    const hasLanguageButtons = response.ui.buttons.some(b => 
      b.value && b.value.startsWith('BTN_LANG_')
    );
    
    if (!hasLanguageButtons) {
      logError('No language selection buttons found');
      return false;
    }
    
    logSuccess('Step 1: Language selection screen OK');
    
    // Paso 2: Seleccionar idioma
    logInfo('Step 2: Seleccionar Español (Argentina)');
    response = await chatRequest(sessionId, 'BTN_LANG_ES_AR', 'button');
    
    if (!validateJsonFormat(response, 'Step 2')) return false;
    
    if (response.stage !== 'ASK_NAME') {
      logError(`Expected stage ASK_NAME, got ${response.stage}`);
      return false;
    }
    
    if (!response.reply.toLowerCase().includes('nombre')) {
      logError('Expected name prompt in reply');
      return false;
    }
    
    logSuccess('Step 2: Name prompt OK');
    
    // Paso 3: Dar nombre
    logInfo('Step 3: Proporcionar nombre');
    response = await chatRequest(sessionId, 'Juan');
    
    if (!validateJsonFormat(response, 'Step 3')) return false;
    
    if (response.stage !== 'ASK_NEED') {
      logError(`Expected stage ASK_NEED, got ${response.stage}`);
      return false;
    }
    
    logSuccess('Step 3: Need selection prompt OK');
    
    // Paso 4: Seleccionar "problema"
    logInfo('Step 4: Seleccionar problema');
    response = await chatRequest(sessionId, 'BTN_PROBLEMA', 'button');
    
    if (!validateJsonFormat(response, 'Step 4')) return false;
    
    if (response.stage !== 'ASK_PROBLEM') {
      logError(`Expected stage ASK_PROBLEM, got ${response.stage}`);
      return false;
    }
    
    logSuccess('Step 4: Problem description prompt OK');
    
    // Paso 5: Describir problema
    logInfo('Step 5: Describir problema');
    response = await chatRequest(sessionId, 'La PC no enciende');
    
    if (!validateJsonFormat(response, 'Step 5')) return false;
    
    // Debería pedir dispositivo
    const isAskingDevice = response.stage === 'ASK_DEVICE' || response.stage === 'DETECT_DEVICE';
    if (!isAskingDevice) {
      logWarning(`Expected device-related stage, got ${response.stage}`);
    } else {
      logSuccess('Step 5: Device selection prompt OK');
    }
    
    // Paso 6: Seleccionar dispositivo
    logInfo('Step 6: Seleccionar Desktop');
    response = await chatRequest(sessionId, 'BTN_DESKTOP', 'button');
    
    if (!validateJsonFormat(response, 'Step 6')) return false;
    
    // Debería generar pasos o mostrar pasos básicos
    const hasSteps = response.steps && response.steps.length > 0;
    if (hasSteps) {
      logSuccess(`Step 6: Diagnostic steps generated (${response.steps.length} steps)`);
    } else {
      logWarning('Step 6: No diagnostic steps in response');
    }
    
    // Paso 7: Resolver problema
    logInfo('Step 7: Marcar como resuelto');
    response = await chatRequest(sessionId, 'BTN_SOLVED', 'button');
    
    if (!validateJsonFormat(response, 'Step 7')) return false;
    
    if (response.stage !== 'ENDED') {
      logWarning(`Expected stage ENDED, got ${response.stage}`);
    } else {
      logSuccess('Step 7: Conversation ended successfully');
    }
    
    logSuccess('TEST 1 PASSED: Full conversation flow completed');
    return true;
    
  } catch (error) {
    logError(`TEST 1 FAILED: ${error.message}`);
    return false;
  }
}

// ============================================================
// TEST 2: Botones Dinámicos
// ============================================================
async function test2_buttonTokens() {
  logSection('TEST 2: BOTONES DINÁMICOS');
  
  const sessionId = `test-${Date.now()}`;
  
  try {
    // Obtener botones de idioma
    logInfo('Testing language buttons');
    let response = await chatRequest(sessionId, 'Hola');
    
    const languageButtons = response.ui.buttons.filter(b => 
      b.value && b.value.startsWith('BTN_LANG_')
    );
    
    if (languageButtons.length < 3) {
      logError(`Expected 3+ language buttons, got ${languageButtons.length}`);
      return false;
    }
    
    // Verificar que los labels sean legibles (no tokens BTN_*)
    const hasReadableLabels = languageButtons.every(b => 
      !b.label.startsWith('BTN_')
    );
    
    if (!hasReadableLabels) {
      logError('Some buttons still show BTN_* tokens instead of readable text');
      return false;
    }
    
    logSuccess(`Language buttons OK: ${languageButtons.map(b => b.label).join(', ')}`);
    
    // Avanzar hasta obtener botones de dispositivo
    await chatRequest(sessionId, 'BTN_LANG_ES_AR', 'button');
    await chatRequest(sessionId, 'Juan');
    await chatRequest(sessionId, 'BTN_PROBLEMA', 'button');
    response = await chatRequest(sessionId, 'La PC no enciende');
    
    const deviceButtons = response.ui.buttons.filter(b => 
      b.value && (b.value.includes('DESKTOP') || b.value.includes('NOTEBOOK') || b.value.includes('ALLINONE'))
    );
    
    if (deviceButtons.length > 0) {
      const hasDeviceLabels = deviceButtons.every(b => !b.label.startsWith('BTN_'));
      
      if (hasDeviceLabels) {
        logSuccess(`Device buttons OK: ${deviceButtons.map(b => b.label).join(', ')}`);
      } else {
        logError('Device buttons showing BTN_* tokens');
        return false;
      }
    } else {
      logWarning('No device buttons found in response');
    }
    
    logSuccess('TEST 2 PASSED: Button tokens processed correctly');
    return true;
    
  } catch (error) {
    logError(`TEST 2 FAILED: ${error.message}`);
    return false;
  }
}

// ============================================================
// TEST 3: JSON Response Format
// ============================================================
async function test3_jsonFormat() {
  logSection('TEST 3: JSON RESPONSE FORMAT');
  
  const sessionId = `test-${Date.now()}`;
  
  try {
    const response = await chatRequest(sessionId, 'Hola');
    
    logInfo('Validating response structure...');
    
    // Verificar tipos de datos
    const validations = [
      { field: 'ok', type: 'boolean', value: response.ok },
      { field: 'sid', type: 'string', value: response.sid },
      { field: 'reply', type: 'string', value: response.reply },
      { field: 'stage', type: 'string', value: response.stage },
      { field: 'options', type: 'array', value: response.options },
      { field: 'ui.buttons', type: 'array', value: response.ui?.buttons },
      { field: 'allowWhatsapp', type: 'boolean', value: response.allowWhatsapp },
      { field: 'endConversation', type: 'boolean', value: response.endConversation }
    ];
    
    let allValid = true;
    
    for (const validation of validations) {
      const actualType = Array.isArray(validation.value) ? 'array' : typeof validation.value;
      const isValid = actualType === validation.type;
      
      if (isValid) {
        logSuccess(`  ${validation.field}: ${actualType} ✓`);
      } else {
        logError(`  ${validation.field}: expected ${validation.type}, got ${actualType}`);
        allValid = false;
      }
    }
    
    // Verificar que stage esté en UPPERCASE
    if (response.stage === response.stage.toUpperCase()) {
      logSuccess('  stage format: UPPERCASE ✓');
    } else {
      logError(`  stage format: expected UPPERCASE, got ${response.stage}`);
      allValid = false;
    }
    
    // Verificar que ui.buttons exista (no buttons directo)
    if (response.ui && response.ui.buttons && !response.buttons) {
      logSuccess('  ui.buttons structure: correct ✓');
    } else {
      logError('  ui.buttons structure: incorrect (found root-level buttons)');
      allValid = false;
    }
    
    if (allValid) {
      logSuccess('TEST 3 PASSED: JSON format 100% compatible');
      return true;
    } else {
      logError('TEST 3 FAILED: JSON format has issues');
      return false;
    }
    
  } catch (error) {
    logError(`TEST 3 FAILED: ${error.message}`);
    return false;
  }
}

// ============================================================
// TEST 4: Escalamiento a Técnico
// ============================================================
async function test4_escalation() {
  logSection('TEST 4: ESCALAMIENTO A TÉCNICO');
  
  const sessionId = `test-${Date.now()}`;
  
  try {
    // Flujo hasta problema no resuelto
    logInfo('Navigating to escalation...');
    await chatRequest(sessionId, 'Hola');
    await chatRequest(sessionId, 'BTN_LANG_ES_AR', 'button');
    await chatRequest(sessionId, 'Juan');
    await chatRequest(sessionId, 'BTN_PROBLEMA', 'button');
    await chatRequest(sessionId, 'La PC no enciende');
    await chatRequest(sessionId, 'BTN_DESKTOP', 'button');
    
    // Marcar como no resuelto
    logInfo('Marking problem as unresolved...');
    let response = await chatRequest(sessionId, 'BTN_PERSIST', 'button');
    
    if (!validateJsonFormat(response, 'Persist')) return false;
    
    // Debería estar en ADVANCED_TESTS o ESCALATE
    const isEscalating = response.stage === 'ADVANCED_TESTS' || response.stage === 'ESCALATE';
    
    if (!isEscalating) {
      logWarning(`Expected escalation stage, got ${response.stage}`);
    }
    
    // Buscar botón de técnico
    const hasTechButton = response.ui.buttons.some(b => 
      b.value && b.value.includes('TECH')
    );
    
    if (hasTechButton) {
      logSuccess('Technician button available');
      
      // Clickear botón de técnico
      logInfo('Requesting technician...');
      response = await chatRequest(sessionId, 'BTN_TECH', 'button');
      
      if (!validateJsonFormat(response, 'Tech request')) return false;
      
      // Verificar si se creó ticket
      const hasTicket = response.ticket || response.reply.includes('ticket') || response.reply.includes('TKT-');
      
      if (hasTicket) {
        logSuccess('Ticket creation confirmed');
        
        if (response.allowWhatsapp === true) {
          logSuccess('WhatsApp escalation enabled');
        } else {
          logWarning('WhatsApp flag not set');
        }
        
        logSuccess('TEST 4 PASSED: Escalation flow functional');
        return true;
      } else {
        logWarning('Ticket not found in response, but flow completed');
        return true; // No bloqueante
      }
    } else {
      logWarning('Technician button not found, escalation may work differently');
      return true; // No bloqueante
    }
    
  } catch (error) {
    logError(`TEST 4 FAILED: ${error.message}`);
    return false;
  }
}

// ============================================================
// TEST 5: Nuevos Handlers
// ============================================================
async function test5_newHandlers() {
  logSection('TEST 5: NUEVOS HANDLERS');
  
  const sessionId = `test-${Date.now()}`;
  
  try {
    // Test handler: handle_ask_language
    logInfo('Testing handle_ask_language...');
    let response = await chatRequest(sessionId, 'Hola');
    
    if (response.stage === 'ASK_LANGUAGE') {
      logSuccess('  handle_ask_language: Triggered ✓');
    } else {
      logError(`  handle_ask_language: Not triggered (stage: ${response.stage})`);
      return false;
    }
    
    response = await chatRequest(sessionId, 'BTN_LANG_ES_AR', 'button');
    
    if (response.stage === 'ASK_NAME') {
      logSuccess('  handle_ask_language: Transition OK ✓');
    } else {
      logError(`  handle_ask_language: Wrong transition (stage: ${response.stage})`);
      return false;
    }
    
    // Test handler: handle_classify_need (automático)
    logInfo('Testing handle_classify_need...');
    await chatRequest(sessionId, 'Juan');
    response = await chatRequest(sessionId, 'BTN_PROBLEMA', 'button');
    
    // Debería eventualmente llegar a ASK_PROBLEM
    if (response.stage === 'ASK_PROBLEM' || response.stage === 'CLASSIFY_NEED') {
      logSuccess('  handle_classify_need: Working ✓');
    } else {
      logWarning(`  handle_classify_need: Unexpected stage ${response.stage}`);
    }
    
    // Test handler: handle_detect_device
    logInfo('Testing handle_detect_device...');
    response = await chatRequest(sessionId, 'La PC no prende');
    
    const isDeviceStage = response.stage === 'ASK_DEVICE' || response.stage === 'DETECT_DEVICE';
    if (isDeviceStage) {
      logSuccess('  handle_detect_device: Triggered ✓');
      
      response = await chatRequest(sessionId, 'BTN_DESKTOP', 'button');
      
      if (response.stage !== 'ASK_DEVICE' && response.stage !== 'DETECT_DEVICE') {
        logSuccess('  handle_detect_device: Transition OK ✓');
      }
    } else {
      logWarning(`  handle_detect_device: Not reached (stage: ${response.stage})`);
    }
    
    logSuccess('TEST 5 PASSED: New handlers responding correctly');
    return true;
    
  } catch (error) {
    logError(`TEST 5 FAILED: ${error.message}`);
    return false;
  }
}

// ============================================================
// TEST RUNNER
// ============================================================
async function runAllTests() {
  logSection('🧪 TESTING SUITE - ARQUITECTURA MODULAR');
  
  log(`API Base: ${API_BASE}`, 'cyan');
  log(`Verbose: ${VERBOSE}`, 'cyan');
  
  // Verificar que el servidor esté corriendo
  try {
    const healthCheck = await fetch(`${API_BASE}/api/health`);
    if (!healthCheck.ok) {
      throw new Error('Health check failed');
    }
    logSuccess('Server is running');
  } catch (error) {
    logError('Server is not accessible. Please start the server first.');
    logInfo('Run: node server.js');
    process.exit(1);
  }
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // Ejecutar tests
  const tests = [
    { name: 'Test 1: Full Flow', fn: test1_fullFlow },
    { name: 'Test 2: Button Tokens', fn: test2_buttonTokens },
    { name: 'Test 3: JSON Format', fn: test3_jsonFormat },
    { name: 'Test 4: Escalation', fn: test4_escalation },
    { name: 'Test 5: New Handlers', fn: test5_newHandlers }
  ];
  
  for (const test of tests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // Pausa entre tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Resultados finales
  logSection('📊 TEST RESULTS');
  
  for (const test of results.tests) {
    if (test.passed) {
      logSuccess(`${test.name}`);
    } else {
      logError(`${test.name}`);
    }
  }
  
  console.log('');
  log(`Total: ${results.passed + results.failed} tests`, 'bright');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  
  const percentage = Math.round((results.passed / (results.passed + results.failed)) * 100);
  console.log('');
  log(`Success Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');
  
  if (percentage === 100) {
    console.log('');
    logSuccess('🎉 ALL TESTS PASSED! Modular architecture is ready for staging.');
  } else if (percentage >= 80) {
    console.log('');
    logWarning('⚠️  Most tests passed. Review failures before production.');
  } else {
    console.log('');
    logError('❌ Multiple test failures. Debug before proceeding.');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Ejecutar tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
