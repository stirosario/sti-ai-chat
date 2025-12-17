/**
 * Test del endpoint /api/historial/:conversationId
 * Verifica que el sistema de historial_chat funcione correctamente
 */

import https from 'https';

const SERVER_URL = 'sti-rosario-ai.onrender.com';
const LOG_TOKEN = '319d90a7d481f6574d37e9685ca1abf164989b7bb5e394962f03f02cd5858cfc';

// ID de sesión POST segundo deploy con logs
const TEST_SESSION_ID = 'web-mitnfbbfok0o7s';

console.log('🔍 Testeando endpoint de historial...\n');
console.log(`📡 Servidor: ${SERVER_URL}`);
console.log(`🆔 Session ID: ${TEST_SESSION_ID}`);
console.log(`🔑 Token: ${LOG_TOKEN.substring(0, 20)}...`);
console.log('\n' + '='.repeat(80) + '\n');

const options = {
  hostname: SERVER_URL,
  port: 443,
  path: `/api/historial/${TEST_SESSION_ID}?token=${LOG_TOKEN}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Test-Script/1.0'
  }
};

const req = https.request(options, (res) => {
  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, JSON.stringify(res.headers, null, 2));
  console.log('\n' + '='.repeat(80) + '\n');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 Response Body:\n');
    
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
      
      if (json.ok && json.historial) {
        console.log('\n✅ SUCCESS: Historial encontrado');
        console.log(`   - Usuario: ${json.historial.usuario}`);
        console.log(`   - Fecha: ${json.historial.fecha_inicio}`);
        console.log(`   - Mensajes: ${json.historial.conversacion?.length || 0}`);
      } else if (res.statusCode === 404) {
        console.log('\n⚠️  NOT FOUND: La conversación no existe en historial_chat/');
        console.log('   Posibles causas:');
        console.log('   1. La conversación es anterior al deploy del sistema historial_chat');
        console.log('   2. El archivo no se guardó correctamente');
        console.log('   3. El ID es incorrecto');
        console.log('\n💡 Solución: Crear una conversación NUEVA en https://stia.com.ar');
      } else {
        console.log('\n❌ ERROR: Respuesta inesperada');
      }
    } catch (e) {
      console.log('❌ Error parsing JSON:');
      console.log(data);
    }
    
    console.log('\n' + '='.repeat(80));
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
});

req.end();
