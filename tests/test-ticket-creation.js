/**
 * Test de Humo: Creación de Ticket WhatsApp
 * 
 * Objetivo: Verificar que el sistema de tickets funciona correctamente
 * - Usuario reporta problema que no puede resolver solo
 * - Se genera archivo de ticket (TCK-*.json)
 * - Se devuelve link de WhatsApp válido
 * - El ticket contiene transcript completo
 * 
 * Uso: node tests/test-ticket-creation.js
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SESSION_ID = `test-ticket-${Date.now()}`;

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
  log(colors.blue, '\n🧪 TEST: Creación de Ticket WhatsApp\n');
  log(colors.blue, `📡 API URL: ${API_URL}`);
  log(colors.blue, `🔑 Session ID: ${SESSION_ID}\n`);

  let passed = 0;
  let failed = 0;
  let ticketId = null;

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
      response = await sendMessage('Carlos Test');
      
      if (!response.ok) {
        log(colors.red, '❌ FAIL: Error al enviar nombre');
        failed++;
      } else {
        log(colors.green, '✅ PASS: Nombre aceptado');
        passed++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // PASO 5: Reportar problema complejo
    log(colors.yellow, '📤 PASO 5: Reportar problema complejo...');
    response = await sendMessage('Mi notebook no carga el sistema operativo, probé todo y no funciona');
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // PASO 6: Indicar que necesita ayuda técnica
    log(colors.yellow, '📤 PASO 6: Solicitar ayuda técnica...');
    
    // Buscar botón de técnico o enviar mensaje explícito
    const techButton = response.options?.find(opt => 
      /técnico|technician|conectar|connect|ayuda.*técnic/i.test(opt.text || opt.label || opt.value)
    );

    if (techButton) {
      log(colors.blue, `   Usando botón: ${techButton.text || techButton.label}`);
      response = await sendMessage(null, techButton.value);
    } else {
      log(colors.blue, '   Enviando mensaje explícito...');
      response = await sendMessage('necesito hablar con un técnico');
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Si aún no se creó ticket, puede necesitar confirmación adicional
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !response.whatsappUrl && !response.ticketId) {
      log(colors.yellow, `   Intento ${attempts + 1}: Confirmar solicitud de técnico...`);
      
      const confirmButton = response.options?.find(opt => 
        /sí|yes|confirm|técnico|technician/i.test(opt.text || opt.label || opt.value)
      );
      
      if (confirmButton) {
        response = await sendMessage(null, confirmButton.value);
      } else {
        response = await sendMessage('Sí, por favor conéctame con un técnico');
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    // VERIFICACIONES

    // 1. Verificar que se devolvió URL de WhatsApp
    if (!response.whatsappUrl) {
      log(colors.red, '❌ FAIL: No se devolvió URL de WhatsApp');
      log(colors.red, `   Response: ${JSON.stringify(response, null, 2).substring(0, 300)}...`);
      failed++;
    } else {
      log(colors.green, '✅ PASS: URL de WhatsApp devuelta');
      log(colors.blue, `   URL: ${response.whatsappUrl}`);
      passed++;

      // 2. Verificar formato de URL válida
      if (!response.whatsappUrl.includes('wa.me')) {
        log(colors.red, '❌ FAIL: URL de WhatsApp no contiene wa.me');
        failed++;
      } else {
        log(colors.green, '✅ PASS: URL tiene formato válido (wa.me)');
        passed++;
      }
    }

    // 3. Verificar que se devolvió ticket ID
    ticketId = response.ticketId;
    if (!ticketId) {
      log(colors.red, '❌ FAIL: No se devolvió ticket ID');
      failed++;
    } else {
      log(colors.green, '✅ PASS: Ticket ID devuelto');
      log(colors.blue, `   Ticket ID: ${ticketId}`);
      passed++;

      // 4. Verificar formato del ticket ID (TCK-timestamp)
      if (!/^TCK-\d+$/.test(ticketId)) {
        log(colors.yellow, '⚠️  WARN: Formato de ticket ID no estándar');
      } else {
        log(colors.green, '✅ PASS: Formato de ticket ID válido');
        passed++;
      }
    }

    // 5. Verificar que el archivo del ticket existe (solo si estamos en localhost)
    if (API_URL.includes('localhost') && ticketId) {
      const ticketPath = path.join(__dirname, '..', 'data', 'tickets', `${ticketId}.json`);
      
      if (!fs.existsSync(ticketPath)) {
        log(colors.red, `❌ FAIL: Archivo de ticket no existe: ${ticketPath}`);
        failed++;
      } else {
        log(colors.green, '✅ PASS: Archivo de ticket existe');
        log(colors.blue, `   Path: ${ticketPath}`);
        passed++;

        // 6. Verificar contenido del ticket
        try {
          const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
          const ticket = JSON.parse(ticketContent);

          // 6.1 Verificar estructura básica
          if (!ticket.ticketId || !ticket.timestamp || !ticket.userInfo) {
            log(colors.red, '❌ FAIL: Ticket no tiene estructura básica completa');
            failed++;
          } else {
            log(colors.green, '✅ PASS: Ticket tiene estructura básica');
            passed++;
          }

          // 6.2 Verificar userInfo
          if (!ticket.userInfo.name || !ticket.userInfo.sessionId) {
            log(colors.red, '❌ FAIL: userInfo incompleto');
            failed++;
          } else {
            log(colors.green, '✅ PASS: userInfo completo');
            log(colors.blue, `   Nombre: ${ticket.userInfo.name}`);
            passed++;
          }

          // 6.3 Verificar que hay transcript
          if (!ticket.transcript || !Array.isArray(ticket.transcript) || ticket.transcript.length === 0) {
            log(colors.red, '❌ FAIL: Transcript vacío o inválido');
            failed++;
          } else {
            log(colors.green, '✅ PASS: Transcript presente');
            log(colors.blue, `   Mensajes en transcript: ${ticket.transcript.length}`);
            passed++;

            // 6.4 Verificar que el transcript incluye el problema reportado
            const hasProblemDescription = ticket.transcript.some(msg => 
              msg.text?.toLowerCase().includes('sistema operativo') ||
              msg.text?.toLowerCase().includes('no carga')
            );

            if (!hasProblemDescription) {
              log(colors.yellow, '⚠️  WARN: Transcript no parece incluir descripción del problema');
            } else {
              log(colors.green, '✅ PASS: Transcript incluye descripción del problema');
              passed++;
            }
          }

          // 6.5 Verificar que hay summary del problema
          if (!ticket.summary || !ticket.summary.trim()) {
            log(colors.yellow, '⚠️  WARN: No hay summary del problema');
          } else {
            log(colors.green, '✅ PASS: Summary del problema presente');
            log(colors.blue, `   Summary: ${ticket.summary.substring(0, 100)}...`);
            passed++;
          }

          // 6.6 Verificar que PII está enmascarado (si aplica)
          const transcriptText = JSON.stringify(ticket.transcript).toLowerCase();
          const hasSensitiveData = /email|mail|@|\b\d{3}-\d{3}-\d{4}\b/.test(transcriptText);
          
          if (hasSensitiveData) {
            const isMasked = /\*\*\*|xxx|redacted/i.test(transcriptText);
            if (!isMasked) {
              log(colors.yellow, '⚠️  WARN: Posible PII sin enmascarar');
            } else {
              log(colors.green, '✅ PASS: PII parece estar enmascarado');
              passed++;
            }
          } else {
            log(colors.blue, 'ℹ️  INFO: No se detectó PII sensible en transcript');
          }

        } catch (error) {
          log(colors.red, `❌ FAIL: Error al leer ticket: ${error.message}`);
          failed++;
        }
      }
    } else if (!API_URL.includes('localhost')) {
      log(colors.blue, 'ℹ️  INFO: Salteando verificación de archivo (API remota)');
    }

    // 7. Verificar que el stage es TICKET_SENT
    if (response.stage !== 'TICKET_SENT' && response.stage !== 'ENDED') {
      log(colors.yellow, `⚠️  WARN: Stage no es TICKET_SENT: ${response.stage}`);
    } else {
      log(colors.green, '✅ PASS: Stage correcto después de ticket');
      passed++;
    }

    // 8. Verificar mensaje de confirmación al usuario
    if (!response.reply || !/ticket|whatsapp|técnico|technician/i.test(response.reply)) {
      log(colors.yellow, '⚠️  WARN: Respuesta no menciona ticket o WhatsApp');
    } else {
      log(colors.green, '✅ PASS: Mensaje de confirmación apropiado');
      log(colors.blue, `   Mensaje: ${response.reply.substring(0, 150)}...`);
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
  
  if (ticketId) {
    log(colors.blue, `\n🎫 Ticket creado: ${ticketId}`);
  }
  
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
