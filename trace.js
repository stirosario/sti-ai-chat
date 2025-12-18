/**
 * trace.js - Sistema de Tracing Centralizado
 * 
 * Proporciona logging estructurado y exhaustivo para depuración y análisis.
 * Cada evento se guarda en formato JSONL (una línea por evento) para performance.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio para traces
const TRACES_DIR = path.join(__dirname, 'data', 'traces');
const LIVE_EVENTS_FILE = path.join(__dirname, 'data', 'live-events.jsonl');
const MAX_LIVE_EVENTS = 2000; // Buffer circular: mantener últimos 2000 eventos

// Asegurar que el directorio existe
if (!fsSync.existsSync(TRACES_DIR)) {
  fsSync.mkdirSync(TRACES_DIR, { recursive: true });
}

// Buffer circular en memoria para live events (últimos N eventos)
let liveEventsBuffer = [];
let bootIdToConversationId = new Map(); // Mapeo boot_id -> conversation_id

// Cache de versiones y commit hash (se calcula una vez)
let serverVersion = null;
let commitHash = null;

/**
 * Obtiene la versión del servidor y commit hash (si existe)
 */
function getServerInfo() {
  if (serverVersion === null) {
    try {
      const packageJson = JSON.parse(fsSync.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
      serverVersion = packageJson.version || '2.0.0';
    } catch {
      serverVersion = '2.0.0';
    }
  }
  
  if (commitHash === null) {
    try {
      // Intentar leer .git/HEAD y luego el commit hash
      const headPath = path.join(__dirname, '.git', 'HEAD');
      if (fsSync.existsSync(headPath)) {
        const head = fsSync.readFileSync(headPath, 'utf-8').trim();
        if (head.startsWith('ref: ')) {
          const refPath = path.join(__dirname, '.git', head.substring(5));
          if (fsSync.existsSync(refPath)) {
            commitHash = fsSync.readFileSync(refPath, 'utf-8').trim().substring(0, 7);
          }
        } else {
          commitHash = head.substring(0, 7);
        }
      }
    } catch {
      commitHash = null;
    }
  }
  
  return { version: serverVersion, commitHash };
}

/**
 * Sanitiza un payload para no exponer secretos
 */
function sanitize(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  
  const sensitiveKeys = [
    'api_key', 'apiKey', 'apikey',
    'token', 'access_token', 'refresh_token',
    'password', 'passwd', 'pwd',
    'secret', 'secret_key', 'secretKey',
    'authorization', 'auth',
    'openai_api_key', 'OPENAI_API_KEY'
  ];
  
  const sanitized = { ...payload };
  
  for (const key in sanitized) {
    const keyLower = key.toLowerCase();
    
    // Si la clave es sensible, reemplazar con [REDACTED]
    if (sensitiveKeys.some(sk => keyLower.includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    // Si el valor es un objeto, sanitizar recursivamente
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitize(sanitized[key]);
    }
    
    // Si es un array de objetos, sanitizar cada elemento
    if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map(item => 
        typeof item === 'object' && item !== null ? sanitize(item) : item
      );
    }
  }
  
  return sanitized;
}

/**
 * Genera un boot_id (UUID corto) para identificar requests antes de conversation_id
 */
export function generateBootId() {
  return `boot-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Vincula boot_id a conversation_id cuando se genera
 */
export function linkBootIdToConversationId(bootId, conversationId) {
  if (bootId && conversationId) {
    bootIdToConversationId.set(bootId, conversationId);
  }
}

/**
 * Obtiene conversation_id asociado a un boot_id
 */
export function getConversationIdFromBootId(bootId) {
  return bootIdToConversationId.get(bootId) || null;
}

/**
 * Crea un contexto de trace para una conversación
 */
export function createTraceContext(conversationId, requestId, messageId = null, stage = null, env = null, version = null, bootId = null) {
  const serverInfo = getServerInfo();
  const envValue = env || process.env.NODE_ENV || 'production';
  
  // Si hay boot_id pero no conversation_id, intentar obtenerlo del mapeo
  let finalConversationId = conversationId;
  if (!finalConversationId && bootId) {
    finalConversationId = getConversationIdFromBootId(bootId);
  }
  
  return {
    conversation_id: finalConversationId,
    boot_id: bootId, // SIEMPRE incluir boot_id
    request_id: requestId || `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    message_id: messageId,
    stage: stage,
    env: envValue,
    version: version || serverInfo.version,
    commit_hash: serverInfo.commitHash,
    timestamp: new Date().toISOString()
  };
}

/**
 * Registra un evento en el trace y en live events
 */
