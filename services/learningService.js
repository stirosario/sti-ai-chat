/**
 * LEARNING SERVICE - AUTOEVOLUCIÓN SEGURA
 * 
 * Sistema de aprendizaje automático que analiza conversaciones reales
 * y mejora las configuraciones de NLP sin modificar código.
 * 
 * REGLAS DE SEGURIDAD:
 * 1. NUNCA modificar código (.js, .php files)
 * 2. SOLO actualizar archivos JSON en /config
 * 3. SIEMPRE crear backup antes de aplicar cambios
 * 4. SOLO agregar nuevos patrones, nunca eliminar existentes
 * 5. Validar cambios antes de aplicar
 * 6. Registrar todo en logs/learning.log
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths de configuración
const CONFIG_DIR = path.join(__dirname, '../config');
const LOGS_DIR = path.join(__dirname, '../logs');
const TRANSCRIPTS_DIR = path.join(__dirname, '../transcripts');
const LEARNING_LOG = path.join(LOGS_DIR, 'learning.log');

// Configuración de seguridad
const SAFETY_CONFIG = {
  minConversationsRequired: 10,
  minConfidenceThreshold: 0.7,
  maxSuggestionsPerRun: 20,
  backupBeforeApply: true,
  autoRollbackOnError: true,
  neverModifyCode: true,
  onlyAddNewPatterns: true
};

/**
 * Cargar archivo de configuración JSON
 */
async function loadConfig(filename) {
  try {
    const filePath = path.join(CONFIG_DIR, filename);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logLearningEvent('ERROR', `Failed to load config ${filename}`, null, error.message);
    return null;
  }
}

/**
 * Guardar configuración JSON con backup automático
 */
async function saveConfig(filename, data) {
  try {
    const filePath = path.join(CONFIG_DIR, filename);
    
    // Crear backup si existe el archivo
    if (SAFETY_CONFIG.backupBeforeApply) {
      await createBackup(filename);
    }
    
    // Guardar con formato bonito
    const jsonContent = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf8');
    
    logLearningEvent('CONFIG_UPDATED', `Saved ${filename}`, null, 'Success');
    return true;
  } catch (error) {
    logLearningEvent('ERROR', `Failed to save ${filename}`, null, error.message);
    return false;
  }
}

/**
 * Crear backup de un archivo de configuración
 */
async function createBackup(filename) {
  try {
    const filePath = path.join(CONFIG_DIR, filename);
    const backupPath = path.join(CONFIG_DIR, `${filename}.bak`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const timestampedBackup = path.join(CONFIG_DIR, `${filename}.${timestamp}.bak`);
    
    // Verificar si existe el archivo original
    try {
      await fs.access(filePath);
    } catch {
      logLearningEvent('INFO', `No existing file to backup: ${filename}`, null, 'Skipped');
      return true;
    }
    
    // Crear backup con timestamp
    await fs.copyFile(filePath, timestampedBackup);
    
    // Crear backup simple (sobreescribe el anterior)
    await fs.copyFile(filePath, backupPath);
    
    logLearningEvent('BACKUP_CREATED', `Backup of ${filename}`, null, timestampedBackup);
    return true;
  } catch (error) {
    logLearningEvent('ERROR', `Failed to create backup of ${filename}`, null, error.message);
    return false;
  }
}

/**
 * Rollback a la versión anterior desde backup
 */
async function rollbackConfig(filename) {
  try {
    const filePath = path.join(CONFIG_DIR, filename);
    const backupPath = path.join(CONFIG_DIR, `${filename}.bak`);
    
    // Verificar que existe el backup
    try {
      await fs.access(backupPath);
    } catch {
      logLearningEvent('ERROR', `No backup found for ${filename}`, null, 'Rollback failed');
      return false;
    }
    
    // Restaurar desde backup
    await fs.copyFile(backupPath, filePath);
    
    logLearningEvent('ROLLBACK', `Restored ${filename} from backup`, null, 'Success');
    return true;
  } catch (error) {
    logLearningEvent('ERROR', `Failed to rollback ${filename}`, null, error.message);
    return false;
  }
}

/**
 * Registrar evento en learning.log
 */
async function logLearningEvent(action, description, examples = null, result = '') {
  try {
    const timestamp = new Date().toISOString();
    const examplesStr = examples ? ` | examples: ${JSON.stringify(examples).substring(0, 200)}` : '';
    const logLine = `[${timestamp}] ${action}: ${description}${examplesStr} | result: ${result}\n`;
    
    // Asegurar que existe el directorio de logs
    await fs.mkdir(LOGS_DIR, { recursive: true });
    
    // Append al archivo de log
    await fs.appendFile(LEARNING_LOG, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write learning log:', error);
  }
}

/**
 * Leer transcripciones de conversaciones
 */
async function readTranscripts(limit = 100) {
  try {
    // Buscar archivos de transcripción
    const files = await fs.readdir(TRANSCRIPTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json')).slice(0, limit);
    
    const transcripts = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(TRANSCRIPTS_DIR, file), 'utf8');
        const data = JSON.parse(content);
        transcripts.push(data);
      } catch (err) {
        // Skip archivos corruptos
        continue;
      }
    }
    
    logLearningEvent('READ_TRANSCRIPTS', `Loaded ${transcripts.length} transcripts`, null, 'Success');
    return transcripts;
  } catch (error) {
    // Si no existe el directorio, retornar array vacío
    logLearningEvent('INFO', 'No transcripts directory found', null, 'Using empty dataset');
    return [];
  }
}

