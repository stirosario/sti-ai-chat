/**
 * TRAINING ML: Impresoras & Digitalización
 * Procesa impresion_digitalizacion.json (15,041 líneas)
 * Extrae keywords, typos y device configs automáticamente
 */

import fs from 'fs';
import path from 'path';

// Configuración
const JSON_PATH = 'e:\\Lucas\\Downloads\\sti_dispositivos_problemas_por_categoria\\impresion_digitalizacion.json';
const OUTPUT_DIR = './training-results-impresion';

// Stopwords para filtrar
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'en', 'a', 'para', 'con', 'por', 'que',
  'mi', 'tu', 'su', 'no', 'si', 'es', 'son', 'cuando', 'desde', 'todo', 'cada', 'muy', 'mas', 'más',
  'bien', 'mal', 'vez', 'veces', 'hacer', 'hace', 'hacen', 'hizo', 'dio', 'da', 'dan'
]);

/**
 * FASE 1: Cargar JSON completo
 */
function loadTrainingData() {
  console.log('\n📂 Cargando impresion_digitalizacion.json...');
  const content = fs.readFileSync(JSON_PATH, 'utf-8');
  console.log(`✅ Archivo cargado: ${content.length.toLocaleString()} caracteres\n`);
  return JSON.parse(content);
}

/**
 * FASE 2: Analizar estructura
 */
function analyzeStructure(data) {
  console.log('🔍 ANÁLISIS DE ESTRUCTURA');
  console.log(`📦 Categoría: ${data.category}`);
  
  const devices = Object.keys(data.devices);
  console.log(`📊 Dispositivos encontrados: ${devices.length}\n`);
  
  const stats = {};
  let totalBase = 0;
  let totalVariants = 0;
  
  console.log('Desglose por dispositivo:');
  for (const deviceName of devices) {
    const deviceData = data.devices[deviceName];
    const frases = deviceData.es || [];
    const base = frases.length;
    const variants = frases.reduce((sum, frase) => sum + (frase.variants?.length || 0), 0);
    
    stats[deviceName] = { base, variants, total: base + variants };
    totalBase += base;
    totalVariants += variants;
    
    console.log(`- ${deviceName}: ${base} base + ${variants} variantes = ${base + variants} casos`);
  }
  
  console.log(`\nTOTALES: ${totalBase} frases base + ${totalVariants} variantes = ${totalBase + totalVariants} casos\n`);
  
  return { devices, stats, totalBase, totalVariants };
}

/**
 * FASE 3: Extraer keywords por dispositivo
 */