export async function logEvent(level, type, payload = {}, context = null) {
  // SIEMPRE loguear si hay boot_id, incluso sin conversation_id
  if (!context || !context.boot_id) {
    // Si no hay contexto válido, no loguear (evitar errores)
    return;
  }
  
  const event = {
    // ============================================
    // METADATA DE CORRELACIÓN (OBLIGATORIO)
    // ============================================
    conversation_id: context.conversation_id || null, // Puede ser null si aún no se generó
    boot_id: context.boot_id, // SIEMPRE presente
    request_id: context.request_id || `req-${Date.now()}`,
    event_id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: context.timestamp || new Date().toISOString(),
    env: context.env || process.env.NODE_ENV || 'production',
    version: context.version || getServerInfo().version,
    commit_hash: context.commit_hash || getServerInfo().commitHash,
    stage: context.stage || null,
    actor: payload.actor || 'system',
    message_id: context.message_id || null,
    endpoint: payload.endpoint || context.endpoint || null,
    
    // ============================================
    // INFORMACIÓN DEL EVENTO
    // ============================================
    level: level.toUpperCase(), // INFO, WARN, ERROR, DEBUG
    type: type,
    payload: sanitize(payload),
    
    // ============================================
    // CONTEXTO DEL SISTEMA (PARA DIAGNÓSTICO)
    // ============================================
    // Estado esperado vs real
    expected_behavior: payload.expected_behavior || payload.expected || null, // Lo que se esperaba
    actual_behavior: payload.actual_behavior || payload.actual || null, // Lo que realmente pasó
    expected_result: payload.expected_result || null, // Resultado esperado
    actual_result: payload.actual_result || null, // Resultado real
    
    // Condiciones previas
    preconditions: payload.preconditions || null, // Estado previo necesario
    conditions_met: payload.conditions_met !== undefined ? payload.conditions_met : null, // Si se cumplieron
    
    // Decisiones y razonamiento
    decision_reason: payload.decision_reason || payload.reason || null, // Por qué se tomó una decisión
    decision_evidence: payload.decision_evidence || payload.evidence || null, // Evidencia que llevó a la decisión
    decision_outcome: payload.decision_outcome || payload.outcome || null, // Resultado de la decisión
    
    // Flujo y transiciones
    flow_step: payload.flow_step || null, // Paso del flujo
    flow_previous_step: payload.flow_previous_step || null, // Paso anterior
    flow_next_step: payload.flow_next_step || null, // Siguiente paso esperado
    
    // Validaciones y verificaciones
    validation_passed: payload.validation_passed !== undefined ? payload.validation_passed : null,
    validation_errors: payload.validation_errors || null,
    validation_rules: payload.validation_rules || null,
    
    // ============================================
    // INFORMACIÓN TÉCNICA
    // ============================================
    latency_ms: payload.latency_ms || null,
    file: payload.file || null,
    module: payload.module || null,
    function_name: payload.function_name || payload.fn || null, // Nombre de la función
    line_number: payload.line_number || payload.line || null, // Línea de código (si aplica)
    
    // Stack trace si hay error
    error_stack: payload.error_stack || (payload.error && payload.error.stack) || null,
    error_name: payload.error_name || (payload.error && payload.error.name) || null,
    error_message: payload.error_message || (payload.error && payload.error.message) || null,
    
    // ============================================
    // INFORMACIÓN ADICIONAL PARA REPARACIÓN
    // ============================================
    // Variables de estado relevantes
    state_snapshot: payload.state_snapshot || null, // Snapshot del estado en este momento
    variables: payload.variables || null, // Variables relevantes
    
    // Configuración y parámetros
    config_used: payload.config_used || null, // Configuración aplicada
    parameters: payload.parameters || null, // Parámetros de la operación
    
    // Dependencias y recursos
    dependencies: payload.dependencies || null, // Dependencias usadas
    resources_accessed: payload.resources_accessed || null, // Recursos accedidos
    
    // Información de debugging
    debug_info: payload.debug_info || null, // Información adicional para debugging
    troubleshooting_hints: payload.troubleshooting_hints || null, // Pistas para troubleshooting
    suggested_fix: payload.suggested_fix || null // Sugerencia de reparación (si aplica)
  };
  
  // SIEMPRE agregar a live events buffer (incluso sin conversation_id)
  addToLiveEvents(event);
  
  // Escribir en JSONL por conversation_id (solo si existe)
  if (context.conversation_id) {
    const traceFile = path.join(TRACES_DIR, `${context.conversation_id}.jsonl`);
    
    try {
      await fs.appendFile(traceFile, JSON.stringify(event) + '\n', 'utf-8');
    } catch (err) {
      // Si falla, al menos loguear en consola (no romper el flujo)
      console.error('[TRACE] Error escribiendo trace:', err.message);
    }
  }
  
  // También escribir en archivo de live events (append-only)
  try {
    await fs.appendFile(LIVE_EVENTS_FILE, JSON.stringify(event) + '\n', 'utf-8');
  } catch (err) {
    // Si falla, no romper el flujo
    console.error('[TRACE] Error escribiendo live events:', err.message);
  }
}

