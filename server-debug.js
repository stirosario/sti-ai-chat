// Servidor con manejo de errores mejorado
import('./server.js').catch(err => {
  console.error('\n❌ ERROR FATAL AL INICIAR SERVIDOR:');
  console.error(err);
  console.error('\nStack trace completo:');
  console.error(err.stack);
  process.exit(1);
});

// Capturar errores no manejados
process.on('uncaughtException', (err) => {
  console.error('\n❌ UNCAUGHT EXCEPTION:');
  console.error(err);
  console.error('\nStack:');
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED REJECTION:');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  if (reason && reason.stack) {
    console.error('\nStack:');
    console.error(reason.stack);
  }
  process.exit(1);
});
