// ========================================================
// TEST: Nueva bienvenida bilingüe de Tecnos
// ========================================================

import { generateConversationalResponse, analyzeUserIntent } from './conversationalBrain.js';

console.log('🎬 SIMULACIÓN: Nueva experiencia de bienvenida con selección de idioma\n');
console.log('=' .repeat(80));

// Simular sesión nueva
const session = {
  id: 'test-bilingual-001',
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
  userLocale: null,  // Sin idioma definido inicialmente
  stateLoopCount: 0,
  problemDescription: '',
  startedAt: new Date().toISOString()
};

// Función auxiliar para simular mensajes
async function simulateMessage(userMessage, description) {
  console.log(`\n[${'─'.repeat(78)}]`);
  console.log(`[${description}]`);
  console.log(`👤 Usuario: "${userMessage}"`);
  
  // Primero analizar el mensaje
  const analysis = analyzeUserIntent(userMessage, session);
  
  // Luego generar respuesta
  const response = await generateConversationalResponse(analysis, session, userMessage);
  
  console.log(`🤖 Tecnos: "${response.reply}"`);
  console.log(`📊 Estado: ${session.conversationState} | Idioma: ${session.userLocale || 'No definido'}`);
  
  // Actualizar transcript
  session.transcript.push(
    { who: 'user', text: userMessage, ts: new Date().toISOString() },
    { who: 'bot', text: response.reply, ts: new Date().toISOString() }
  );
  
  return response;
}

// ========================================================
// FLUJO 1: Usuario selecciona Español
// ========================================================
console.log('\n\n🇦🇷 FLUJO 1: USUARIO ELIGE ESPAÑOL ARGENTINO\n');

await simulateMessage('Hola', 'Mensaje 1/5 - Primer contacto (debe mostrar selector de idioma)');
await simulateMessage('español', 'Mensaje 2/5 - Usuario elige español');
await simulateMessage('María', 'Mensaje 3/5 - Usuario da su nombre');
await simulateMessage('Mi impresora no imprime nada', 'Mensaje 4/5 - Usuario describe problema');
await simulateMessage('Sí, la probé', 'Mensaje 5/5 - Usuario responde paso');

console.log('\n\n' + '=' .repeat(80));
console.log('📋 RESUMEN FLUJO 1 (ESPAÑOL):');
console.log(`👤 Usuario: ${session.userName}`);
console.log(`🌍 Idioma: ${session.userLocale}`);
console.log(`🎯 Estado final: ${session.conversationState}`);
console.log(`💬 Mensajes totales: ${session.transcript.length / 2}`);

// ========================================================
// FLUJO 2: Usuario selecciona English
// ========================================================
console.log('\n\n\n🇺🇸 FLUJO 2: USUARIO ELIGE ENGLISH\n');

// Reset sesión
const session2 = {
  id: 'test-bilingual-002',
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

// Reemplazar sesión global
Object.assign(session, session2);

await simulateMessage('Hi', 'Mensaje 1/5 - First contact (should show language selector)');
await simulateMessage('english', 'Mensaje 2/5 - User selects English');
await simulateMessage('John', 'Mensaje 3/5 - User provides name');
await simulateMessage('My computer won\'t turn on', 'Mensaje 4/5 - User describes problem');
await simulateMessage('Yes, I checked the power', 'Mensaje 5/5 - User responds to step');

console.log('\n\n' + '=' .repeat(80));
console.log('📋 RESUMEN FLUJO 2 (ENGLISH):');
console.log(`👤 Usuario: ${session.userName}`);
console.log(`🌍 Idioma: ${session.userLocale}`);
console.log(`🎯 Estado final: ${session.conversationState}`);
console.log(`💬 Mensajes totales: ${session.transcript.length / 2}`);

// ========================================================
// FLUJO 3: Usuario usa números para seleccionar
// ========================================================
console.log('\n\n\n🔢 FLUJO 3: USUARIO USA NÚMEROS (1=Español, 2=English)\n');

// Reset sesión
const session3 = {
  id: 'test-bilingual-003',
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

Object.assign(session, session3);

await simulateMessage('hola', 'Mensaje 1/3 - Usuario saluda');
await simulateMessage('1', 'Mensaje 2/3 - Usuario selecciona opción 1 (Español)');
await simulateMessage('Roberto', 'Mensaje 3/3 - Usuario da su nombre');

console.log('\n\n' + '=' .repeat(80));
console.log('📋 RESUMEN FLUJO 3 (NÚMERO 1 → ESPAÑOL):');
console.log(`👤 Usuario: ${session.userName}`);
console.log(`🌍 Idioma: ${session.userLocale}`);
console.log(`🎯 Estado final: ${session.conversationState}`);

console.log('\n\n' + '=' .repeat(80));
console.log('✅ SIMULACIÓN COMPLETADA');
console.log('=' .repeat(80));