function extractKeywords(data, devices) {
  console.log('🔑 EXTRACCIÓN DE KEYWORDS\n');
  
  const keywordsByDevice = {};
  
  for (const deviceName of devices) {
    const deviceData = data.devices[deviceName];
    const frases = deviceData.es || [];
    
    // Contar frecuencia de palabras
    const wordFreq = {};
    
    for (const frase of frases) {
      const text = frase.base.toLowerCase();
      const words = text.match(/\b\w+\b/g) || [];
      
      for (const word of words) {
        if (word.length >= 3 && !STOPWORDS.has(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      }
    }
    
    // Top 20 keywords
    const sorted = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20);
    
    keywordsByDevice[deviceName] = sorted;
    
    console.log(`Top keywords por dispositivo:`);
    console.log(`- ${deviceName}: ${sorted.slice(0, 5).map(([w, c]) => `${w}(${c})`).join(', ')}`);
  }
  
  console.log();
  return keywordsByDevice;
}

/**
 * FASE 4: Analizar patrones de typos
 */
function analyzeTypoPatterns(data) {
  console.log('🔤 ANÁLISIS DE PATRONES DE TYPOS\n');
  
  const typoExamples = [];
  let variantCount = 0;
  
  for (const deviceName in data.devices) {
    const frases = data.devices[deviceName].es || [];
    
    for (const frase of frases) {
      const base = frase.base;
      const variants = frase.variants || [];
      variantCount += variants.length;
      
      // Capturar primeras 100 variantes únicas como ejemplos
      if (typoExamples.length < 100) {
        variants.slice(0, 5).forEach(v => {
          if (typoExamples.length < 100) {
            typoExamples.push({ base, variant: v });
          }
        });
      }
    }
  }
  
  console.log(`📊 Variantes analizadas: ${variantCount.toLocaleString()}`);
  console.log(`📝 Ejemplos de typos únicos: ${typoExamples.length}\n`);
  
  // Detectar patrones comunes
  const omissions = [];
  const duplications = [];
  
  for (const { base, variant } of typoExamples.slice(0, 50)) {
    const baseWords = base.toLowerCase().match(/\b\w+\b/g) || [];
    const variantWords = variant.toLowerCase().match(/\b\w+\b/g) || [];
    
    for (let i = 0; i < Math.min(baseWords.length, variantWords.length); i++) {
      const original = baseWords[i];
      const modified = variantWords[i];
      
      if (original !== modified && original.length > 3) {
        // Omisión: palabra más corta
        if (modified.length < original.length && modified.length >= 3) {
          omissions.push(`"${original}" → "${modified}"`);
        }
        // Duplicación: letra repetida
        if (modified.length > original.length) {
          duplications.push(`"${original}" → "${modified}"`);
        }
      }
    }
  }
  
  console.log(`Top 10 Omisiones detectadas:`);
  omissions.slice(0, 10).forEach(o => console.log(`- ${o}`));
  
  console.log(`\nTop 10 Duplicaciones:`);
  duplications.slice(0, 10).forEach(d => console.log(`- ${d}`));
  
  console.log();
  return { omissions, duplications, typoExamples };
}

/**
 * FASE 5: Generar diccionario de correcciones
 */
function generateTypoCorrections(patterns) {
  console.log('💾 GENERANDO DICCIONARIO DE CORRECCIONES\n');
  
  const corrections = {};
  const { omissions, duplications } = patterns;
  
  // Procesar omisiones
  for (const omission of omissions.slice(0, 40)) {
    const match = omission.match(/"([^"]+)" → "([^"]+)"/);
    if (match) {
      corrections[match[2]] = match[1]; // typo → correcto
    }
  }
  
  // Procesar duplicaciones
  for (const dup of duplications.slice(0, 40)) {
    const match = dup.match(/"([^"]+)" → "([^"]+)"/);
    if (match) {
      corrections[match[2]] = match[1]; // typo → correcto
    }
  }
  
  console.log(`✅ Correcciones generadas: ${Object.keys(corrections).length}`);
  console.log(`Ejemplos: ${Object.entries(corrections).slice(0, 10).map(([k, v]) => `${k}→${v}`).join(', ')}\n`);
  
  return corrections;
}

/**
 * FASE 6: Generar configuración de dispositivos
 */
function generateDeviceConfig(devices, keywordsByDevice) {
  console.log('⚙️ GENERANDO CONFIGURACIÓN DE DISPOSITIVOS\n');
  
  const deviceIcons = {
    'impresora_laser': '🖨️',
    'impresora_tinta': '🖨️',
    'impresora_matricial': '🖨️',
    'multifuncion': '🖨️📠',
    'escaner': '📠',
    'plotter': '🖨️📐'
  };
  
  const deviceLabels = {
    'impresora_laser': 'Impresora Láser',
    'impresora_tinta': 'Impresora de Tinta / Inkjet',
    'impresora_matricial': 'Impresora Matricial',
    'multifuncion': 'Multifunción (Impresora + Escáner)',
    'escaner': 'Escáner',
    'plotter': 'Plotter'
  };
  
  const configs = {};
  
  for (const deviceName of devices) {
    const keywords = keywordsByDevice[deviceName].slice(0, 15).map(([word]) => word);
    
    configs[deviceName] = {
      id: deviceName.toUpperCase(),
      icon: deviceIcons[deviceName] || '🖨️',
      label: deviceLabels[deviceName] || deviceName,
      description: `Dispositivo de impresión/digitalización ${deviceLabels[deviceName] || deviceName}`,
      keywords
    };
    
    console.log(`✅ Configuraciones generadas: ${Object.keys(configs).length}`);
    console.log(`- ${deviceIcons[deviceName] || '🖨️'} ${deviceLabels[deviceName] || deviceName} (keywords: ${keywords.slice(0, 5).join(', ')})`);
  }
  
  console.log();
  return configs;
}

/**
 * FASE 7: Guardar resultados
 */
function saveResults(stats, keywordsByDevice, typoCorrections, deviceConfigs) {
  console.log('💾 GUARDANDO RESULTADOS\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 1. Estadísticas
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'training-stats.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log('✅ training-stats.json');
  
  // 2. Keywords
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'keywords-by-device.json'),
    JSON.stringify(keywordsByDevice, null, 2)
  );
  console.log('✅ keywords-by-device.json');
  
  // 3. Typo corrections
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'typo-corrections.json'),
    JSON.stringify(typoCorrections, null, 2)
  );
  console.log('✅ typo-corrections.json');
  
  // 4. Device configs
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'device-configs.json'),
    JSON.stringify(deviceConfigs, null, 2)
  );
  console.log('✅ device-configs.json\n');
}

/**
 * MAIN EXECUTION
 */
async function main() {
  try {
    // Cargar datos
    const data = loadTrainingData();
    
    // Analizar estructura
    const { devices, stats, totalBase, totalVariants } = analyzeStructure(data);
    
    // Extraer keywords
    const keywordsByDevice = extractKeywords(data, devices);
    
    // Analizar typos
    const typoPatterns = analyzeTypoPatterns(data);
    
    // Generar correcciones
    const typoCorrections = generateTypoCorrections(typoPatterns);
    
    // Generar configs
    const deviceConfigs = generateDeviceConfig(devices, keywordsByDevice);
    
    // Guardar todo
    saveResults(stats, keywordsByDevice, typoCorrections, deviceConfigs);
    
    // Resumen final
    console.log('✅ TRAINING COMPLETADO');
    console.log('📊 RESUMEN:');
    console.log(`• Dispositivos: ${devices.length}`);
    console.log(`• Frases base: ${totalBase}`);
    console.log(`• Variantes: ${totalVariants.toLocaleString()}`);
    console.log(`• Total casos: ${(totalBase + totalVariants).toLocaleString()}`);
    console.log(`• Keywords únicos: ${Object.keys(keywordsByDevice).length * 20}`);
    console.log(`• Typo corrections: ${Object.keys(typoCorrections).length}`);
    console.log(`• Device configs: ${Object.keys(deviceConfigs).length}`);
    console.log(`📁 Archivos generados en: ${OUTPUT_DIR}/\n`);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
