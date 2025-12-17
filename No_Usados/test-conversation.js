// TEST AUTOMATIZADO: Conversación completa con el nuevo sistema
// Simula un usuario real hablando con el asistente

import http from 'http';

const API_HOST = 'localhost';
const API_PORT = 3002;
const API_PATH = '/api/chat-v2';

// Generar sessionId único
const sessionId = `test_${Date.now()}_${Math.random().toString(36).substring(2)}`;

console.log(`\n${'='.repeat(70)}`);
console.log(`🤖 PRUEBA AUTOMATIZADA DEL SISTEMA CONVERSACIONAL V2`);
console.log(`${'='.repeat(70)}\n`);
console.log(`📋 Session ID: ${sessionId}\n`);

// Función para enviar mensaje
async function sendMessage(text, stepNumber, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n[${'▶'.repeat(3)}] PASO ${stepNumber}: ${description}`);
    console.log(`👤 Usuario dice: "${text}"`);
    
    const payload = JSON.stringify({
      text: text,
      sessionId: sessionId
    });
    
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Session-Id': sessionId
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`🤖 Bot responde: "${response.reply}"`);
          
          if (response.metadata) {
            console.log(`   ℹ️  Estado: ${response.metadata.conversationState || 'N/A'}`);
            console.log(`   ℹ️  Mensajes: ${response.metadata.messageCount || 0}`);
            console.log(`   ℹ️  Nombre: ${response.metadata.userName || 'no detectado'}`);
            console.log(`   ℹ️  Dispositivo: ${response.metadata.detectedDevice || 'no detectado'}`);
          }
          
          resolve(response);
        } catch (error) {
          console.error(`❌ Error parsing response: ${error.message}`);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ Error de red: ${error.message}`);
      reject(error);
    });
    
    req.write(payload);
    req.end();
  });
}

// Esperar entre mensajes (simular usuario real)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// FLUJO DE CONVERSACIÓN COMPLETA
async function runTest() {
  try {
    // 1. Saludo inicial
    await sendMessage('Hola', 1, 'Saludo inicial del usuario');
    await wait(1500);
    
    // 2. Usuario dice su nombre naturalmente
    await sendMessage('Me llamo Juan', 2, 'Usuario proporciona su nombre');
    await wait(1500);
    
    // 3. Usuario describe problema
    await sendMessage('Mi teclado no funciona', 3, 'Usuario reporta problema con teclado');
    await wait(1500);
    
    // 4. Confirmar que siguió paso 1
    await sendMessage('Ya probé', 4, 'Usuario confirma que probó primer paso');
    await wait(1500);
    
    // 5. Confirmar paso 2
    await sendMessage('Sí, lo hice', 5, 'Usuario confirma segundo paso');
    await wait(1500);
    
    // 6. Reportar que funcionó
    await sendMessage('Ahora funciona! gracias', 6, 'Usuario confirma que se resolvió');
    await wait(1000);
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ PRUEBA COMPLETADA EXITOSAMENTE`);
    console.log(`${'='.repeat(70)}\n`);
    
  } catch (error) {
    console.error(`\n❌ PRUEBA FALLIDA: ${error.message}\n`);
    process.exit(1);
  }
}

// Ejecutar test
runTest();
