// training-almacenamiento-17k.js
// ================================
// Script de análisis y entrenamiento ML con 17,547 líneas de casos reales
// Categoría: Dispositivos de Almacenamiento
// 
// Objetivo: Extraer patrones, keywords y typos para entrenar sistema de detección

import fs from 'fs';
import path from 'path';

// ============================================
// CONFIGURACIÓN
// ============================================

const JSON_PATH = 'e:\\Lucas\\Downloads\\sti_dispositivos_problemas_por_categoria\\almacenamiento.json';
const OUTPUT_DIR = './training-results';

// ============================================
// FUNCIONES DE ANÁLISIS
// ============================================

/**
 * Carga y parsea el archivo JSON completo
 */
function loadTrainingData() {
  console.log('📂 Cargando almacenamiento.json...');
  const rawData = fs.readFileSync(JSON_PATH, 'utf-8');
  const data = JSON.parse(rawData);
  console.log(`✅ Archivo cargado: ${rawData.length.toLocaleString()} caracteres\n`);
  return data;
}

/**
 * Analiza estructura del JSON y cuenta elementos
 */
function analyzeStructure(data) {
  console.log('🔍 ANÁLISIS DE ESTRUCTURA');
  console.log('═══════════════════════════════════════\n');
  
  const stats = {
    category: data.category,
    devices: {},
    totalPhrases: 0,
    totalVariants: 0
  };
  
  // Analizar cada dispositivo
  for (const [deviceName, deviceData] of Object.entries(data.devices)) {
    const phrases = deviceData.es || [];
    const variantCount = phrases.reduce((sum, phrase) => sum + phrase.variants.length, 0);
    
    stats.devices[deviceName] = {
      baseCount: phrases.length,
      variantCount: variantCount,
      totalCases: phrases.length + variantCount
    };
    
    stats.totalPhrases += phrases.length;
    stats.totalVariants += variantCount;
  }
  
  // Mostrar resultados
  console.log(`📦 Categoría: ${stats.category}`);
  console.log(`📊 Dispositivos encontrados: ${Object.keys(stats.devices).length}\n`);
  
  for (const [device, counts] of Object.entries(stats.devices)) {
    console.log(`   🔹 ${device}:`);
    console.log(`      - Frases base: ${counts.baseCount}`);
    console.log(`      - Variantes:   ${counts.variantCount}`);
    console.log(`      - Total casos: ${counts.totalCases}\n`);
  }
  
  console.log(`📈 TOTALES:`);
  console.log(`   - Frases base:  ${stats.totalPhrases}`);
  console.log(`   - Variantes:    ${stats.totalVariants}`);
  console.log(`   - Total casos:  ${stats.totalPhrases + stats.totalVariants}\n`);
  
  return stats;
}

/**
 * Extrae palabras clave únicas de las frases base
 */
function extractKeywords(data) {
  console.log('🔑 EXTRACCIÓN DE KEYWORDS');
  console.log('═══════════════════════════════════════\n');
  
  const keywordsByDevice = {};
  
  // Palabras comunes a ignorar (stopwords)
  const stopwords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para',
    'mi', 'tu', 'su', 'lo', 'le', 'se', 'me', 'te',
    'no', 'ni', 'y', 'o', 'pero', 'si', 'que', 'como',
    'cuando', 'donde', 'desde', 'hasta', 'más', 'menos',
    'muy', 'bien', 'mal', 'todo', 'nada', 'algo', 'siempre',
    'nunca', 'hace', 'anda', 'funciona', 'detecta', 'reconoce',
    'veces', 'vez', 'este', 'esta', 'ese', 'esa', 'solo',
    'tras', 'fue', 'sido', 'está', 'estuvo', 'hay', 'había'
  ]);
  
  for (const [deviceName, deviceData] of Object.entries(data.devices)) {
    const phrases = deviceData.es || [];
    const wordFrequency = {};
    
    // Contar frecuencia de palabras en frases base
    phrases.forEach(phraseObj => {
      const words = phraseObj.base
        .toLowerCase()
        .replace(/[.,;:¿?¡!]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w));
      
      words.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      });
    });
    
    // Ordenar por frecuencia
    const sortedKeywords = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 keywords
    
    keywordsByDevice[deviceName] = sortedKeywords;
    
    console.log(`   🔹 ${deviceName}:`);
    console.log(`      Top keywords: ${sortedKeywords.slice(0, 5).map(([w, f]) => `${w}(${f})`).join(', ')}\n`);
  }
  
  return keywordsByDevice;
}

/**
 * Analiza patrones de typos en las variantes
 */
