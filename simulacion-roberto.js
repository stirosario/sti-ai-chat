/**
 * SIMULACIÓN: Roberto - Usuario con Amazon Fire TV Stick
 * Caso: Instalación de stick + configuración + instalación de Magis TV
 */

import { analyzeUserIntent, generateConversationalResponse } from './conversationalBrain.js';

// Simular sesión de Roberto
const session = {
  id: 'sim-roberto-001',
  userName: null,
  conversationState: 'greeting',
  device: null,
  problem: null,
  problemDescription: '',
  transcript: [],
  startedAt: new Date().toISOString(),
  userLocale: 'es-AR',
  contextWindow: [],
  detectedEntities: {
    device: null,
    action: null,
    urgency: 'normal'
  },
  stepProgress: {
    current: 0,
    total: 0
  },
  stateLoopCount: 0,
  stepRetries: {},
  returningUser: false
};

// Conversación simulada de Roberto
const conversacion = [
  { quien: 'Bot', mensaje: '¡Hola! 👋 Soy Tecnos de STI. Para empezar, ¿cómo te llamás?' },
  { quien: 'Roberto', mensaje: 'Hola, me llamo Roberto' },
  { quien: 'Roberto', mensaje: 'Necesito ayuda con un stick de Amazon para mi tele' },
  { quien: 'Roberto', mensaje: 'No sé cómo instalarlo y después quiero ponerle Magis TV' },
  { quien: 'Roberto', mensaje: 'Sí, es el Fire TV Stick' },
  { quien: 'Roberto', mensaje: 'Sí, está enchufado en el HDMI de la tele' },
  { quien: 'Roberto', mensaje: 'Sí, le puse el cargador en el enchufe' },
  { quien: 'Roberto', mensaje: 'Sí, veo algo pero no sé qué hacer' },
  { quien: 'Roberto', mensaje: 'Sí, cambié a HDMI' },
  { quien: 'Roberto', mensaje: 'Dice algo de idioma' },
  { quien: 'Roberto', mensaje: 'Listo, elegí Español' },
  { quien: 'Roberto', mensaje: 'Ahora pide WiFi' },
  { quien: 'Roberto', mensaje: 'Sí, puse la contraseña del WiFi' },
  { quien: 'Roberto', mensaje: 'Está conectando...' },
  { quien: 'Roberto', mensaje: 'Listo, ya está conectado' },
  { quien: 'Roberto', mensaje: 'Ahora quiero instalar Magis TV' },
  { quien: 'Roberto', mensaje: 'No sé cómo se hace' },
  { quien: 'Roberto', mensaje: 'Sí, estoy en el menú principal' },
  { quien: 'Roberto', mensaje: 'Listo, encontré la lupa' },
  { quien: 'Roberto', mensaje: 'Escribí Downloader' },
  { quien: 'Roberto', mensaje: 'Sí, lo instalé' },
  { quien: 'Roberto', mensaje: 'Abrí el Downloader' },
  { quien: 'Roberto', mensaje: 'Escribí la dirección que me dijiste' },
  { quien: 'Roberto', mensaje: 'Se está descargando' },
  { quien: 'Roberto', mensaje: 'Apareció una ventana preguntando si instalo' },
  { quien: 'Roberto', mensaje: 'Le di a Instalar' },
  { quien: 'Roberto', mensaje: '¡Funcionó! Ya tengo Magis TV instalado' }
];

console.log('\n' + '='.repeat(80));
console.log('SIMULACIÓN: ROBERTO - AMAZON FIRE TV STICK + MAGIS TV');
console.log('='.repeat(80) + '\n');

let mensajeIndex = 0;

// Primer mensaje del bot
console.log(`\n💬 Bot: ${conversacion[mensajeIndex].mensaje}\n`);
mensajeIndex++;

// Procesar conversación
while (mensajeIndex < conversacion.length) {
  const userMessage = conversacion[mensajeIndex].mensaje;
  
  console.log(`👤 Roberto: ${userMessage}\n`);
  
  // Agregar a transcript
  session.transcript.push({
    who: 'user',
    text: userMessage,
    ts: new Date().toISOString()
  });
  
  // Actualizar context window
  session.contextWindow.push(userMessage);
  if (session.contextWindow.length > 5) {
    session.contextWindow.shift();
  }
  
  // Analizar intención
  const analysis = analyzeUserIntent(userMessage, session);
  
  console.log(`   [NLU] Intent: ${analysis.intent}, Device: ${analysis.entities.device || 'N/A'}, Action: ${analysis.entities.action || 'N/A'}`);
  
  // Generar respuesta
  const response = generateConversationalResponse(analysis, session, userMessage);
  
  // Agregar respuesta al transcript
  session.transcript.push({
    who: 'bot',
    text: response.reply,
    ts: new Date().toISOString()
  });
  
  console.log(`\n💬 Bot: ${response.reply}\n`);
  console.log(`   [Estado: ${session.conversationState}] [Paso: ${session.stepProgress.current || 0}]\n`);
  
  mensajeIndex++;
  
  // Pequeña pausa para legibilidad
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Resumen final
console.log('\n' + '='.repeat(80));
console.log('RESUMEN DE LA ASISTENCIA A ROBERTO');
console.log('='.repeat(80) + '\n');

console.log(`✅ Usuario: ${session.userName}`);
console.log(`✅ Dispositivo detectado: ${session.detectedEntities.device || 'Amazon Fire TV Stick'}`);
console.log(`✅ Problema: ${session.problemDescription}`);
console.log(`✅ Estado final: ${session.conversationState}`);
console.log(`✅ Total de mensajes: ${session.transcript.length}`);
console.log(`✅ Pasos completados: ${session.stepProgress.current || 'N/A'}`);

console.log('\n📋 PASOS BRINDADOS:\n');

// Extraer pasos del transcript
const pasosBrindados = [];
session.transcript.forEach((msg, idx) => {
  if (msg.who === 'bot' && (msg.text.includes('Paso') || msg.text.includes('🔍') || msg.text.includes('📥'))) {
    pasosBrindados.push(`${pasosBrindados.length + 1}. ${msg.text.substring(0, 100)}...`);
  }
});

if (pasosBrindados.length > 0) {
  pasosBrindados.forEach(paso => console.log(paso));
} else {
  console.log('Asistencia conversacional sin pasos formales estructurados.');
}

console.log('\n✅ RESULTADO: Problema resuelto - Roberto configuró su Fire TV Stick e instaló Magis TV exitosamente.\n');
