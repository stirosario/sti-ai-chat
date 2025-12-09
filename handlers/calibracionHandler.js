/**
 * handlers/calibracionHandler.js
 * Integración de la herramienta de calibración conversacional con el bot
 * Lee la configuración desde public_html/calibracion/config.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al archivo de configuración de calibración
// Intentar múltiples rutas posibles para compatibilidad
const possiblePaths = [
  path.join(__dirname, '../../STI/public_html/calibracion/config.json'), // Desarrollo local Windows
  path.join(process.cwd(), '../STI/public_html/calibracion/config.json'), // Alternativa
  path.join(process.cwd(), 'public_html/calibracion/config.json'), // Si está en el mismo directorio
  '/app/public_html/calibracion/config.json', // Render/producción
  path.join(process.cwd(), 'calibracion/config.json') // Fallback
];

// Encontrar la primera ruta que existe
let CALIBRACION_CONFIG_PATH = null;
for (const p of possiblePaths) {
  try {
    if (fs.existsSync(p)) {
      CALIBRACION_CONFIG_PATH = p;
      console.log('[CALIBRACION] Config path found:', p);
      break;
    }
  } catch (e) {
    // Continuar buscando
  }
}

// Si no se encuentra, usar la primera como default
if (!CALIBRACION_CONFIG_PATH) {
  CALIBRACION_CONFIG_PATH = possiblePaths[0];
  console.log('[CALIBRACION] Using default config path:', CALIBRACION_CONFIG_PATH);
}

let calibracionCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minuto

/**
 * Obtener ruta del directorio de calibración
 */
function getCalibracionDir() {
  return path.dirname(CALIBRACION_CONFIG_PATH);
}

/**
 * Cargar configuración de calibración (con caché)
 */
function loadCalibracionConfig() {
  const now = Date.now();
  
  // Usar caché si está vigente
  if (calibracionCache && (now - cacheTimestamp) < CACHE_TTL) {
    return calibracionCache;
  }
  
  try {
    if (!fs.existsSync(CALIBRACION_CONFIG_PATH)) {
      console.log('[CALIBRACION] Config file not found at:', CALIBRACION_CONFIG_PATH);
      console.log('[CALIBRACION] Attempting to create default config...');
      
      // Crear directorio si no existe
      const calibDir = getCalibracionDir();
      if (!fs.existsSync(calibDir)) {
        fs.mkdirSync(calibDir, { recursive: true });
        console.log('[CALIBRACION] Created directory:', calibDir);
      }
      
      return null;
    }
    
    const content = fs.readFileSync(CALIBRACION_CONFIG_PATH, 'utf8');
    const config = JSON.parse(content);
    
    calibracionCache = config;
    cacheTimestamp = now;
    
    console.log('[CALIBRACION] Config loaded successfully');
    return config;
  } catch (error) {
    console.error('[CALIBRACION] Error loading config:', error.message);
    return null;
  }
}

/**
 * Normalizar entrada usando reglas de calibración
 */
export function normalizeWithCalibracion(input, nodeId) {
  if (!input || typeof input !== 'string') return input;
  
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return input;
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node || !node.normalizationRules) return input;
  
  const rules = node.normalizationRules;
  let normalized = input;
  
  // Convertir a minúsculas si está habilitado
  if (rules.toLowerCase !== false) {
    normalized = normalized.toLowerCase();
  }
  
  // Eliminar espacios en blanco
  if (rules.trimWhitespace !== false) {
    normalized = normalized.trim();
  }
  
  // Remover prefijos
  if (rules.removePrefixes && Array.isArray(rules.removePrefixes)) {
    for (const prefix of rules.removePrefixes) {
      const prefixLower = prefix.toLowerCase();
      // Remover si está al inicio
      if (normalized.toLowerCase().startsWith(prefixLower)) {
        normalized = normalized.substring(prefixLower.length).trim();
      }
      // También remover si está como palabra completa al inicio
      const regex = new RegExp(`^\\s*${prefixLower}\\s+`, 'i');
      normalized = normalized.replace(regex, '').trim();
    }
  }
  
  // Remover sufijos
  if (rules.removeSuffixes && Array.isArray(rules.removeSuffixes)) {
    for (const suffix of rules.removeSuffixes) {
      const suffixLower = suffix.toLowerCase();
      if (normalized.toLowerCase().endsWith(suffixLower)) {
        normalized = normalized.substring(0, normalized.length - suffixLower.length).trim();
      }
    }
  }
  
  return normalized;
}