function analyzeTypoPatterns(data) {
  console.log('🔤 ANÁLISIS DE PATRONES DE TYPOS');
  console.log('═══════════════════════════════════════\n');
  
  const typoPatterns = {
    omissions: new Map(),      // letras omitidas
    duplications: new Map(),   // letras duplicadas
    substitutions: new Map(),  // letras sustituidas
    transpositions: new Map()  // letras transpuestas
  };
  
  const typoExamples = [];
  let totalVariants = 0;
  
  for (const [deviceName, deviceData] of Object.entries(data.devices)) {
    const phrases = deviceData.es || [];
    
    phrases.forEach(phraseObj => {
      const base = phraseObj.base.toLowerCase();
      const variants = phraseObj.variants || [];
      totalVariants += variants.length;
      
      variants.slice(0, 3).forEach(variant => { // Analizar primeras 3 variantes de cada frase
        const variantLower = variant.toLowerCase();
        
        // Detectar palabras diferentes
        const baseWords = base.split(/\s+/);
        const variantWords = variantLower.split(/\s+/);
        
        for (let i = 0; i < Math.min(baseWords.length, variantWords.length); i++) {
          const baseWord = baseWords[i];
          const variantWord = variantWords[i];
          
          if (baseWord !== variantWord && baseWord.length > 2) {
            // Guardar ejemplo de typo
            if (typoExamples.length < 100) {
              typoExamples.push({
                correct: baseWord,
                typo: variantWord,
                device: deviceName
              });
            }
            
            // Analizar tipo de error
            analyzeTypoType(baseWord, variantWord, typoPatterns);
          }
        }
      });
    });
  }
  
  console.log(`📊 Variantes analizadas: ${totalVariants.toLocaleString()}`);
  console.log(`📝 Ejemplos de typos únicos: ${typoExamples.length}\n`);
  
  // Mostrar top typos por categoría
  console.log(`🔝 Top 10 Omisiones:`);
  const topOmissions = Array.from(typoPatterns.omissions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  topOmissions.forEach(([typo, count]) => {
    console.log(`   - "${typo.split('→')[0]}" → "${typo.split('→')[1]}" (${count}x)`);
  });
  
  console.log(`\n🔝 Top 10 Duplicaciones:`);
  const topDups = Array.from(typoPatterns.duplications.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  topDups.forEach(([typo, count]) => {
    console.log(`   - "${typo.split('→')[0]}" → "${typo.split('→')[1]}" (${count}x)`);
  });
  
  return { typoPatterns, typoExamples };
}

/**
 * Analiza el tipo específico de error ortográfico
 */
function analyzeTypoType(correct, typo, patterns) {
  // Omisión: falta una letra
  if (typo.length === correct.length - 1) {
    const key = `${correct}→${typo}`;
    patterns.omissions.set(key, (patterns.omissions.get(key) || 0) + 1);
  }
  
  // Duplicación: letra extra
  if (typo.length === correct.length + 1) {
    const key = `${correct}→${typo}`;
    patterns.duplications.set(key, (patterns.duplications.get(key) || 0) + 1);
  }
  
  // Sustitución: misma longitud, letra diferente
  if (typo.length === correct.length) {
    for (let i = 0; i < correct.length; i++) {
      if (correct[i] !== typo[i]) {
        const key = `${correct}→${typo}`;
        patterns.substitutions.set(key, (patterns.substitutions.get(key) || 0) + 1);
        break;
      }
    }
  }
}

/**
 * Genera diccionario de correcciones para normalizarTexto.js
 */
function generateTypoCorrections(typoExamples) {
  console.log('\n💾 GENERANDO DICCIONARIO DE CORRECCIONES');
  console.log('═══════════════════════════════════════\n');
  
  const corrections = {};
  const uniqueTypos = new Map();
  
  // Filtrar typos únicos y frecuentes
  typoExamples.forEach(example => {
    const key = example.typo;
    if (!uniqueTypos.has(key) || uniqueTypos.get(key).length > example.correct.length) {
      uniqueTypos.set(key, example.correct);
    }
  });
  
  // Convertir a objeto
  for (const [typo, correct] of uniqueTypos.entries()) {
    if (typo !== correct && typo.length > 2) {
      corrections[typo] = correct;
    }
  }
  
  console.log(`✅ Correcciones generadas: ${Object.keys(corrections).length}`);
  console.log(`\nEjemplos:`);
  
  const examples = Object.entries(corrections).slice(0, 20);
  examples.forEach(([typo, correct]) => {
    console.log(`   '${typo}': '${correct}',`);
  });
  
  return corrections;
}

/**
 * Genera configuración para DEVICE_DISAMBIGUATION
 */
function generateDeviceConfig(data, keywordsByDevice) {
  console.log('\n⚙️  GENERANDO CONFIGURACIÓN DE DISPOSITIVOS');
  console.log('═══════════════════════════════════════\n');
  
  const deviceConfigs = {};
  
  for (const [deviceName, keywords] of Object.entries(keywordsByDevice)) {
    const topKeywords = keywords.slice(0, 15).map(([word]) => word);
    
    // Determinar label e icon según dispositivo
    let label = deviceName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let icon = '💾';
    let description = `Dispositivo de almacenamiento ${label}`;
    
    switch(deviceName) {
      case 'disco_rigido':
        icon = '💿';
        label = 'Disco Rígido / HDD';
        description = 'Disco duro interno (mecánico)';
        break;
      case 'disco_externo':
        icon = '🔌';
        label = 'Disco Externo';
        description = 'Disco duro externo por USB';
        break;
      case 'pendrive':
        icon = '📀';
        label = 'Pendrive / USB';
        description = 'Memoria USB flash drive';
        break;
      case 'ssd':
        icon = '⚡';
        label = 'SSD';
        description = 'Disco sólido (más rápido)';
        break;
      case 'tarjeta_sd':
        icon = '💳';
        label = 'Tarjeta SD / MicroSD';
        description = 'Tarjeta de memoria para cámaras/celulares';
        break;
    }
    
    deviceConfigs[deviceName] = {
      id: deviceName.toUpperCase(),
      icon,
      label,
      description,
      keywords: topKeywords
    };
  }
  
  console.log(`✅ Configuraciones generadas: ${Object.keys(deviceConfigs).length}\n`);
  
  for (const [device, config] of Object.entries(deviceConfigs)) {
    console.log(`   ${config.icon} ${config.label}`);
    console.log(`      Keywords: ${config.keywords.slice(0, 5).join(', ')}`);
    console.log();
  }
  
  return deviceConfigs;
}

/**
 * Guarda resultados del análisis en archivos JSON
 */
function saveResults(stats, keywords, typoCorrections, deviceConfigs) {
  console.log('💾 GUARDANDO RESULTADOS');
  console.log('═══════════════════════════════════════\n');
  
  // Crear directorio si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Guardar estadísticas
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'training-stats.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log(`   ✅ training-stats.json`);
  
  // Guardar keywords
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'keywords-by-device.json'),
    JSON.stringify(keywords, null, 2)
  );
  console.log(`   ✅ keywords-by-device.json`);
  
  // Guardar correcciones de typos
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'typo-corrections.json'),
    JSON.stringify(typoCorrections, null, 2)
  );
  console.log(`   ✅ typo-corrections.json`);
  
  // Guardar configuración de dispositivos
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'device-configs.json'),
    JSON.stringify(deviceConfigs, null, 2)
  );
  console.log(`   ✅ device-configs.json\n`);
}

