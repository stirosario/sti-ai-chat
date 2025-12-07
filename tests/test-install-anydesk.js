/**
 * Test de Humo: Instalación de AnyDesk
 * 
 * Objetivo: Verificar que el flujo de instalación funciona correctamente
 * - No dispara fallback genérico
 * - Detecta intención de instalación
 * - Genera pasos para Windows 10
 * 
 * Uso: node tests/test-install-anydesk.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SESSION_ID = `test-install-${Date.now()}`;

// Colores para terminal
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(color + args.join(' ') + colors.reset);
}

async function sendMessage(text, buttonToken = null) {
  const body = {
    sessionId: SESSION_ID,
    text: text || '',
    buttonToken: buttonToken || null
  };

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    log(colors.red, `❌ Error en fetch: ${error.message}`);
    throw error;
  }
}

async function runTest() {
  log(colors.blue, '\n🧪 TEST: Instalación de AnyDesk en Windows 10\n');
  log(colors.blue, `📡 API URL: ${API_URL}`);
  log(colors.blue, `🔑 Session ID: ${SESSION_ID}\n`);

  let passed = 0;
  let failed = 0;

  try {
    // PASO 1: Primer mensaje (saludo)
    log(colors.yellow, '📤 PASO 1: Enviar saludo...');
    let response = await sendMessage('Hola');
    
    if (!response.ok) {
      log(colors.red, '❌ FAIL: Primera respuesta no OK');
      failed++;
    } else if (!response.reply) {
      log(colors.red, '❌ FAIL: Sin reply en primera respuesta');
      failed++;
    } else {
      log(colors.green, '✅ PASS: Bot respondió al saludo');
      log(colors.blue, `   Bot: ${response.reply.substring(0, 80)}...`);
      passed++;
    }

    // Esperar 500ms entre mensajes
    await new Promise(resolve => setTimeout(resolve, 500));

    // PASO 2: Aceptar privacidad (si se ofrece)
    if (response.stage === 'ASK_GDPR' || response.options?.some(opt => opt.value === 'BTN_ACCEPT_GDPR')) {
      log(colors.yellow, '📤 PASO 2: Aceptar privacidad...');
      response = await sendMessage(null, 'BTN_ACCEPT_GDPR');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // PASO 3: Elegir idioma (si se pregunta)
    if (response.stage === 'ASK_LANGUAGE' || response.options?.some(opt => opt.value === 'BTN_LANG_ES')) {
      log(colors.yellow, '📤 PASO 3: Elegir español...');
      response = await sendMessage(null, 'BTN_LANG_ES');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // PASO 4: Poner nombre
    if (response.stage === 'ASK_NAME' || /cómo te llamás|what.*name/i.test(response.reply)) {
      log(colors.yellow, '📤 PASO 4: Enviar nombre...');
      response = await sendMessage('TestUser');
      
      if (!response.ok) {
        log(colors.red, '❌ FAIL: Error al enviar nombre');
        failed++;
      } else {
        log(colors.green, '✅ PASS: Nombre aceptado');
        passed++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // PASO 5: Solicitar instalación de AnyDesk
    log(colors.yellow, '📤 PASO 5: Solicitar instalación de AnyDesk...');
    response = await sendMessage('Quiero instalar AnyDesk en mi compu');
    
    // Verificación crítica: NO debe disparar fallback genérico
    const isFallbackGeneric = /no entiendo qué necesitás|need to understand better/i.test(response.reply);
    if (isFallbackGeneric) {
      log(colors.red, '❌ FAIL: Se disparó fallback genérico (bug crítico)');
      log(colors.red, `   Respuesta: ${response.reply}`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: No se disparó fallback genérico');
      passed++;
    }

    // Verificar que detectó intención de instalación
    const hasInstallationIntent = 
      response.intentDetected === 'installation_help' ||
      /instalar|install|guía|guide/i.test(response.reply);
    
    if (!hasInstallationIntent) {
      log(colors.red, '❌ FAIL: No detectó intención de instalación');
      log(colors.red, `   Intent: ${response.intentDetected || 'undefined'}`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: Intención de instalación detectada');
      if (response.intentDetected) {
        log(colors.blue, `   Intent: ${response.intentDetected}`);
      }
      passed++;
    }

    // Verificar que pregunta por OS
    const asksForOS = /qué sistema operativo|operating system|w10|windows/i.test(response.reply);
    if (!asksForOS) {
      log(colors.yellow, '⚠️  WARN: No preguntó por OS (puede que ya tenga contexto)');
    } else {
      log(colors.green, '✅ PASS: Pregunta por sistema operativo');
      passed++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // PASO 6: Responder con Windows 10
    log(colors.yellow, '📤 PASO 6: Especificar Windows 10...');
    response = await sendMessage('w10');
    
    // Verificación crítica: NO debe disparar fallback genérico para "w10"
    const isFallbackW10 = /no entiendo|need to understand/i.test(response.reply);
    if (isFallbackW10) {
      log(colors.red, '❌ FAIL: "w10" disparó fallback genérico (bug crítico documentado)');
      log(colors.red, `   Respuesta: ${response.reply}`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: "w10" fue procesado correctamente');
      passed++;
    }

    // Verificar que genera guía de instalación
    const hasInstallationSteps = 
      /paso|step|descarg|download|ejecut|run|instal/i.test(response.reply) ||
      /anydesk/i.test(response.reply);
    
    if (!hasInstallationSteps) {
      log(colors.red, '❌ FAIL: No generó pasos de instalación');
      log(colors.red, `   Respuesta: ${response.reply.substring(0, 200)}...`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: Guía de instalación generada');
      log(colors.blue, `   Respuesta: ${response.reply.substring(0, 150)}...`);
      passed++;
    }

    // Verificar que menciona Windows 10
    const mentionsWindows = /windows\s*10|w10/i.test(response.reply);
    if (!mentionsWindows) {
      log(colors.yellow, '⚠️  WARN: No menciona explícitamente Windows 10');
    } else {
      log(colors.green, '✅ PASS: Menciona Windows 10 en la respuesta');
      passed++;
    }

    // Verificar que ofrece botones de confirmación
    const hasButtons = response.options?.length > 0 || response.ui?.buttons?.length > 0;
    if (!hasButtons) {
      log(colors.yellow, '⚠️  WARN: No ofrece botones de confirmación');
    } else {
      log(colors.green, '✅ PASS: Ofrece botones de seguimiento');
      log(colors.blue, `   Botones: ${response.options?.map(o => o.text || o.label).join(', ')}`);
      passed++;
    }

  } catch (error) {
    log(colors.red, `\n💥 ERROR FATAL: ${error.message}`);
    log(colors.red, error.stack);
    failed++;
  }

  // RESUMEN
  console.log('\n' + '='.repeat(60));
  log(colors.blue, '📊 RESUMEN DEL TEST');
  console.log('='.repeat(60));
  log(colors.green, `✅ Tests pasados: ${passed}`);
  log(colors.red, `❌ Tests fallidos: ${failed}`);
  
  if (failed === 0) {
    log(colors.green, '\n🎉 ÉXITO: Todos los tests pasaron');
    process.exit(0);
  } else {
    log(colors.red, `\n💔 FALLO: ${failed} test(s) fallaron`);
    process.exit(1);
  }
}

// Ejecutar test
runTest().catch(error => {
  log(colors.red, `\n💥 ERROR NO CAPTURADO: ${error.message}`);
  process.exit(1);
});