/**
 * Buscar coincidencia en patrones de calibración
 */
export function matchCalibracionPattern(input, nodeId) {
  if (!input || typeof input !== 'string') return null;
  
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return null;
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node || !node.patterns) return null;
  
  // Normalizar entrada primero
  const normalized = normalizeWithCalibracion(input, nodeId);
  
  // Buscar en patrones
  for (const pattern of node.patterns) {
    // Convertir patrón a regex (buscar como palabra completa)
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) {
      return {
        matched: true,
        pattern: pattern,
        normalized: normalized,
        extracted: normalized
      };
    }
  }
  
  return null;
}

/**
 * Obtener respuesta del bot según calibración
 */
export function getCalibracionResponse(nodeId, matchedKeyword = null) {
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return null;
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node || !node.botResponses) return null;
  
  // Si hay una palabra clave coincidente, usar su respuesta específica
  if (matchedKeyword && node.botResponses[matchedKeyword]) {
    return node.botResponses[matchedKeyword];
  }
  
  // Usar respuesta por defecto
  return node.botResponses.default || null;
}

/**
 * Extraer palabras clave según calibración
 */
export function extractCalibracionKeywords(input, nodeId) {
  if (!input || typeof input !== 'string') return {};
  
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return {};
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node || !node.keywords) return {};
  
  const normalized = normalizeWithCalibracion(input, nodeId);
  const extracted = {};
  
  for (const [key, keyword] of Object.entries(node.keywords)) {
    if (normalized.includes(keyword.toLowerCase())) {
      extracted[key] = keyword;
    }
  }
  
  return extracted;
}

/**
 * Validar entrada según reglas de calibración
 */
export function validateWithCalibracion(input, nodeId) {
  if (!input || typeof input !== 'string') return { valid: true, errors: [] };
  
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return { valid: true, errors: [] };
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node || !node.validation) return { valid: true, errors: [] };
  
  const validation = node.validation;
  const errors = [];
  
  if (validation.minLength && input.length < validation.minLength) {
    errors.push(`Mínimo ${validation.minLength} caracteres`);
  }
  
  if (validation.maxLength && input.length > validation.maxLength) {
    errors.push(`Máximo ${validation.maxLength} caracteres`);
  }
  
  if (validation.pattern) {
    try {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(input)) {
        errors.push('Formato inválido');
      }
    } catch (e) {
      console.error('[CALIBRACION] Invalid regex pattern:', validation.pattern);
    }
  }
  
  if (validation.allowNumbers === false && /\d/.test(input)) {
    errors.push('No se permiten números');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Registrar fallo de reconocimiento
 */
export function logCalibracionFailure(nodeId, userInput, reason = 'No match found') {
  // Usar el mismo directorio que el config
  const calibracionDir = getCalibracionDir();
  const failuresPath = path.join(calibracionDir, 'failures.json');
  
  try {
    let failures = [];
    if (fs.existsSync(failuresPath)) {
      const content = fs.readFileSync(failuresPath, 'utf8');
      failures = JSON.parse(content) || [];
    }
    
    const failure = {
      nodeId: nodeId,
      userInput: userInput,
      reason: reason,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0]
    };
    
    failures.push(failure);
    
    // Mantener solo los últimos 1000 fallos
    if (failures.length > 1000) {
      failures = failures.slice(-1000);
    }
    
    fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2), 'utf8');
    console.log('[CALIBRACION] Failure logged:', nodeId, userInput);
  } catch (error) {
    console.error('[CALIBRACION] Error logging failure:', error.message);
  }
}

/**
 * Registrar éxito de reconocimiento
 */
export function logCalibracionSuccess(nodeId) {
  // Actualizar métricas en la configuración
  const config = loadCalibracionConfig();
  if (!config || !config.nodes) return;
  
  const node = config.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  if (!node.metrics) {
    node.metrics = {
      totalAttempts: 0,
      successfulMatches: 0,
      failedMatches: 0,
      lastFailure: null
    };
  }
  
  node.metrics.totalAttempts = (node.metrics.totalAttempts || 0) + 1;
  node.metrics.successfulMatches = (node.metrics.successfulMatches || 0) + 1;
  
  // Guardar actualización
  try {
    config.lastModified = new Date().toISOString();
    fs.writeFileSync(CALIBRACION_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    // Invalidar caché
    calibracionCache = null;
  } catch (error) {
    console.error('[CALIBRACION] Error updating metrics:', error.message);
  }
}