/**
 * Agrega evento al buffer circular de live events
 */
function addToLiveEvents(event) {
  liveEventsBuffer.push(event);
  
  // Mantener solo los últimos MAX_LIVE_EVENTS
  if (liveEventsBuffer.length > MAX_LIVE_EVENTS) {
    liveEventsBuffer.shift(); // Eliminar el más antiguo
  }
}

/**
 * Obtiene eventos en vivo (del buffer en memoria)
 */
export function getLiveEvents(filters = {}) {
  let filtered = [...liveEventsBuffer];
  
  // Filtrar por boot_id
  if (filters.boot_id) {
    filtered = filtered.filter(e => e.boot_id === filters.boot_id);
  }
  
  // Filtrar por conversation_id
  if (filters.conversation_id) {
    filtered = filtered.filter(e => e.conversation_id === filters.conversation_id);
  }
  
  // Filtrar por level
  if (filters.level) {
    const levels = Array.isArray(filters.level) ? filters.level : [filters.level];
    filtered = filtered.filter(e => levels.includes(e.level));
  }
  
  // Filtrar por endpoint
  if (filters.endpoint) {
    filtered = filtered.filter(e => e.endpoint && e.endpoint.includes(filters.endpoint));
  }
  
  // Ordenar por timestamp (más reciente primero)
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Limitar cantidad si se especifica
  if (filters.limit) {
    filtered = filtered.slice(0, filters.limit);
  }
  
  return filtered;
}

/**
 * Obtiene el último error por boot_id
 */
export function getLastErrorByBootId() {
  const errors = liveEventsBuffer.filter(e => e.level === 'ERROR');
  if (errors.length === 0) return null;
  
  // Ordenar por timestamp y tomar el más reciente
  errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return errors[0];
}

/**
 * Obtiene eventos agrupados por boot_id
 */
export function getEventsByBootId(bootId) {
  return liveEventsBuffer.filter(e => e.boot_id === bootId);
}

/**
 * Inicia un span para medir latencia
 */
