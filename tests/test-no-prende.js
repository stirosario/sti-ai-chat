/**
 * Test de Humo: Problema "Mi compu no prende"
 * 
 * Objetivo: Verificar que el flujo de diagnóstico funciona correctamente
 * - Detecta problema técnico de encendido
 * - Genera pasos básicos de diagnóstico
 * - Ofrece opciones de seguimiento
 * 
 * Uso: node tests/test-no-prende.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SESSION_ID = `test-no-prende-${Date.now()}`;

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
  log(colors.blue, '\n🧪 TEST: Problema "Mi compu no prende"\n');
  log(colors.blue, `📡 API URL: ${API_URL}`);
  log(colors.blue, `🔑 Session ID: ${SESSION_ID}\n`);

  let passed = 0;
  let failed = 0;

  try {
    // PASO 1: Primer mensaje (saludo)
    log(colors.yellow, '📤 PASO 1: Enviar saludo...');
    let response = await sendMessage('Hola');
    
    if (!response.ok || !response.reply) {
      log(colors.red, '❌ FAIL: Primera respuesta inválida');
      failed++;
    } else {
      log(colors.green, '✅ PASS: Bot respondió al saludo');
      passed++;
    }

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
      response = await sendMessage('Ana');
      
      if (!response.ok) {
        log(colors.red, '❌ FAIL: Error al enviar nombre');
        failed++;
      } else {
        log(colors.green, '✅ PASS: Nombre aceptado');
        passed++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // PASO 5: Reportar problema "mi compu no prende"
    log(colors.yellow, '📤 PASO 5: Reportar problema de encendido...');
    response = await sendMessage('mi compu no prende');
    
    // Verificar que NO disparó fallback genérico
    const isFallbackGeneric = /no entiendo qué necesitás|need to understand better/i.test(response.reply);
    if (isFallbackGeneric) {
      log(colors.red, '❌ FAIL: Se disparó fallback genérico');
      log(colors.red, `   Respuesta: ${response.reply}`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: No se disparó fallback genérico');
      passed++;
    }

    // Verificar que detectó problema técnico
    const hasTechnicalIntent = 
      response.intentDetected === 'technical_problem' ||
      /problema|diagnóstico|diagnostic|paso|step/i.test(response.reply);
    
    if (!hasTechnicalIntent) {
      log(colors.red, '❌ FAIL: No detectó problema técnico');
      log(colors.red, `   Intent: ${response.intentDetected || 'undefined'}`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: Problema técnico detectado');
      if (response.intentDetected) {
        log(colors.blue, `   Intent: ${response.intentDetected}`);
      }
      passed++;
    }

    // Verificar que pregunta por dispositivo (si es ambiguo)
    const asksForDevice = 
      response.stage === 'ASK_DEVICE' ||
      /qué dispositivo|notebook|pc|desktop/i.test(response.reply);
    
    if (asksForDevice) {
      log(colors.green, '✅ PASS: Pregunta por tipo de dispositivo');
      log(colors.yellow, '📤 PASO 6: Seleccionar notebook...');
      response = await sendMessage(null, 'BTN_DEV_NOTEBOOK');
      await new Promise(resolve => setTimeout(resolve, 500));
      passed++;
    } else {
      log(colors.blue, 'ℹ️  INFO: No preguntó por dispositivo (asumió contexto)');
    }

    // Verificar que genera pasos diagnósticos básicos
    const hasBasicSteps = 
      response.stage === 'BASIC_TESTS' ||
      /paso|step|probá|try|desenchuf|unplug|reinici|restart/i.test(response.reply);
    
    if (!hasBasicSteps) {
      log(colors.red, '❌ FAIL: No generó pasos de diagnóstico');
      log(colors.red, `   Stage: ${response.stage}`);
      log(colors.red, `   Respuesta: ${response.reply.substring(0, 200)}...`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: Pasos diagnósticos generados');
      log(colors.blue, `   Stage: ${response.stage}`);
      log(colors.blue, `   Respuesta: ${response.reply.substring(0, 200)}...`);
      passed++;
    }

    // Verificar que los pasos son relevantes para problema de encendido
    const hasRelevantSteps = 
      /cable|corriente|power|enchuf|plug|reinici|restart|apag|shutdown/i.test(response.reply);
    
    if (!hasRelevantSteps) {
      log(colors.yellow, '⚠️  WARN: Pasos no parecen específicos para problema de encendido');
    } else {
      log(colors.green, '✅ PASS: Pasos relevantes para problema de encendido');
      passed++;
    }

    // Verificar que ofrece botones de seguimiento
    const hasFollowUpButtons = response.options?.length > 0 || response.ui?.buttons?.length > 0;
    if (!hasFollowUpButtons) {
      log(colors.red, '❌ FAIL: No ofrece botones de seguimiento');
      failed++;
    } else {
      log(colors.green, '✅ PASS: Ofrece botones de seguimiento');
      const buttonLabels = response.options?.map(o => o.text || o.label).join(', ');
      log(colors.blue, `   Botones: ${buttonLabels}`);
      passed++;
    }

    // Verificar que los botones incluyen opciones esperadas
    const buttons = response.options || response.ui?.buttons || [];
    const hasSuccessButton = buttons.some(b => 
      /funcionó|solved|solucion/i.test(b.text || b.label || b.value)
    );
    const hasAdvancedButton = buttons.some(b => 
      /avanzad|advanced|más pruebas|more test/i.test(b.text || b.label || b.value)
    );
    const hasTechButton = buttons.some(b => 
      /técnico|technician|conectar|connect/i.test(b.text || b.label || b.value)
    );

    if (hasSuccessButton) {
      log(colors.green, '✅ PASS: Incluye botón de éxito');
      passed++;
    } else {
      log(colors.yellow, '⚠️  WARN: No incluye botón de éxito explícito');
    }

    if (hasAdvancedButton || hasTechButton) {
      log(colors.green, '✅ PASS: Incluye opciones de escalamiento');
      passed++;
    } else {
      log(colors.yellow, '⚠️  WARN: No incluye opciones de escalamiento');
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
