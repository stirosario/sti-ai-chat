/**
 * UI BUTTON SELECTOR - Selector Inteligente de Botones con IA
 * 
 * Este módulo permite que Tecnos elija con IA qué botones mostrar en cada respuesta,
 * manteniendo guard rails estrictos y fallback determinista.
 * 
 * PRINCIPIOS:
 * - La IA NO puede inventar botones nuevos, solo elegir entre allowlist existente
 * - Guard rails validan salida: filtran tokens inválidos, convierten legacy→nuevo, eliminan desactivados
 * - Si IA falla, usar fallback determinista (botones actuales del flujo)
 * - Mantener transcript limpio (nunca guardar BTN_* como texto)
 * 
 * GATING (cuándo NO usar IA):
 * - ASK_LANGUAGE / CONSENT / ASK_USER_LEVEL => NO IA, usar botones fijos
 * - session.simulation === true => IA puede elegir, pero respetar reglas de simulación
 * 
 * HARD RULES (obligatorias):
 * - Post-pasos: SIEMPRE incluir BTN_SOLVED, BTN_PERSIST, BTN_ADVANCED_TESTS, BTN_WHATSAPP_TECNICO (si permitido), BTN_CLOSE
 * - No reinyección: Si stage pasó ASK_DEVICE y se entregaron pasos, NO mostrar BTN_DEV_*
 * - Anti-leak: Solo devolver tokens, nunca labels
 */

import { OpenAI } from 'openai';

// EMBEDDED_CHAT se pasa como parámetro para evitar dependencia circular

// Configuración de OpenAI (reusar del server.js)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT = parseInt(process.env.OPENAI_TIMEOUT_MS) || 8000;

let openaiClient = null;
if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY,
    timeout: OPENAI_TIMEOUT,
    maxRetries: 1
  });
}

/**
 * Construye la allowlist de tokens válidos desde EMBEDDED_CHAT.ui.buttons
 * Solo incluye botones con status: 'active'
 * 
 * @param {object} embeddedChat - Objeto EMBEDDED_CHAT con definiciones de botones
 * @returns {Array<string>} Array de tokens válidos
 */
function buildAllowlist(embeddedChat) {
  if (!embeddedChat || !embeddedChat.ui || !embeddedChat.ui.buttons) {
    return [];
  }
  
  return embeddedChat.ui.buttons
    .filter(btn => btn.status === 'active')
    .map(btn => btn.token)
    .filter(token => token); // Eliminar tokens vacíos
}

// Cache de allowlist (se recalcula si EMBEDDED_CHAT cambia)
let cachedAllowlist = null;
let cachedAllowlistTimestamp = 0;
let cachedEmbeddedChat = null;
const ALLOWLIST_CACHE_TTL = 60000; // 1 minuto

function getAllowlist(embeddedChat) {
  const now = Date.now();
  // Recalcular si cambió embeddedChat o expiró cache
  if (!cachedAllowlist || 
      cachedEmbeddedChat !== embeddedChat || 
      (now - cachedAllowlistTimestamp) > ALLOWLIST_CACHE_TTL) {
    cachedAllowlist = buildAllowlist(embeddedChat);
    cachedEmbeddedChat = embeddedChat;
    cachedAllowlistTimestamp = now;
  }
  return cachedAllowlist;
}

/**
 * Valida y normaliza tokens devueltos por la IA
 * - Filtra tokens inválidos (no están en allowlist)
 * - Convierte legacy → nuevo (usando deprecated mapping)
 * - Elimina desactivados
 * - Limita a máximo 7 botones
 * 
 * @param {Array<string>} tokens - Tokens devueltos por la IA
 * @param {Array<string>} allowlist - Lista de tokens permitidos
 * @param {object} embeddedChat - Objeto EMBEDDED_CHAT con definiciones de botones
 * @returns {Array<string>} Tokens validados y normalizados
 */
function validateAndNormalizeTokens(tokens, allowlist, embeddedChat) {
  if (!Array.isArray(tokens)) {
    return [];
  }
  
  const normalized = [];
  const seen = new Set();
  
  for (const token of tokens) {
    if (!token || typeof token !== 'string') continue;
    
    // Buscar definición del botón
    const buttonDef = embeddedChat?.ui?.buttons?.find(b => b.token === token);
    
    if (!buttonDef) {
      // Token no existe, ignorar
      continue;
    }
    
    // Si es legacy, convertir a nuevo
    if (buttonDef.status === 'legacy' && buttonDef.deprecated) {
      const deprecatedToken = buttonDef.deprecated;
      if (allowlist.includes(deprecatedToken) && !seen.has(deprecatedToken)) {
        normalized.push(deprecatedToken);
        seen.add(deprecatedToken);
      }
      continue;
    }
    
    // Si está desactivado, ignorar
    if (buttonDef.status === 'disabled') {
      continue;
    }
    
    // Si es activo y está en allowlist, agregar
    if (buttonDef.status === 'active' && allowlist.includes(token) && !seen.has(token)) {
      normalized.push(token);
      seen.add(token);
    }
  }
  
  // Limitar a máximo 7 botones para UX limpio
  return normalized.slice(0, 7);
}