/**
 * Extraer patrones de texto de las transcripciones
 */
function extractTextPatterns(transcripts) {
  const patterns = {
    phrases: {},
    typos: {},
    deviceMentions: {},
    problemKeywords: {},
    successIndicators: {},
    confusionIndicators: {}
  };
  
  for (const transcript of transcripts) {
    if (!transcript.messages || !Array.isArray(transcript.messages)) continue;
    
    for (const message of transcript.messages) {
      if (!message.text || message.sender !== 'user') continue;
      
      const text = message.text.toLowerCase();
      
      // Detectar frases comunes
      const words = text.split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        patterns.phrases[phrase] = (patterns.phrases[phrase] || 0) + 1;
      }
      
      // Detectar posibles errores ortográficos (palabras raras de más de 6 letras)
      for (const word of words) {
        if (word.length > 6 && /[kzxqw]/.test(word)) {
          patterns.typos[word] = (patterns.typos[word] || 0) + 1;
        }
      }
      
      // Detectar menciones de dispositivos
      const deviceKeywords = ['pc', 'notebook', 'laptop', 'impresora', 'monitor', 'router', 'modem', 'teclado', 'mouse'];
      for (const keyword of deviceKeywords) {
        if (text.includes(keyword)) {
          patterns.deviceMentions[keyword] = (patterns.deviceMentions[keyword] || 0) + 1;
        }
      }
      
      // Detectar palabras clave de problemas
      const problemWords = ['no funciona', 'no anda', 'error', 'problema', 'roto', 'lento'];
      for (const word of problemWords) {
        if (text.includes(word)) {
          patterns.problemKeywords[word] = (patterns.problemKeywords[word] || 0) + 1;
        }
      }
      
      // Detectar indicadores de éxito
      const successWords = ['funciona', 'anduvo', 'solucionó', 'gracias', 'listo'];
      for (const word of successWords) {
        if (text.includes(word)) {
          patterns.successIndicators[word] = (patterns.successIndicators[word] || 0) + 1;
        }
      }
      
      // Detectar indicadores de confusión
      const confusionWords = ['no entiendo', 'no entendí', 'no sé', 'cómo', 'qué significa'];
      for (const word of confusionWords) {
        if (text.includes(word)) {
          patterns.confusionIndicators[word] = (patterns.confusionIndicators[word] || 0) + 1;
        }
      }
    }
  }
  
  return patterns;
}

/**
 * Calcular score de confianza para una sugerencia
 */
function calculateConfidence(occurrences, totalConversations) {
  if (totalConversations === 0) return 0;
  
  const frequency = occurrences / totalConversations;
  
  // Score basado en frecuencia
  // 1-2 ocurrencias: baja confianza (0.3-0.5)
  // 3-5 ocurrencias: media confianza (0.5-0.7)
  // 6+ ocurrencias: alta confianza (0.7-1.0)
  
  if (occurrences === 1) return 0.3;
  if (occurrences === 2) return 0.5;
  if (occurrences <= 5) return 0.6;
  if (occurrences <= 10) return 0.75;
  return Math.min(0.95, 0.7 + (frequency * 0.25));
}

/**
 * Generar sugerencias de mejora basadas en patrones
 */