export function startSpan(name) {
  return {
    name,
    startTime: Date.now(),
    spanId: `span-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  };
}

/**
 * Finaliza un span y retorna la latencia
 */
export function endSpan(span) {
  if (!span || !span.startTime) {
    return null;
  }
  return Date.now() - span.startTime;
}

/**
 * Lee todos los eventos de trace para una conversación
 */
export async function readTrace(conversationId) {
  const traceFile = path.join(TRACES_DIR, `${conversationId}.jsonl`);
  
  try {
    const content = await fs.readFile(traceFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(event => event !== null);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // Archivo no existe = no hay trace
    }
    throw err;
  }
}

/**
 * Helper para loguear entrada de mensaje del usuario
 */
export async function logUserInput(context, userInput, normalized = null, detectedLanguage = null, detectedDevice = null) {
  await logEvent('INFO', 'USER_INPUT', {
    actor: 'user',
    user_input_raw: userInput,
    user_input_normalized: normalized || userInput,
    detected_language: detectedLanguage,
    detected_device: detectedDevice,
    detection_method: detectedDevice ? 'rule_or_heuristic' : null
  }, context);
}

/**
 * Helper para loguear detección de intención
 */
export async function logIntentDetection(context, intent, confidence, needsClarification, missing, alternatives = null) {
  await logEvent('INFO', 'INTENT_DETECTION', {
    actor: 'system',
    intent_detected: intent,
    confidence: confidence,
    needs_clarification: needsClarification,
    missing: missing,
    alternatives_top: alternatives || null
  }, context);
}

/**
 * Helper para loguear transición de stage
 */
export async function logStageTransition(context, fromStage, toStage, reason, evidence = null, expectedStage = null) {
  await logEvent('INFO', 'STAGE_TRANSITION', {
    actor: 'system',
    stage_from: fromStage,
    stage_to: toStage,
    reason: reason,
    reason_code: reason,
    evidence: evidence,
    outcome: `Transición de ${fromStage} a ${toStage}`,
    expected_behavior: expectedStage ? `Se esperaba transición a ${expectedStage}` : `Transición de ${fromStage} a ${toStage}`,
    actual_behavior: `Transición realizada a ${toStage}`,
    expected_result: expectedStage ? `Stage debería ser ${expectedStage}` : null,
    actual_result: `Stage es ${toStage}`,
    decision_reason: reason,
    decision_evidence: evidence,
    decision_outcome: `Stage cambiado de ${fromStage} a ${toStage}`,
    flow_step: `STAGE_TRANSITION`,
    flow_previous_step: fromStage,
    flow_next_step: toStage,
    validation_passed: expectedStage ? (toStage === expectedStage) : null,
    validation_errors: expectedStage && toStage !== expectedStage ? `Stage esperado ${expectedStage} pero se obtuvo ${toStage}` : null
  }, context);
}

/**
 * Helper para loguear selección de botones
 */
export async function logButtonSelection(context, buttonsShown, buttonSelected = null, reason = null) {
  await logEvent('INFO', 'BUTTON_SELECTION', {
    actor: 'user',
    buttons_shown: buttonsShown.map(b => ({
      token: b.token,
      label: b.label,
      value: b.value || b.token
    })),
    button_selected: buttonSelected,
    reason: reason
  }, context);
}

/**
 * Helper para loguear construcción de prompt
 */
export async function logPromptConstruction(context, promptName, promptVersion, variables, template = null) {
  await logEvent('DEBUG', 'PROMPT_CONSTRUCTION', {
    actor: 'system',
    prompt_name: promptName,
    prompt_version: promptVersion,
    variables: sanitize(variables),
    template_preview: template ? template.substring(0, 200) + '...' : null
  }, context);
}

/**
 * Helper para loguear llamada a OpenAI con información completa
 */
export async function logOpenAICall(context, model, params, tokens, latency, error = null, expectedResponse = null) {
  const expectedBehavior = expectedResponse 
    ? `OpenAI debería retornar respuesta válida en formato JSON`
    : `OpenAI debería procesar la solicitud y retornar respuesta`;
  
  const actualBehavior = error
    ? `Error en llamada a OpenAI: ${error.message}`
    : `Llamada exitosa, respuesta recibida`;
  
  await logEvent(error ? 'ERROR' : 'INFO', 'OPENAI_CALL', {
    actor: 'system',
    model: model,
    parameters: sanitize(params),
    token_usage: {
      prompt_tokens: tokens?.prompt_tokens || null,
      completion_tokens: tokens?.completion_tokens || null,
      total_tokens: tokens?.total_tokens || null
    },
    latency_ms: latency,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : null,
    expected_behavior: expectedBehavior,
    actual_behavior: actualBehavior,
    expected_result: expectedResponse || `Respuesta JSON válida con campos requeridos`,
    actual_result: error ? `Error: ${error.message}` : `Respuesta recibida (${tokens?.total_tokens || 0} tokens)`,
    preconditions: [
      `Modelo ${model} disponible`,
      `API key configurada`,
      `Parámetros válidos`,
      `Conexión a internet estable`
    ],
    conditions_met: !error,
    decision_reason: error ? `Error en llamada, aplicar fallback` : `Llamada exitosa, procesar respuesta`,
    decision_evidence: error ? error.stack : `Tokens usados: ${tokens?.total_tokens || 0}, Latencia: ${latency}ms`,
    decision_outcome: error ? `Fallback necesario` : `Respuesta procesada exitosamente`,
    troubleshooting_hints: error ? [
      `Verificar conexión a OpenAI API`,
      `Revisar API key y límites de rate`,
      `Verificar formato de parámetros`,
      `Revisar logs de red si persiste`
    ] : null,
    suggested_fix: error ? `Implementar retry con backoff exponencial o fallback a respuesta genérica` : null
  }, context);
}

/**
 * Helper para loguear acceso a cache/redis
 */
export async function logCacheAccess(context, key, hit, latency = null) {
  // Truncar key si es muy largo (para no exponer datos sensibles)
  const keyDisplay = key && key.length > 50 ? key.substring(0, 50) + '...' : key;
  
  await logEvent('DEBUG', 'CACHE_ACCESS', {
    actor: 'system',
    cache_key: keyDisplay,
    cache_key_hash: key ? crypto.createHash('sha256').update(key).digest('hex').substring(0, 8) : null,
    hit: hit,
    miss: !hit,
    latency_ms: latency
  }, context);
}

/**
 * Helper para loguear acceso a archivos
 */
export async function logFileAccess(context, operation, filePath, size = null, success = true, error = null, latency = null) {
  await logEvent(success ? 'DEBUG' : 'ERROR', 'FILE_ACCESS', {
    actor: 'system',
    operation: operation, // 'read', 'write', 'delete'
    file_path: filePath,
    file_size_bytes: size,
    success: success,
    error: error ? {
      name: error.name,
      message: error.message,
      code: error.code
    } : null,
    latency_ms: latency
  }, context);
}

/**
 * Helper para loguear llamada externa (API)
 */
export async function logExternalCall(context, endpoint, method, status, latency, retries = 0, error = null) {
  await logEvent(error ? 'ERROR' : 'INFO', 'EXTERNAL_CALL', {
    actor: 'system',
    endpoint: endpoint,
    method: method,
    status_code: status,
    latency_ms: latency,
    retries: retries,
    error: error ? {
      name: error.name,
      message: error.message
    } : null
  }, context);
}

/**
 * Helper para loguear decisión interna
 */
export async function logDecision(context, ruleId, reasonCode, evidence, outcome) {
  await logEvent('INFO', 'DECISION', {
    actor: 'system',
    rule_id: ruleId,
    reason_code: reasonCode,
    evidence: evidence,
    outcome: outcome
  }, context);
}

/**
 * Helper para loguear error con stack
 */
/**
 * Helper para loguear error con información completa para reparación
 */
export async function logError(context, error, classification = 'recoverable', fallback = null, messageSent = false, expectedBehavior = null, actualBehavior = null, troubleshootingHints = null) {
  await logEvent('ERROR', 'ERROR', {
    actor: 'system',
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack,
    classification: classification, // 'recoverable' o 'fatal'
    fallback_executed: fallback,
    message_sent: messageSent,
    expected_behavior: expectedBehavior || `Operación debería completarse sin errores`,
    actual_behavior: actualBehavior || `Error: ${error.message}`,
    expected_result: `Operación exitosa`,
    actual_result: `Error: ${error.name} - ${error.message}`,
    preconditions: `Sistema debería estar en estado válido`,
    conditions_met: false,
    decision_reason: `Error detectado, clasificado como ${classification}`,
    decision_evidence: error.stack,
    decision_outcome: fallback ? `Fallback ejecutado: ${fallback}` : `Error no recuperado`,
    troubleshooting_hints: troubleshootingHints || [
      `Revisar stack trace: ${error.stack?.split('\n')[0] || 'N/A'}`,
      `Verificar precondiciones del sistema`,
      `Revisar logs anteriores para contexto`,
      classification === 'recoverable' ? `Error es recuperable, verificar fallback` : `Error fatal, requiere intervención`
    ],
    suggested_fix: classification === 'recoverable' 
      ? `Implementar o mejorar fallback para este caso`
      : `Revisar código en ${error.stack?.split('\n')[1]?.trim() || 'ubicación desconocida'}`
  }, context);
}

/**
 * Helper para loguear respuesta final
 */
/**
 * Helper para loguear respuesta final con información completa
 */
export async function logResponse(context, responseText, buttons = null, safetyFlags = null, additionalInfo = null) {
  const expectedBehavior = additionalInfo?.expected_behavior || `Bot debería generar respuesta apropiada para el contexto`;
  const actualBehavior = additionalInfo?.actual_behavior || `Respuesta generada: ${responseText.substring(0, 100)}...`;
  
  await logEvent('INFO', 'RESPONSE', {
    actor: 'tecnos',
    final_response_text: responseText,
    buttons: buttons ? buttons.map(b => ({
      token: b.token,
      label: b.label,
      value: b.value || b.token
    })) : null,
    safety_flags: safetyFlags,
    expected_behavior: expectedBehavior,
    actual_behavior: actualBehavior,
    expected_result: additionalInfo?.expected_result || `Respuesta válida con contenido apropiado`,
    actual_result: additionalInfo?.actual_result || `Respuesta generada (${responseText.length} caracteres, ${buttons?.length || 0} botones)`,
    state_snapshot: additionalInfo?.state_snapshot || {
      response_length: responseText.length,
      buttons_count: buttons?.length || 0,
      has_safety_flags: !!safetyFlags
    },
    validation_passed: responseText && responseText.length > 0,
    validation_errors: !responseText || responseText.length === 0 ? 'Respuesta vacía' : null
  }, context);
}

/**
 * Helper para loguear generación de ticket/WhatsApp
 */
export async function logTicketGeneration(context, ticketId, payload, result, error = null) {
  await logEvent(error ? 'ERROR' : 'INFO', 'TICKET_GENERATION', {
    actor: 'system',
    ticket_id: ticketId,
    payload: sanitize(payload),
    result: result,
    error: error ? {
      name: error.name,
      message: error.message
    } : null
  }, context);
}