/**
 * Aplica hard rules obligatorias
 * 
 * @param {Array<string>} tokens - Tokens seleccionados (por IA o fallback)
 * @param {object} context - Contexto de la sesión
 * @returns {Array<string>} Tokens con hard rules aplicadas
 */
function applyHardRules(tokens, context) {
  const { stage, stepsDelivered, flags = {} } = context;
  const result = [...tokens];
  const resultSet = new Set(result);
  
  // HARD RULE A: Post-pasos - SIEMPRE incluir botones mínimos obligatorios
  if (stepsDelivered || flags.stepsDelivered) {
    const mandatoryPostSteps = [
      'BTN_SOLVED',
      'BTN_PERSIST',
      'BTN_ADVANCED_TESTS',
      'BTN_CLOSE'
    ];
    
    // BTN_WHATSAPP_TECNICO solo si las reglas existentes lo permiten
    // (verificar session.waEligible o similar en el contexto)
    if (context.waEligible !== false) {
      mandatoryPostSteps.push('BTN_WHATSAPP_TECNICO');
    }
    
    // Agregar obligatorios si no están presentes
    mandatoryPostSteps.forEach(token => {
      if (!resultSet.has(token)) {
        result.push(token);
        resultSet.add(token);
      }
    });
  }
  
  // HARD RULE B: No reinyección de botones de dispositivo
  // Si stage ya pasó ASK_DEVICE y se entregaron pasos, NO mostrar BTN_DEV_*
  if (stepsDelivered || flags.stepsDelivered) {
    const deviceTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
    return result.filter(token => !deviceTokens.includes(token));
  }
  
  return result;
}

/**
 * Determina si se debe usar IA para seleccionar botones
 * 
 * @param {object} context - Contexto de la sesión
 * @returns {boolean} true si se debe usar IA, false si usar botones fijos
 */
function shouldUseAI(context) {
  const { stage } = context;
  
  // GATING: NO usar IA en estas etapas (botones fijos obligatorios)
  const noAIStages = [
    'ASK_LANGUAGE',
    'CONSENT',
    'ASK_USER_LEVEL'
  ];
  
  if (noAIStages.includes(stage)) {
    return false;
  }
  
  // En otros stages, permitir IA (con guard rails)
  return true;
}

/**
 * Genera prompt para OpenAI con contexto compacto
 * 
 * @param {object} context - Contexto de la sesión
 * @param {Array<string>} allowlist - Lista de tokens permitidos
 * @param {object} embeddedChat - Objeto EMBEDDED_CHAT (para obtener descripciones de botones)
 * @returns {string} Prompt para OpenAI
 */
function buildAIPrompt(context, allowlist, embeddedChat) {
  const { stage, problemToken, device, os, userLevel, flags = {}, lastButtonsShown = [] } = context;
  
  const prompt = `Eres un asistente técnico que ayuda a seleccionar los botones más relevantes para mostrar al usuario.

CONTEXTO:
- Stage actual: ${stage}
- Problema detectado: ${problemToken || 'ninguno'}
- Dispositivo: ${device || 'no especificado'}
- Sistema operativo: ${os || 'no especificado'}
- Nivel de usuario: ${userLevel || 'no especificado'}
- Pasos entregados: ${flags.stepsDelivered ? 'sí' : 'no'}
- Frustración detectada: ${flags.frustration ? 'sí' : 'no'}
- Feedback dado: ${flags.feedbackGiven ? 'sí' : 'no'}
- Últimos botones mostrados: ${lastButtonsShown.slice(0, 5).join(', ') || 'ninguno'}

REGLAS OBLIGATORIAS:
1. Solo puedes elegir tokens de esta lista: ${allowlist.slice(0, 30).join(', ')}${allowlist.length > 30 ? '...' : ''}
2. Máximo 5-7 botones por respuesta (para UX limpio)
3. Si se entregaron pasos, DEBES incluir: BTN_SOLVED, BTN_PERSIST, BTN_ADVANCED_TESTS, BTN_CLOSE (y BTN_WHATSAPP_TECNICO si aplica)
4. NO mostrar botones de dispositivo (BTN_DEV_*) si ya se entregaron pasos
5. Priorizar botones relevantes al contexto actual
6. Evitar repetir botones que se mostraron recientemente (a menos que sean obligatorios)

RESPUESTA REQUERIDA (JSON válido):
{
  "tokens": ["BTN_X", "BTN_Y", ...],
  "reason": "Breve explicación de por qué elegiste estos botones"
}

IMPORTANTE:
- Devuelve SOLO tokens (nunca labels ni texto descriptivo)
- El JSON debe ser válido y parseable
- Si no hay botones relevantes, devuelve array vacío (pero las hard rules se aplicarán después)`;

  return prompt;
}

