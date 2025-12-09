/**
 * 🚀 INTEGRATION PATCH - Integrador del sistema inteligente en server.js
 * 
 * Este módulo proporciona las funciones necesarias para integrar
 * el nuevo sistema inteligente en server.js sin romper el código existente.
 * 
 * USO:
 * 1. Importar este módulo en server.js
 * 2. Inicializar con initializeIntelligentSystem()
 * 3. Llamar a handleWithIntelligence() en el endpoint /api/chat
 * 4. Usar feature flag USE_INTELLIGENT_MODE=true para activar
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import { handleIntelligentChat, shouldUseIntelligentMode } from './intelligentChatHandler.js';
import { initializeOpenAI } from '../services/aiService.js';
import { 
  matchCalibracionPattern, 
  normalizeWithCalibracion, 
  getCalibracionResponse,
  extractCalibracionKeywords,
  logCalibracionSuccess,
  logCalibracionFailure
} from '../../handlers/calibracionHandler.js';
import {
  detectDeviceIntelligently,
  getDeviceVocabulary,
  getAmbiguousDeviceMessage
} from '../../handlers/deviceDetector.js';

let intelligentModeEnabled = false;

/**
 * 🎬 Inicializa el sistema inteligente
 * 
 * @param {string} openaiApiKey - API key de OpenAI
 * @param {boolean} enableByDefault - Si debe estar activado por defecto
 */
export function initializeIntelligentSystem(openaiApiKey, enableByDefault = false) {
  console.log('[IntelligentSystem] 🚀 Inicializando sistema inteligente...');
  
  // Inicializar OpenAI
  const client = initializeOpenAI(openaiApiKey);
  
  if (!client) {
    console.warn('[IntelligentSystem] ⚠️ OpenAI no disponible - sistema inteligente limitado');
  }
  
  // Activar modo inteligente según configuración
  intelligentModeEnabled = enableByDefault;
  
  console.log('[IntelligentSystem] ✅ Sistema inteligente inicializado');
  console.log('[IntelligentSystem] 📊 Estado:', intelligentModeEnabled ? 'ACTIVADO' : 'DESACTIVADO (usar legacy)');
  
  return {
    enabled: intelligentModeEnabled,
    hasOpenAI: !!client
  };
}

/**
 * 🎯 Maneja un mensaje con el sistema inteligente
 * 
 * Esta función debe ser llamada DENTRO del endpoint /api/chat de server.js
 * ANTES de procesar con la lógica legacy basada en stages.
 * 
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Object} session - Sesión del usuario
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} buttonToken - Token de botón si fue clickeado
 * @returns {Promise<Object|null>} - Response object si se procesó, null si debe usar legacy
 */
