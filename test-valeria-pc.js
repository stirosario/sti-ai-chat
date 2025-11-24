// ========================================================
// TEST: Simulación de Valeria - "Mi compu no arranca"
// ========================================================

import { generateConversationalResponse, analyzeUserIntent } from './conversationalBrain.js';

console.log('🎬 SIMULACIÓN: Valeria con problema de PC\n');
console.log('=' .repeat(80));

// Simular sesión nueva
const session = {
  id: 'test-valeria-001',
  userName: null,
  conversationState: 'greeting',
  transcript: [],
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
  metrics: {
    messages: 0,
    avgResponseTime: 0
  },
  userLocale: null,
  stateLoopCount: 0,
  problemDescription: '',
  startedAt: new Date().toISOString()
};

// Función auxiliar para simular mensajes
async function simulateMessage(userMessage, description) {
  console.log(`\n[${'─'.repeat(78)}]`);
  console.log(`[${description}]`);
  console.log(`👤 Valeria: "${userMessage}"`);
  
  // Primero analizar el mensaje
  const analysis = analyzeUserIntent(userMessage, session);
  
  // Luego generar respuesta
  const response = await generateConversationalResponse(analysis, session, userMessage);
  
  console.log(`🤖 Tecnos: "${response.reply}"`);
  console.log(`📊 Estado: ${session.conversationState} | Paso: ${session.stepProgress.current}/${session.stepProgress.total}`);
  
  // Actualizar transcript
  session.transcript.push(
    { who: 'user', text: userMessage, ts: new Date().toISOString() },
    { who: 'bot', text: response.reply, ts: new Date().toISOString() }
  );
  
  return response;
}

// ========================================================
// CONVERSACIÓN COMPLETA DE VALERIA
// ========================================================

console.log('\n\n💬 CONVERSACIÓN CON VALERIA\n');

await simulateMessage('Hola', 'Mensaje 1 - Primer contacto');
await simulateMessage('español', 'Mensaje 2 - Selecciona idioma');
await simulateMessage('Valeria', 'Mensaje 3 - Da su nombre');
await simulateMessage('Mi compu no arranca', 'Mensaje 4 - Describe problema');
await simulateMessage('No sé, no hace nada cuando la prendo', 'Mensaje 5 - Más detalles');
await simulateMessage('Sí, la probé en otro lugar y nada', 'Mensaje 6 - Responde paso 1');
await simulateMessage('No, no veo ninguna luz', 'Mensaje 7 - Responde paso 2');
await simulateMessage('Sí, está conectado', 'Mensaje 8 - Responde paso 3');
await simulateMessage('Nada, la pantalla sigue en negro', 'Mensaje 9 - Responde paso 4');
await simulateMessage('Ya probé todo eso y sigue sin arrancar', 'Mensaje 10 - Frustración');

console.log('\n\n' + '=' .repeat(80));
console.log('📋 RESUMEN DE LA CONVERSACIÓN:');
console.log(`👤 Usuario: ${session.userName}`);
console.log(`🌍 Idioma: ${session.userLocale}`);
console.log(`💻 Dispositivo: ${session.detectedEntities.device || 'No detectado'}`);
console.log(`📝 Problema: ${session.problemDescription}`);
console.log(`🎯 Estado final: ${session.conversationState}`);
console.log(`📊 Pasos completados: ${session.stepProgress.current}/${session.stepProgress.total}`);
console.log(`💬 Mensajes totales: ${session.transcript.length / 2}`);

console.log('\n\n' + '=' .repeat(80));
console.log('✅ SIMULACIÓN COMPLETADA');
console.log('=' .repeat(80));