/**
 * Llama a OpenAI para seleccionar botones
 * 
 * @param {object} context - Contexto de la sesión
 * @param {Array<string>} allowlist - Lista de tokens permitidos
 * @param {object} embeddedChat - Objeto EMBEDDED_CHAT
 * @returns {Promise<{tokens: Array<string>, reason: string}|null>} Resultado de la IA o null si falla
 */
async function selectButtonsWithAI(context, allowlist, embeddedChat) {
  if (!openaiClient) {
    return null; // OpenAI no configurado
  }
  
  try {
    const prompt = buildAIPrompt(context, allowlist, embeddedChat);
    
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente que selecciona botones de UI relevantes. Siempre devuelves JSON válido con formato: {"tokens": [...], "reason": "..."}'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Baja temperatura para respuestas más deterministas
      max_tokens: 200,
      response_format: { type: 'json_object' } // Forzar JSON
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }
    
    // Parsear JSON
    const parsed = JSON.parse(content);
    
    if (!parsed.tokens || !Array.isArray(parsed.tokens)) {
      return null;
    }
    
    return {
      tokens: parsed.tokens,
      reason: parsed.reason || 'Selección por IA'
    };
    
  } catch (error) {
    // Error en OpenAI: timeout, JSON inválido, etc.
    // Retornar null para usar fallback
    return null;
  }
}

/**
 * Función principal: Selecciona botones usando IA o fallback
 * 
 * @param {object} params - Parámetros de selección
 * @param {object} params.session - Sesión actual
 * @param {string} params.stage - Stage actual
 * @param {string} params.lastBotMessage - Último mensaje del bot (opcional)
 * @param {string} params.problemToken - Token del problema detectado (opcional)
 * @param {string} params.device - Dispositivo del usuario (opcional)
 * @param {string} params.os - Sistema operativo (opcional)
 * @param {object} params.flags - Flags adicionales (stepsDelivered, frustration, feedbackGiven, isSimulation)
 * @param {Array<string>} params.lastButtonsShown - Últimos botones mostrados (opcional)
 * @param {Array<string>} params.fallbackTokens - Tokens de fallback (botones deterministas del flujo)
 * @param {object} params.embeddedChat - Objeto EMBEDDED_CHAT con definiciones de botones
 * @returns {Promise<{tokens: Array<string>, source: string, reason: string}>} Resultado de selección
 */
export async function selectButtons({
  session,
  stage,
  lastBotMessage = null,
  problemToken = null,
  device = null,
  os = null,
  flags = {},
  lastButtonsShown = [],
  fallbackTokens = [],
  embeddedChat
}) {
  if (!embeddedChat) {
    // Sin embeddedChat, retornar fallback directamente
    return {
      tokens: fallbackTokens,
      source: 'fallback',
      reason: 'EMBEDDED_CHAT no proporcionado'
    };
  }
  
  const allowlist = getAllowlist(embeddedChat);
  
  // GATING: Determinar si usar IA
  const useAI = shouldUseAI({ stage, flags });
  
  if (!useAI) {
    // NO usar IA: retornar fallback directamente
    return {
      tokens: fallbackTokens,
      source: 'rules',
      reason: `Stage ${stage} requiere botones fijos (no IA)`
    };
  }
  
  // Construir contexto para IA
  const context = {
    stage,
    problemToken,
    device,
    os,
    userLevel: session?.userLevel || null,
    flags: {
      stepsDelivered: flags.stepsDelivered || false,
      frustration: flags.frustration || false,
      feedbackGiven: flags.feedbackGiven || false,
      isSimulation: flags.isSimulation || (session?.simulation === true)
    },
    lastButtonsShown,
    waEligible: session?.waEligible !== false // Por defecto permitir, a menos que explícitamente false
  };
  
  // Intentar selección con IA
  const aiResult = await selectButtonsWithAI(context, allowlist, embeddedChat);
  
  if (aiResult && aiResult.tokens && aiResult.tokens.length > 0) {
    // Validar y normalizar tokens de IA
    const validatedTokens = validateAndNormalizeTokens(aiResult.tokens, allowlist, embeddedChat);
    
    if (validatedTokens.length > 0) {
      // Aplicar hard rules
      const finalTokens = applyHardRules(validatedTokens, {
        ...context,
        stepsDelivered: flags.stepsDelivered || false
      });
      
      return {
        tokens: finalTokens,
        source: 'ai',
        reason: aiResult.reason || 'Selección por IA'
      };
    }
  }
  
  // Fallback: usar tokens deterministas del flujo
  const fallbackValidated = validateAndNormalizeTokens(fallbackTokens, allowlist, embeddedChat);
  const fallbackFinal = applyHardRules(fallbackValidated, {
    ...context,
    stepsDelivered: flags.stepsDelivered || false
  });
  
  return {
    tokens: fallbackFinal,
    source: 'fallback',
    reason: 'IA no disponible o falló, usando botones deterministas del flujo'
  };
}

