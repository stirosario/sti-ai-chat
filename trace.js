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

// Asegurar que el directorio existe
if (!fsSync.existsSync(TRACES_DIR)) {
  fsSync.mkdirSync(TRACES_DIR, { recursive: true });
}

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
 * Crea un contexto de trace para una conversación
 */
export function createTraceContext(conversationId, requestId, messageId = null, stage = null, env = null, version = null) {
  const serverInfo = getServerInfo();
  const envValue = env || process.env.NODE_ENV || 'production';
  
  return {
    conversation_id: conversationId,
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
 * Registra un evento en el trace
 */
export async function logEvent(level, type, payload = {}, context = null) {
  if (!context || !context.conversation_id) {
    // Si no hay contexto válido, no loguear (evitar errores)
    return;
  }
  
  const event = {
    // Metadata de correlación
    conversation_id: context.conversation_id,
    request_id: context.request_id || `req-${Date.now()}`,
    event_id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: context.timestamp || new Date().toISOString(),
    env: context.env || process.env.NODE_ENV || 'production',
    version: context.version || getServerInfo().version,
    commit_hash: context.commit_hash || getServerInfo().commitHash,
    stage: context.stage || null,
    actor: payload.actor || 'system',
    message_id: context.message_id || null,
    
    // Evento específico
    level: level.toUpperCase(), // INFO, WARN, ERROR, DEBUG
    type: type,
    payload: sanitize(payload),
    
    // Latencia (si existe)
    latency_ms: payload.latency_ms || null,
    
    // Archivo/módulo origen (si se proporciona)
    file: payload.file || null,
    module: payload.module || null
  };
  
  // Escribir en JSONL (append-only)
  const traceFile = path.join(TRACES_DIR, `${context.conversation_id}.jsonl`);
  
  try {
    await fs.appendFile(traceFile, JSON.stringify(event) + '\n', 'utf-8');
  } catch (err) {
    // Si falla, al menos loguear en consola (no romper el flujo)
    console.error('[TRACE] Error escribiendo trace:', err.message);
  }
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
export async function logStageTransition(context, fromStage, toStage, reason, evidence = null) {
  await logEvent('INFO', 'STAGE_TRANSITION', {
    actor: 'system',
    stage_from: fromStage,
    stage_to: toStage,
    reason: reason,
    reason_code: reason,
    evidence: evidence,
    outcome: `Transición de ${fromStage} a ${toStage}`
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
 * Helper para loguear llamada a OpenAI
 */
export async function logOpenAICall(context, model, params, tokens, latency, error = null) {
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
    } : null
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
export async function logError(context, error, classification = 'recoverable', fallback = null, messageSent = false) {
  await logEvent('ERROR', 'ERROR', {
    actor: 'system',
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack,
    classification: classification, // 'recoverable' o 'fatal'
    fallback_executed: fallback,
    message_sent: messageSent
  }, context);
}

/**
 * Helper para loguear respuesta final
 */
export async function logResponse(context, responseText, buttons = null, safetyFlags = null) {
  await logEvent('INFO', 'RESPONSE', {
    actor: 'tecnos',
    final_response_text: responseText,
    buttons: buttons ? buttons.map(b => ({
      token: b.token,
      label: b.label,
      value: b.value || b.token
    })) : null,
    safety_flags: safetyFlags
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

