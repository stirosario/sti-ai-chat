// Cliente SSE para monitoreo de logs en tiempo real
import https from 'https';

// Probar sin token primero (puede no estar configurado en producción)
const url = `https://sti-rosario-ai.onrender.com/api/logs/stream`;

console.log('🔌 Conectando al stream de logs...');
console.log('📡 URL:', url);
console.log('─'.repeat(80));

https.get(url, (res) => {
  console.log(`✅ Conectado - Status: ${res.statusCode}`);
  console.log('🎧 Escuchando eventos en tiempo real...\n');

  res.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach(line => {
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.substring(5).trim());
          const timestamp = new Date(data.timestamp).toLocaleTimeString('es-AR');
          
          // Formatear según tipo de log
          let emoji = '📝';
          let color = '\x1b[37m'; // blanco
          
          if (data.type === 'error') {
            emoji = '❌';
            color = '\x1b[31m'; // rojo
          } else if (data.type === 'warning') {
            emoji = '⚠️';
            color = '\x1b[33m'; // amarillo
          } else if (data.type === 'success') {
            emoji = '✅';
            color = '\x1b[32m'; // verde
          } else if (data.type === 'info') {
            emoji = 'ℹ️';
            color = '\x1b[36m'; // cyan
          }
          
          console.log(`${color}${emoji} [${timestamp}] ${data.sessionId || 'SYSTEM'}`);
          console.log(`   ${data.message}\x1b[0m`);
          
          if (data.details) {
            console.log(`   📋 Details: ${JSON.stringify(data.details, null, 2)}`);
          }
          console.log('');
          
        } catch (e) {
          // Líneas que no son JSON (heartbeat, etc)
          if (line.trim()) {
            console.log(`💓 ${line.trim()}`);
          }
        }
      }
    });
  });

  res.on('error', (err) => {
    console.error('❌ Error en stream:', err.message);
  });

  res.on('end', () => {
    console.log('\n🔌 Stream cerrado por el servidor');
    process.exit(0);
  });

}).on('error', (err) => {
  console.error('❌ Error de conexión:', err.message);
  process.exit(1);
});

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Cerrando monitor de logs...');
  process.exit(0);
});
