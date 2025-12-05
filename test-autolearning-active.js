/**
 * TEST RÁPIDO - AUTO-LEARNING ACTIVADO
 * 
 * Verifica que el sistema de auto-learning esté configurado correctamente
 */

console.log('================================================');
console.log('TEST: Verificación Auto-Learning Activado');
console.log('================================================\n');

// Verificar variables de entorno
import 'dotenv/config';

console.log('1. Variables de entorno:');
console.log('   AUTO_LEARNING_ENABLED:', process.env.AUTO_LEARNING_ENABLED);
console.log('   USE_ORCHESTRATOR:', process.env.USE_ORCHESTRATOR);
console.log('   MIN_CONVERSATIONS:', process.env.MIN_CONVERSATIONS_FOR_ANALYSIS);
console.log('   MIN_CONFIDENCE:', process.env.MIN_CONFIDENCE_THRESHOLD);
console.log('   INTERVAL_HOURS:', process.env.AUTO_LEARNING_INTERVAL_HOURS);

// Verificar config
import fs from 'fs';
const configPath = './config/app-features.json';

console.log('\n2. Archivo app-features.json:');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('   autoLearning:', config.features.autoLearning);
  console.log('   useOrchestrator:', config.features.useOrchestrator);
  console.log('   minConversations:', config.learning.minConversationsForAnalysis);
  console.log('   minConfidence:', config.learning.minConfidenceToApply);
  console.log('   maxSuggestions:', config.learning.maxSuggestionsPerCycle);
  console.log('   autoRunOnStartup:', config.learning.autoRunOnStartup);
  console.log('   intervalHours:', config.learning.autoRunIntervalHours);
} else {
  console.log('   ❌ ARCHIVO NO ENCONTRADO');
}

// Verificar funciones exportadas
console.log('\n3. Funciones de learningService:');
try {
  const { 
    runAutoLearningCycle, 
    getAutoLearningStatus,
    analyzeAndSuggestImprovements,
    applySafeImprovements
  } = await import('./services/learningService.js');
  
  console.log('   ✅ runAutoLearningCycle');
  console.log('   ✅ getAutoLearningStatus');
  console.log('   ✅ analyzeAndSuggestImprovements');
  console.log('   ✅ applySafeImprovements');
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

// Verificar status
console.log('\n4. Status del sistema:');
try {
  const { getAutoLearningStatus } = await import('./services/learningService.js');
  const status = await getAutoLearningStatus();
  
  console.log('   Habilitado:', status.autoLearningEnabled ? '✅ SÍ' : '❌ NO');
  console.log('   Config ENV:', status.config.envVariable ? '✅' : '❌');
  console.log('   Config JSON:', status.config.appFeatures ? '✅' : '❌');
  console.log('   Última ejecución:', status.lastRun || 'Nunca');
  console.log('   Últimos cambios:', status.lastChanges.length);
} catch (err) {
  console.log('   ❌ Error:', err.message);
}

console.log('\n================================================');
console.log('✅ VERIFICACIÓN COMPLETA');
console.log('================================================\n');

console.log('Para probar el sistema completo:');
console.log('1. Iniciar servidor: npm start');
console.log('2. Verificar logs en consola (buscar [AUTO-LEARNING])');
console.log('3. Probar endpoint: curl "http://localhost:3001/api/learning/status?token=Marco.3838_"');
console.log('4. Ver logs: cat logs/learning.log\n');