// ============================================
// EJECUTAR ANÁLISIS
// ============================================

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                                                               ║');
console.log('║   🤖 TRAINING ML: ALMACENAMIENTO (17K CASOS)                 ║');
console.log('║   Sistema de Detección Inteligente con Machine Learning      ║');
console.log('║                                                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('\n');

try {
  // FASE 1: Cargar datos
  const data = loadTrainingData();
  
  // FASE 2: Analizar estructura
  const stats = analyzeStructure(data);
  
  // FASE 3: Extraer keywords
  const keywords = extractKeywords(data);
  
  // FASE 4: Analizar typos
  const { typoPatterns, typoExamples } = analyzeTypoPatterns(data);
  
  // FASE 5: Generar correcciones
  const typoCorrections = generateTypoCorrections(typoExamples);
  
  // FASE 6: Generar configuración de dispositivos
  const deviceConfigs = generateDeviceConfig(data, keywords);
  
  // FASE 7: Guardar resultados
  saveResults(stats, keywords, typoCorrections, deviceConfigs);
  
  // RESUMEN FINAL
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ TRAINING COMPLETADO                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📊 RESUMEN:`);
  console.log(`   • Dispositivos:     ${Object.keys(stats.devices).length}`);
  console.log(`   • Frases base:      ${stats.totalPhrases.toLocaleString()}`);
  console.log(`   • Variantes:        ${stats.totalVariants.toLocaleString()}`);
  console.log(`   • Total casos:      ${(stats.totalPhrases + stats.totalVariants).toLocaleString()}`);
  console.log(`   • Keywords únicos:  ${Object.values(keywords).flat().length}`);
  console.log(`   • Typo corrections: ${Object.keys(typoCorrections).length}`);
  console.log(`   • Device configs:   ${Object.keys(deviceConfigs).length}\n`);
  
  console.log(`📁 Archivos generados en: ${OUTPUT_DIR}/\n`);
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ ERROR durante el training:', error.message);
  console.error(error.stack);
  process.exit(1);
}