export async function handleWithIntelligence(req, res, session, userMessage, buttonToken) {
  // Verificar si el modo inteligente está activado
  if (!intelligentModeEnabled) {
    console.log('[IntelligentSystem] ⏭️ Modo inteligente desactivado - usando legacy');
    return null; // Usar lógica legacy
  }

  // ✅ DETECCIÓN INTELIGENTE DE DISPOSITIVO: Antes de calibración, verificar si el dispositivo está explícito
  // Esto se aplica cuando estamos en ASK_NEED (cuando el usuario menciona el problema) o ASK_DEVICE
  if ((session.stage === 'ASK_NEED' || session.stage === 'ASK_DEVICE' || session.stage === 'DETECT_DEVICE') && userMessage && !buttonToken) {
    const deviceDetection = detectDeviceIntelligently(userMessage, session);
    const locale = session.userLocale || 'es-AR';
    
    console.log('[IntelligentSystem] 🔍 Detección de dispositivo:', deviceDetection);
    
    // Si el dispositivo está explícito, asignarlo directamente y avanzar
    if (deviceDetection.isExplicit && deviceDetection.device) {
      session.device = deviceDetection.device;
      const vocab = getDeviceVocabulary(deviceDetection.device, locale);
      session.deviceLabel = vocab.deviceLabel;
      session.devicePronoun = vocab.devicePronoun;
      
      // Si estamos en ASK_NEED, avanzar a ASK_PROBLEM directamente
      if (session.stage === 'ASK_NEED') {
        session.needType = 'problema';
        session.stage = 'ASK_PROBLEM';
        
        const isEn = locale.toLowerCase().startsWith('en');
        const reply = isEn
          ? `✅ Got it, ${vocab.devicePronoun}. What problem are you having with it?`
          : `✅ Perfecto, ${vocab.devicePronoun}. ¿Qué problema estás teniendo con ${vocab.deviceArticle} ${vocab.deviceLabel}?`;
        
        const ts = new Date().toISOString();
        session.transcript = session.transcript || [];
        session.transcript.push({
          who: 'bot',
          text: reply,
          ts,
          deviceDetected: deviceDetection.device,
          detectionReason: deviceDetection.reason
        });
        
        logCalibracionSuccess('ASK_DEVICE');
        
        return {
          ok: true,
          reply: reply,
          stage: session.stage,
          options: [],
          buttons: [],
          deviceDetected: deviceDetection.device
        };
      } else if (session.stage === 'ASK_DEVICE' || session.stage === 'DETECT_DEVICE') {
        // Si ya estábamos preguntando por el dispositivo, avanzar a ASK_PROBLEM
        session.stage = 'ASK_PROBLEM';
        
        const isEn = locale.toLowerCase().startsWith('en');
        const reply = isEn
          ? `✅ Perfect. What problem are you having with ${vocab.devicePronoun}?`
          : `✅ Perfecto. ¿Qué problema estás teniendo con ${vocab.devicePronoun}?`;
        
        const ts = new Date().toISOString();
        session.transcript = session.transcript || [];
        session.transcript.push({
          who: 'bot',
          text: reply,
          ts,
          deviceDetected: deviceDetection.device,
          detectionReason: deviceDetection.reason
        });
        
        logCalibracionSuccess('ASK_DEVICE');
        
        return {
          ok: true,
          reply: reply,
          stage: session.stage,
          options: [],
          buttons: [],
          deviceDetected: deviceDetection.device
        };
      }
    } else if (deviceDetection.isAmbiguous) {
      // Si el término es ambiguo, preguntar antes de continuar
      const reply = getAmbiguousDeviceMessage(locale);
      
      // Si estamos en ASK_NEED, cambiar a DETECT_DEVICE para esperar aclaración
      if (session.stage === 'ASK_NEED') {
        session.needType = 'problema';
        session.stage = 'DETECT_DEVICE';
      } else if (session.stage === 'ASK_DEVICE') {
        session.stage = 'DETECT_DEVICE';
      }
      
      const ts = new Date().toISOString();
      session.transcript = session.transcript || [];
      session.transcript.push({
        who: 'bot',
        text: reply,
        ts,
        ambiguousDevice: true
      });
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage,
        options: [],
        buttons: [],
        ambiguousDevice: true
      };
    }
  }

  // ✅ CALIBRACIÓN: Intentar primero con calibración para stages específicos
  const calibrationStages = ['ASK_NEED', 'ASK_DEVICE', 'ASK_LANGUAGE', 'ASK_PROBLEM', 'ASK_HOWTO_DETAILS', 'DETECT_DEVICE'];
  if (calibrationStages.includes(session.stage) && userMessage && !buttonToken) {
    console.log(`[IntelligentSystem] 🔧 Stage ${session.stage} - Intentando calibración primero...`);
    
    const calibMatch = matchCalibracionPattern(userMessage, session.stage);
    if (calibMatch && calibMatch.matched) {
      const normalized = normalizeWithCalibracion(userMessage, session.stage);
      console.log(`[IntelligentSystem] ✅ Calibración encontrada para ${session.stage}:`, {
        original: userMessage,
        normalized: normalized,
        pattern: calibMatch.pattern
      });
      
      // Obtener respuesta de calibración
      let reply = getCalibracionResponse(session.stage);
      if (!reply) {
        // Fallback a respuesta por defecto
        const locale = session.userLocale || 'es-AR';
        const isEn = locale.toLowerCase().startsWith('en');
        if (session.stage === 'ASK_NEED') {
          reply = isEn 
            ? '📌 Understood. What type of device is giving you problems?'
            : '📌 Entendido. ¿Qué tipo de dispositivo te está dando problemas?';
        } else if (session.stage === 'ASK_DEVICE') {
          reply = isEn
            ? '✅ Perfect. What problem are you having with your device?'
            : '✅ Perfecto. ¿Qué problema estás teniendo con tu dispositivo?';
        }
      }
      
      // Reemplazar placeholders si hay
      reply = reply.replace(/{name}/g, session.userName || 'Usuario');
      
      // Actualizar sesión según el stage
      if (session.stage === 'ASK_NEED') {
        // Extraer keywords usando la función de calibración
        const keywords = extractCalibracionKeywords(normalized, 'ASK_NEED');
        
        // Determinar si es problema o consulta basado en keywords y contenido
        if (keywords.problema || normalized.includes('problema') || normalized.includes('falla') || normalized.includes('error') || normalized.includes('no funciona') || normalized.includes('no anda')) {
          session.needType = 'problema';
          // NO cambiar automáticamente a ASK_DEVICE - la detección inteligente lo manejará
          // Si el dispositivo está explícito, ya se habrá detectado arriba
          // Si es ambiguo, se habrá preguntado arriba
          // Si no se detectó nada, el sistema inteligente continuará
        } else if (keywords.consulta || normalized.includes('consulta') || normalized.includes('pregunta') || normalized.includes('como') || normalized.includes('cómo') || normalized.includes('duda')) {
          session.needType = 'consulta';
          session.stage = 'ASK_HOWTO_DETAILS';
        } else {
          // Si no se puede determinar, mantener en ASK_NEED para que el sistema inteligente lo procese
          console.log('[IntelligentSystem] ⚠️ No se pudo determinar needType - manteniendo en ASK_NEED');
        }
      } else if (session.stage === 'ASK_DEVICE' || session.stage === 'DETECT_DEVICE') {
        // Extraer keywords usando la función de calibración
        const keywords = extractCalibracionKeywords(normalized, 'ASK_DEVICE');
        
        // Determinar tipo de dispositivo basado en keywords y contenido
        const locale = session.userLocale || 'es-AR';
        if (keywords.desktop || normalized.includes('pc') || normalized.includes('desktop') || normalized.includes('torre') || normalized.includes('computadora de escritorio')) {
          session.device = 'desktop';
          const vocab = getDeviceVocabulary('desktop', locale);
          session.deviceLabel = vocab.deviceLabel;
          session.devicePronoun = vocab.devicePronoun;
          session.stage = 'ASK_PROBLEM';
        } else if (keywords['all-in-one'] || normalized.includes('all in one') || normalized.includes('todo en uno') || normalized.includes('pantalla con pc')) {
          session.device = 'all-in-one';
          const vocab = getDeviceVocabulary('all-in-one', locale);
          session.deviceLabel = vocab.deviceLabel;
          session.devicePronoun = vocab.devicePronoun;
          session.stage = 'ASK_PROBLEM';
        } else if (keywords.notebook || normalized.includes('notebook') || normalized.includes('laptop') || normalized.includes('portátil')) {
          session.device = 'notebook';
          const vocab = getDeviceVocabulary('notebook', locale);
          session.deviceLabel = vocab.deviceLabel;
          session.devicePronoun = vocab.devicePronoun;
          session.stage = 'ASK_PROBLEM';
        } else {
          // Si no se puede determinar, mantener en DETECT_DEVICE para preguntar
          console.log('[IntelligentSystem] ⚠️ No se pudo determinar device - manteniendo en DETECT_DEVICE');
          session.stage = 'DETECT_DEVICE';
        }
      } else if (session.stage === 'ASK_LANGUAGE') {
        // Extraer keywords para GDPR e idioma
        const keywords = extractCalibracionKeywords(normalized, 'ASK_LANGUAGE');
        
        // Manejar aceptación/rechazo GDPR
        if (keywords.gdpr_accept || normalized.includes('si') || normalized.includes('sí') || normalized.includes('acepto') || normalized.includes('ok') || normalized.includes('yes')) {
          session.gdprConsent = true;
          // Mantener en ASK_LANGUAGE hasta que seleccione idioma
        } else if (keywords.gdpr_reject || normalized.includes('no') || normalized.includes('rechazo')) {
          session.gdprConsent = false;
          session.stage = 'ENDED';
        }
        
        // Si ya aceptó GDPR, manejar selección de idioma
        if (session.gdprConsent) {
          if (keywords.lang_es || normalized.includes('español') || normalized.includes('spanish') || normalized.includes('arg')) {
            session.userLocale = 'es-AR';
            session.stage = 'ASK_NAME';
          } else if (keywords.lang_en || normalized.includes('english') || normalized.includes('inglés') || normalized.includes('en-')) {
            session.userLocale = 'en';
            session.stage = 'ASK_NAME';
          }
        }
      } else if (session.stage === 'ASK_PROBLEM') {
        // Guardar descripción del problema
        session.problem = normalized;
        // El sistema inteligente manejará la transición a BASIC_TESTS
        // No cambiar stage aquí, dejar que el sistema inteligente lo haga
      } else if (session.stage === 'ASK_HOWTO_DETAILS') {
        // Guardar consulta
        session.howtoQuery = normalized;
        // El sistema inteligente manejará la transición a GENERATE_HOWTO
        // No cambiar stage aquí, dejar que el sistema inteligente lo haga
      } else if (session.stage === 'DETECT_DEVICE') {
        // Extraer keywords para desambiguar dispositivo
        const keywords = extractCalibracionKeywords(normalized, 'DETECT_DEVICE');
        
        // Determinar tipo de dispositivo
        if (keywords.desktop || normalized.includes('pc') || normalized.includes('desktop') || normalized.includes('torre')) {
          session.device = 'desktop';
          session.stage = 'ASK_PROBLEM';
        } else if (keywords['all-in-one'] || normalized.includes('all in one') || normalized.includes('todo en uno')) {
          session.device = 'all-in-one';
          session.stage = 'ASK_PROBLEM';
        } else if (keywords.notebook || normalized.includes('notebook') || normalized.includes('laptop') || normalized.includes('portátil')) {
          session.device = 'notebook';
          session.stage = 'ASK_PROBLEM';
        }
        // Si no se puede determinar, mantener en DETECT_DEVICE
      }
      
      // Registrar éxito
      logCalibracionSuccess(session.stage);
      
      // Guardar en transcript
      const ts = new Date().toISOString();
      session.transcript = session.transcript || [];
      session.transcript.push({
        who: 'bot',
        text: reply,
        ts,
        calibrationMatch: true,
        normalizedInput: normalized
      });
      
      // Retornar respuesta de calibración
      return {
        ok: true,
        reply: reply,
        stage: session.stage,
        options: [],
        buttons: [],
        calibrationMatch: true,
        normalizedInput: normalized
      };
    } else {
      // No hay coincidencia en calibración, registrar fallo
      logCalibracionFailure(session.stage, userMessage, 'No match found');
      console.log(`[IntelligentSystem] ⚠️ Sin coincidencia en calibración para ${session.stage} - continuando con sistema inteligente`);
    }
  }
  
  // ✅ FORZAR MODO INTELIGENTE si estamos en ASK_NEED (después de nombre)
  // Esto asegura que TODO mensaje después del nombre sea procesado inteligentemente
  if (session.stage === 'ASK_NEED') {
    console.log('[IntelligentSystem] 🎯 Stage ASK_NEED detectado - FORZANDO modo inteligente');
    console.log('[IntelligentSystem] 🧠 Procesando con sistema inteligente (sin verificar shouldUse)...');
    // NO verificar shouldUse - siempre usar inteligente después del nombre
  } else {
    // Para otros stages, verificar si debe usar modo inteligente
    const shouldUse = shouldUseIntelligentMode(userMessage, buttonToken, session);
    
    if (!shouldUse) {
      console.log('[IntelligentSystem] ⏭️ Mensaje simple - usando legacy');
      return null; // Usar lógica legacy
    }

    console.log('[IntelligentSystem] 🧠 Procesando con sistema inteligente...');
  }

  try {
    const locale = session.userLocale || 'es-AR';
    
    // Procesar con sistema inteligente
    const intelligentResponse = await handleIntelligentChat(
      userMessage,
      buttonToken,
      session,
      locale
    );

    console.log('[IntelligentSystem] ✅ Respuesta inteligente generada:', {
      intent: intelligentResponse.intentDetected,
      stage: intelligentResponse.stage,
      hasOptions: intelligentResponse.options.length > 0
    });

    // Actualizar sesión con la nueva información
    session.stage = intelligentResponse.stage;
    session.lastIntentDetected = intelligentResponse.intentDetected;
    
    if (intelligentResponse.deviceType) {
      session.device = intelligentResponse.deviceType;
    }

    // Guardar en transcript
    const ts = new Date().toISOString();
    session.transcript = session.transcript || [];
    session.transcript.push({
      who: 'bot',
      text: intelligentResponse.reply,
      ts,
      intent: intelligentResponse.intentDetected,
      confidence: session.lastIntentConfidence,
      intelligentMode: true
    });

    // Preparar response para enviar al frontend
    const responsePayload = {
      ok: true,
      reply: intelligentResponse.reply,
      stage: intelligentResponse.stage,
      options: intelligentResponse.options,
      buttons: intelligentResponse.options, // Compatibilidad
      intelligentMode: true,
      intentDetected: intelligentResponse.intentDetected,
      reasoning: intelligentResponse.reasoning
    };

    // Si hubo acción rechazada, agregar flag
    if (intelligentResponse.actionRejected) {
      responsePayload.actionRejected = true;
    }

    // Agregar UI wrapper si hay opciones
    if (intelligentResponse.options.length > 0) {
      responsePayload.ui = {
        buttons: intelligentResponse.options
      };
    }

    return responsePayload;

  } catch (error) {
    console.error('[IntelligentSystem] ❌ Error en sistema inteligente:', error);
    console.error('[IntelligentSystem] 📚 Stack:', error.stack);
    
    // En caso de error, retornar null para que use legacy
    console.log('[IntelligentSystem] ⚠️ Fallback a sistema legacy por error');
    return null;
  }
}

/**
 * 🔧 Activa o desactiva el modo inteligente dinámicamente
 */
export function setIntelligentMode(enabled) {
  intelligentModeEnabled = enabled;
  console.log('[IntelligentSystem] 🔄 Modo inteligente:', enabled ? 'ACTIVADO' : 'DESACTIVADO');
}

/**
 * 📊 Obtiene el estado actual del sistema inteligente
 */
export function getIntelligentSystemStatus() {
  return {
    enabled: intelligentModeEnabled,
    timestamp: new Date().toISOString()
  };
}

export default {
  initializeIntelligentSystem,
  handleWithIntelligence,
  setIntelligentMode,
  getIntelligentSystemStatus
};