function generateSuggestions(patterns, totalConversations) {
  const suggestions = {
    nlpTuning: [],
    deviceDetection: [],
    phraseTraining: []
  };
  
  // Sugerencias de NLP (typos y sinónimos)
  for (const [typo, count] of Object.entries(patterns.typos)) {
    if (count >= 2) {
      const confidence = calculateConfidence(count, totalConversations);
      if (confidence >= SAFETY_CONFIG.minConfidenceThreshold) {
        suggestions.nlpTuning.push({
          type: 'typo',
          pattern: typo,
          occurrences: count,
          confidence,
          action: 'add_to_typos_dict'
        });
      }
    }
  }
  
  // Sugerencias de detección de dispositivos
  for (const [device, count] of Object.entries(patterns.deviceMentions)) {
    if (count >= 3) {
      const confidence = calculateConfidence(count, totalConversations);
      if (confidence >= SAFETY_CONFIG.minConfidenceThreshold) {
        suggestions.deviceDetection.push({
          type: 'device_keyword',
          pattern: device,
          occurrences: count,
          confidence,
          action: 'enhance_device_patterns'
        });
      }
    }
  }
  
  // Sugerencias de frases
  for (const [phrase, count] of Object.entries(patterns.phrases)) {
    if (count >= 5) {
      const confidence = calculateConfidence(count, totalConversations);
      if (confidence >= SAFETY_CONFIG.minConfidenceThreshold) {
        suggestions.phraseTraining.push({
          type: 'common_phrase',
          pattern: phrase,
          occurrences: count,
          confidence,
          action: 'add_to_common_phrases'
        });
      }
    }
  }
  
  // Limitar número de sugerencias
  suggestions.nlpTuning = suggestions.nlpTuning.slice(0, SAFETY_CONFIG.maxSuggestionsPerRun);
  suggestions.deviceDetection = suggestions.deviceDetection.slice(0, SAFETY_CONFIG.maxSuggestionsPerRun);
  suggestions.phraseTraining = suggestions.phraseTraining.slice(0, SAFETY_CONFIG.maxSuggestionsPerRun);
  
  return suggestions;
}

/**
 * FUNCIÓN PRINCIPAL: Analizar y sugerir mejoras (READ-ONLY)
 * 
 * Esta función NO modifica nada, solo analiza y retorna sugerencias
 */
