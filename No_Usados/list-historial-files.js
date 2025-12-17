/**
 * Lista todos los archivos disponibles en historial_chat
 * usando el servidor de Render
 */

import https from 'https';

const SERVER_URL = 'sti-rosario-ai.onrender.com';
const LOG_TOKEN = '319d90a7d481f6574d37e9685ca1abf164989b7bb5e394962f03f02cd5858cfc';

console.log('📂 Listando archivos en historial_chat...\n');
console.log(`📡 Servidor: ${SERVER_URL}`);
console.log(`🔑 Token: ${LOG_TOKEN.substring(0, 20)}...`);
console.log('\n' + '='.repeat(80) + '\n');

// Intentar obtener la lista de sesiones (si existe un endpoint)
const options = {
  hostname: SERVER_URL,
  port: 443,
  path: `/api/sessions?token=${LOG_TOKEN}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'List-Script/1.0'
  }
};

const req = https.request(options, (res) => {
  console.log(`📊 Status Code: ${res.statusCode}\n`);

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (Array.isArray(json)) {
        console.log(`✅ Encontradas ${json.length} sesiones:\n`);
        json.forEach((session, idx) => {
          console.log(`${idx + 1}. ID: ${session.id || session.sessionId || 'N/A'}`);
          console.log(`   Usuario: ${session.userName || 'Anónimo'}`);
          console.log(`   Fecha: ${session.startedAt || session.createdAt || 'N/A'}`);
          console.log('');
        });
        
        if (json.length > 0) {
          console.log('💡 Probá con alguno de estos IDs en admin.php → Historial');
        } else {
          console.log('⚠️  No hay sesiones guardadas todavía.');
          console.log('💡 Creá una conversación nueva en https://stia.com.ar');
        }
      } else {
        console.log('📦 Response:', JSON.stringify(json, null, 2));
      }
    } catch (e) {
      console.log('📄 Raw Response:', data);
      console.log('\n⚠️  Endpoint /api/sessions no devuelve JSON o no existe.');
      console.log('\n💡 Alternativa: Hacé una conversación nueva y copiá el ID que muestra.');
    }
    
    console.log('\n' + '='.repeat(80));
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
});

req.end();
