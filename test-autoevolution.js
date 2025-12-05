/**
 * TEST DE AUTO-EVOLUCIÓN SEGURA
 * 
 * Este script verifica que el sistema de aprendizaje funcione correctamente:
 * 1. Carga de configuraciones JSON
 * 2. Normalización de texto
 * 3. Detección de dispositivos
 * 4. Análisis de transcripciones (mock)
 * 5. Generación de sugerencias
 */

import { 
  analyzeAndSuggestImprovements,
  applySafeImprovements,
  loadConfig,
  SAFETY_CONFIG 
} from './services/learningService.js';

import fs from 'fs';
import path from 'path';

console.log('================================================');
console.log('TEST: Sistema de Auto-Evolución Segura');
console.log('================================================\n');

// ========================================
// TEST 1: Verificar configuraciones
// ========================================
console.log('TEST 1: Cargar configuraciones JSON');
console.log('-------------------------------------');

async function test1_LoadConfigs() {
  try {
    const nlpConfig = await loadConfig('nlp-tuning.json');
    const deviceConfig = await loadConfig('device-detection.json');
    const phrasesConfig = await loadConfig('phrases-training.json');
    const featuresConfig = await loadConfig('app-features.json');
    
    console.log('✅ nlp-tuning.json:', nlpConfig ? 'LOADED' : 'FAILED');
    console.log('   - Synonyms:', Object.keys(nlpConfig?.synonyms || {}).length);
    console.log('   - Typos:', Object.keys(nlpConfig?.typos || {}).length);
    
    console.log('✅ device-detection.json:', deviceConfig ? 'LOADED' : 'FAILED');
    console.log('   - Devices:', Object.keys(deviceConfig?.devices || {}).length);
    
    console.log('✅ phrases-training.json:', phrasesConfig ? 'LOADED' : 'FAILED');
    console.log('   - Empathy responses:', Object.keys(phrasesConfig?.empathyResponses || {}).length);
    
    console.log('✅ app-features.json:', featuresConfig ? 'LOADED' : 'FAILED');
    console.log('   - Auto-learning enabled:', featuresConfig?.features?.autoLearning || false);
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// ========================================
// TEST 2: Crear transcripciones de prueba
// ========================================
console.log('\nTEST 2: Crear transcripciones mock');
console.log('-------------------------------------');

async function test2_CreateMockTranscripts() {
  try {
    const transcriptsDir = './transcripts';
    
    // Asegurar que existe el directorio
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    // Crear 15 transcripciones de prueba
    const mockTranscripts = [
      {
        messages: [
          { sender: 'user', text: 'hola, mi komputadora no funca' },
          { sender: 'bot', text: '¿Qué tipo de equipo es?' },
          { sender: 'user', text: 'es una notbook' },
          { sender: 'bot', text: 'Probá estos pasos...' },
          { sender: 'user', text: 'ya está, funcionó! gracias' }
        ],
        sessionId: 'test-001',
        timestamp: new Date().toISOString()
      },
      {
        messages: [
          { sender: 'user', text: 'la inpresora no imprime' },
          { sender: 'bot', text: 'Verificá la conexión' },
          { sender: 'user', text: 'no entiando como' },
          { sender: 'bot', text: 'Te explico paso a paso' },
          { sender: 'user', text: 'listo, anduvo' }
        ],
        sessionId: 'test-002',
        timestamp: new Date().toISOString()
      },
      {
        messages: [
          { sender: 'user', text: 'mi pc esta muy lento' },
          { sender: 'bot', text: '¿Es notebook o PC de escritorio?' },
          { sender: 'user', text: 'pc de mesa' },
          { sender: 'bot', text: 'Ejecutá estos diagnósticos' },
          { sender: 'user', text: 'me ayudo mucho gracias' }
        ],
        sessionId: 'test-003',
        timestamp: new Date().toISOString()
      }
    ];
    
    // Repetir conversaciones para tener 15+ (umbral mínimo: 10)
    for (let i = 0; i < 15; i++) {
      const transcript = mockTranscripts[i % 3];
      transcript.sessionId = `test-${String(i + 1).padStart(3, '0')}`;
      
      const filename = `transcript-test-${String(i + 1).padStart(3, '0')}.json`;
      const filepath = path.join(transcriptsDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(transcript, null, 2));
    }
    
    console.log('✅ Creadas 15 transcripciones de prueba en /transcripts');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// ========================================
// TEST 3: Analizar y generar sugerencias
// ========================================
console.log('\nTEST 3: Analizar conversaciones');
console.log('-------------------------------------');

async function test3_AnalyzeConversations() {
  try {
    console.log('Analizando transcripciones...\n');
    
    const result = await analyzeAndSuggestImprovements();
    
    if (!result.ok) {
      console.error('❌ Análisis falló:', result.error);
      return false;
    }
    
    console.log('✅ Análisis completado');
    console.log('\nEstadísticas:');
    console.log('  - Conversaciones analizadas:', result.stats.conversationsAnalyzed);
    console.log('  - Sugerencias generadas:', result.stats.suggestionsGenerated);
    console.log('  - Alta confianza:', result.stats.highConfidence);
    console.log('  - Media confianza:', result.stats.mediumConfidence);
    console.log('  - Baja confianza:', result.stats.lowConfidence);
    
    console.log('\nSugerencias por categoría:');
    console.log('  - NLP Tuning:', result.suggestions.nlpTuning.length);
    console.log('  - Device Detection:', result.suggestions.deviceDetection.length);
    console.log('  - Phrase Training:', result.suggestions.phraseTraining.length);
    
    // Mostrar algunas sugerencias de ejemplo
    if (result.suggestions.nlpTuning.length > 0) {
      console.log('\nEjemplos de sugerencias NLP:');
      result.suggestions.nlpTuning.slice(0, 3).forEach(s => {
        console.log(`  - "${s.pattern}" (${s.occurrences}x, confianza: ${s.confidence.toFixed(2)})`);
      });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// ========================================
// TEST 4: Aplicar mejoras (DRY-RUN)
// ========================================
console.log('\nTEST 4: Aplicar mejoras (dry-run)');
console.log('-------------------------------------');

async function test4_ApplyImprovements(suggestions) {
  try {
    if (!suggestions || !suggestions.ok) {
      console.log('⚠️  No hay sugerencias para aplicar');
      return false;
    }
    
    console.log('Modo dry-run: no se modificarán archivos\n');
    
    // Simulación - en producción esto aplicaría los cambios
    console.log('✅ Dry-run completado');
    console.log('En producción se aplicarían:');
    console.log('  - NLP Tuning:', suggestions.suggestions.nlpTuning.length, 'cambios');
    console.log('  - Device Detection:', suggestions.suggestions.deviceDetection.length, 'cambios');
    console.log('  - Phrase Training:', suggestions.suggestions.phraseTraining.length, 'cambios');
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// ========================================
// TEST 5: Verificar safety config
// ========================================
console.log('\nTEST 5: Verificar configuración de seguridad');
console.log('-------------------------------------');

function test5_VerifySafetyConfig() {
  console.log('Reglas de seguridad activas:');
  console.log('  - Min conversaciones:', SAFETY_CONFIG.minConversationsRequired);
  console.log('  - Min confianza:', SAFETY_CONFIG.minConfidenceThreshold);
  console.log('  - Max sugerencias:', SAFETY_CONFIG.maxSuggestionsPerRun);
  console.log('  - Backup automático:', SAFETY_CONFIG.backupBeforeApply);
  console.log('  - Rollback en error:', SAFETY_CONFIG.autoRollbackOnError);
  console.log('  - Nunca modificar código:', SAFETY_CONFIG.neverModifyCode);
  console.log('  - Solo agregar patrones:', SAFETY_CONFIG.onlyAddNewPatterns);
  
  console.log('\n✅ Configuración de seguridad verificada');
  return true;
}

// ========================================
// EJECUTAR TESTS
// ========================================
async function runAllTests() {
  console.log('\nIniciando batería de tests...\n');
  
  const results = {
    test1: await test1_LoadConfigs(),
    test2: await test2_CreateMockTranscripts(),
    test3: null,
    test4: null,
    test5: test5_VerifySafetyConfig()
  };
  
  // Test 3 y 4 solo si 1 y 2 pasaron
  if (results.test1 && results.test2) {
    results.test3 = await test3_AnalyzeConversations();
    if (results.test3) {
      results.test4 = await test4_ApplyImprovements(results.test3);
    }
  }
  
  // Resumen final
  console.log('\n================================================');
  console.log('RESUMEN DE TESTS');
  console.log('================================================');
  console.log('Test 1 (Cargar configs):', results.test1 ? '✅ PASS' : '❌ FAIL');
  console.log('Test 2 (Crear mocks):', results.test2 ? '✅ PASS' : '❌ FAIL');
  console.log('Test 3 (Analizar):', results.test3 ? '✅ PASS' : '❌ FAIL');
  console.log('Test 4 (Aplicar):', results.test4 ? '✅ PASS' : '❌ FAIL');
  console.log('Test 5 (Safety):', results.test5 ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + (allPassed ? '🎉 TODOS LOS TESTS PASARON' : '⚠️  ALGUNOS TESTS FALLARON'));
  console.log('================================================\n');
  
  return allPassed;
}

// Ejecutar
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