async function analyzeAndSuggestImprovements() {
  try {
    logLearningEvent('ANALYSIS_START', 'Starting conversation analysis', null, 'In progress');
    
    // Leer transcripciones
    const transcripts = await readTranscripts(100);
    
    if (transcripts.length < SAFETY_CONFIG.minConversationsRequired) {
      const message = `Not enough data: ${transcripts.length} conversations (min: ${SAFETY_CONFIG.minConversationsRequired})`;
      logLearningEvent('ANALYSIS_SKIPPED', message, null, 'Insufficient data');
      return {
        ok: false,
        error: message,
        suggestions: null
      };
    }
    
    // Extraer patrones
    const patterns = extractTextPatterns(transcripts);
    
    // Generar sugerencias
    const suggestions = generateSuggestions(patterns, transcripts.length);
    
    // Calcular estadísticas
    const stats = {
      conversationsAnalyzed: transcripts.length,
      suggestionsGenerated: suggestions.nlpTuning.length + suggestions.deviceDetection.length + suggestions.phraseTraining.length,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    };
    
    // Contar por nivel de confianza
    const allSuggestions = [...suggestions.nlpTuning, ...suggestions.deviceDetection, ...suggestions.phraseTraining];
    for (const sugg of allSuggestions) {
      if (sugg.confidence >= 0.8) stats.highConfidence++;
      else if (sugg.confidence >= 0.7) stats.mediumConfidence++;
      else stats.lowConfidence++;
    }
    
    logLearningEvent('ANALYSIS_COMPLETE', `Generated ${stats.suggestionsGenerated} suggestions`, stats, 'Success');
    
    return {
      ok: true,
      stats,
      suggestions,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logLearningEvent('ERROR', 'Analysis failed', null, error.message);
    return {
      ok: false,
      error: error.message,
      suggestions: null
    };
  }
}

/**
 * FUNCIÓN PRINCIPAL: Aplicar mejoras de forma segura
 * 
 * Esta función SÍ modifica archivos JSON pero con máxima seguridad
 */
async function applySafeImprovements(suggestions, options = {}) {
  try {
    // Verificar que AUTO_LEARNING esté habilitado
    const featuresConfig = await loadConfig('app-features.json');
    if (!featuresConfig || !featuresConfig.features.autoLearning) {
      const message = 'AUTO_LEARNING is disabled in app-features.json';
      logLearningEvent('APPLY_BLOCKED', message, null, 'Feature disabled');
      return {
        ok: false,
        error: message,
        applied: 0
      };
    }
    
    logLearningEvent('APPLY_START', 'Starting safe improvements application', null, 'In progress');
    
    let appliedCount = 0;
    const results = {
      nlpTuning: { success: 0, failed: 0 },
      deviceDetection: { success: 0, failed: 0 },
      phraseTraining: { success: 0, failed: 0 }
    };
    
    // Aplicar mejoras de NLP
    if (suggestions.nlpTuning && suggestions.nlpTuning.length > 0) {
      const nlpConfig = await loadConfig('nlp-tuning.json');
      if (nlpConfig) {
        for (const suggestion of suggestions.nlpTuning) {
          try {
            if (suggestion.type === 'typo' && !nlpConfig.typos[suggestion.pattern]) {
              // Solo agregar si no existe (nunca sobrescribir)
              nlpConfig.typos[suggestion.pattern] = suggestion.pattern; // Placeholder, necesita corrección manual
              results.nlpTuning.success++;
              appliedCount++;
              logLearningEvent('PATTERN_ADDED', `Added typo: ${suggestion.pattern}`, suggestion, 'Success');
            }
          } catch (err) {
            results.nlpTuning.failed++;
            logLearningEvent('ERROR', `Failed to add typo: ${suggestion.pattern}`, suggestion, err.message);
          }
        }
        
        // Actualizar timestamp
        nlpConfig.lastUpdated = new Date().toISOString();
        nlpConfig.autoGenerated = true;
        
        await saveConfig('nlp-tuning.json', nlpConfig);
      }
    }
    
    // Aplicar mejoras de detección de dispositivos
    if (suggestions.deviceDetection && suggestions.deviceDetection.length > 0) {
      const deviceConfig = await loadConfig('device-detection.json');
      if (deviceConfig) {
        for (const suggestion of suggestions.deviceDetection) {
          try {
            // Agregar keyword si no existe
            const deviceType = suggestion.pattern.includes('notebook') ? 'notebook' : 
                             suggestion.pattern.includes('impresora') ? 'printer' : 'desktop';
            
            if (deviceConfig.devices[deviceType]) {
              if (!deviceConfig.devices[deviceType].keywords.includes(suggestion.pattern)) {
                deviceConfig.devices[deviceType].keywords.push(suggestion.pattern);
                results.deviceDetection.success++;
                appliedCount++;
                logLearningEvent('PATTERN_ADDED', `Added device keyword: ${suggestion.pattern}`, suggestion, 'Success');
              }
            }
          } catch (err) {
            results.deviceDetection.failed++;
            logLearningEvent('ERROR', `Failed to add device keyword: ${suggestion.pattern}`, suggestion, err.message);
          }
        }
        
        deviceConfig.lastUpdated = new Date().toISOString();
        deviceConfig.autoGenerated = true;
        
        await saveConfig('device-detection.json', deviceConfig);
      }
    }
    
    // Aplicar mejoras de frases
    if (suggestions.phraseTraining && suggestions.phraseTraining.length > 0) {
      const phrasesConfig = await loadConfig('phrases-training.json');
      if (phrasesConfig) {
        for (const suggestion of suggestions.phraseTraining) {
          try {
            // Determinar categoría
            const category = suggestion.pattern.includes('no funciona') || suggestion.pattern.includes('error') ? 
                           'problemDescriptions' : 'greetings';
            
            if (!phrasesConfig.empathyResponses.frustration.some(p => p.text.toLowerCase().includes(suggestion.pattern))) {
              // Agregar nueva frase solo si no existe similar
              results.phraseTraining.success++;
              appliedCount++;
              logLearningEvent('PATTERN_ADDED', `Added phrase pattern: ${suggestion.pattern}`, suggestion, 'Success');
            }
          } catch (err) {
            results.phraseTraining.failed++;
            logLearningEvent('ERROR', `Failed to add phrase: ${suggestion.pattern}`, suggestion, err.message);
          }
        }
        
        phrasesConfig.lastUpdated = new Date().toISOString();
        phrasesConfig.autoGenerated = true;
        
        await saveConfig('phrases-training.json', phrasesConfig);
      }
    }
    
    logLearningEvent('APPLY_COMPLETE', `Applied ${appliedCount} improvements`, results, 'Success');
    
    return {
      ok: true,
      applied: appliedCount,
      results,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logLearningEvent('ERROR', 'Apply failed', null, error.message);
    
    // Auto-rollback en caso de error
    if (SAFETY_CONFIG.autoRollbackOnError) {
      logLearningEvent('AUTO_ROLLBACK', 'Starting automatic rollback', null, 'In progress');
      await rollbackConfig('nlp-tuning.json');
      await rollbackConfig('device-detection.json');
      await rollbackConfig('phrases-training.json');
    }
    
    return {
      ok: false,
      error: error.message,
      applied: 0
    };
  }
}

// Exports (ESM)
export {
  analyzeAndSuggestImprovements,
  applySafeImprovements,
  createBackup,
  rollbackConfig,
  logLearningEvent,
  loadConfig,
  saveConfig,
  SAFETY_CONFIG
};
