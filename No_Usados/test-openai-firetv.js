// ========================================================
// TEST: Roberto con Fire TV Stick usando OpenAI
// ========================================================

import { analyzeUserIntent, generateConversationalResponse } from './conversationalBrain.js';
import OpenAI from 'openai';

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-xxx'
});

// Simular sesión
const session = {
  id: 'test-roberto-firetv',
  userName: null,
  conversationState: 'greeting',
  detectedEntities: {
    device: null,
    action: null,
    urgency: 'normal'
  },
  problemDescription: '',
  transcript: [],
  stepProgress: {
    current: 0,
    total: 0
  },
  openaiClient: openai,
  openaiCache: {},
  openaiSteps: [],
  stateLoopCount: 0,
  stepRetries: {}
};

// Conversación simulada - MEJORADA
const conversation = [
  'Hola',
  'Roberto',  // Solo el nombre, sin "me llamo"
  'Tengo un Fire TV Stick de Amazon para conectar a la tele, no sé cómo instalarlo. Y después quiero ponerle Magis TV',
  'Sí, lo conecté en HDMI 2',
  'Sí, ya se encendió la lucecita',
  'Sí, ya veo el logo de Amazon en la pantalla',
  'Listo, ya elegí español',
  'Sí, se conectó al WiFi',
  'Sí, salteé la cuenta de Amazon',
  'Sí, ya estoy en el menú principal del Fire TV',
  'Sí, descargué Downloader y lo instalé',
  'Sí funcionó, ya tengo Magis TV instalado y lo veo en mis apps',
  'No, ya está todo. Muchas gracias por tu ayuda'
];

console.log('🎭 SIMULACIÓN: Roberto instalando Fire TV Stick con OpenAI\n');
console.log('='.repeat(80));

async function runSimulation() {
  for (let i = 0; i < conversation.length; i++) {
    const userMessage = conversation[i];
    
    console.log(`\n[Mensaje ${i + 1}/${conversation.length}]`);
    console.log(`👤 Roberto: "${userMessage}"`);
    
    // Analizar intención
    const analysis = analyzeUserIntent(userMessage, session);
    console.log(`🧠 [NLU] Intent: ${analysis.intent}, Device: ${analysis.entities.device || 'N/A'}, Sentiment: ${analysis.sentiment}`);
    
    // Generar respuesta
    try {
      const response = await generateConversationalResponse(analysis, session, userMessage);
      console.log(`🤖 Tecnos: "${response.reply}"\n`);
      
      // Agregar al transcript
      session.transcript.push(
        { who: 'user', text: userMessage, ts: new Date().toISOString() },
        { who: 'bot', text: response.reply, ts: new Date().toISOString() }
      );
      
      console.log(`📊 Estado: ${session.conversationState} | Paso: ${session.stepProgress.current}/${session.stepProgress.total}`);
      
      // Pequeña pausa para simular tiempo real
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      break;
    }
  }
  
  // Resumen final
  console.log('\n' + '='.repeat(80));
  console.log('📋 RESUMEN DE LA SIMULACIÓN\n');
  console.log(`👤 Usuario: ${session.userName}`);
  console.log(`🎬 Dispositivo: ${session.detectedEntities.device}`);
  console.log(`📝 Problema: ${session.problemDescription}`);
  console.log(`✅ Estado final: ${session.conversationState}`);
  console.log(`📊 Pasos completados: ${session.stepProgress.current}/${session.stepProgress.total}`);
  console.log(`💬 Mensajes totales: ${session.transcript.length}`);
  
  if (session.openaiSteps && session.openaiSteps.length > 0) {
    console.log(`\n🤖 PASOS GENERADOS POR OPENAI (${session.openaiSteps.length}):\n`);
    session.openaiSteps.forEach((step, idx) => {
      console.log(`${idx + 1}. ${step.substring(0, 80)}...`);
    });
  }
  
  console.log(`\n💾 Cache hits: ${Object.keys(session.openaiCache).length} respuestas cacheadas`);
  console.log('='.repeat(80));
}

// Ejecutar simulación
runSimulation().catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
