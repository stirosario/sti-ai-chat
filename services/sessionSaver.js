/**
 * services/sessionSaver.js
 * Sistema optimizado de guardado de sesiones con batch saves
 * 
 * Reduce múltiples guardados en un mismo request a un solo guardado al final
 */

/**
 * Mapa de sesiones que necesitan guardarse
 * Key: sessionId, Value: { session, timestamp, saved: boolean }
 */
const pendingSaves = new Map();

/**
 * Marca una sesión como "dirty" (necesita guardarse)
 * No guarda inmediatamente, solo marca para guardado diferido
 * 
 * ✅ MEDIO-8: Validación de parámetros mejorada
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión
 */
export function markSessionDirty(sessionId, session) {
  if (!sessionId || !session) return;
  
  // ✅ MEDIO-8: Validar formato de sessionId (debe ser string no vacío)
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    console.error('[SESSION_SAVER] ⚠️ sessionId inválido:', sessionId);
    return;
  }
  
  // ✅ MEDIO-8: Validar que session es un objeto válido
  if (typeof session !== 'object' || session === null || Array.isArray(session)) {
    console.error('[SESSION_SAVER] ⚠️ session inválido:', typeof session);
    return;
  }
  
  pendingSaves.set(sessionId, {
    session: { ...session }, // Copia para evitar mutaciones
    timestamp: Date.now(),
    saved: false
  });
}

/**
 * Guarda una sesión inmediatamente (para casos críticos)
 * 
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión
 * @param {Function} saveFunction - Función de guardado (saveSessionAndTranscript)
 */
export async function saveSessionImmediate(sessionId, session, saveFunction) {
  if (!sessionId || !session || !saveFunction) return;
  
  // Guardar inmediatamente
  await saveFunction(sessionId, session);
  
  // Marcar como guardado en el mapa
  if (pendingSaves.has(sessionId)) {
    pendingSaves.get(sessionId).saved = true;
  }
}

/**
 * Guarda todas las sesiones pendientes de un request
 * Debe llamarse ANTES de enviar la respuesta al cliente
 * 
 * @param {string} sessionId - ID de la sesión principal
 * @param {object} session - Objeto de sesión actualizado
 * @param {Function} saveFunction - Función de guardado (saveSessionAndTranscript)
 */
export async function flushPendingSaves(sessionId, session, saveFunction) {
  if (!sessionId || !session || !saveFunction) return;
  
  // Actualizar la sesión principal con la versión más reciente
  markSessionDirty(sessionId, session);
  
  // Guardar todas las sesiones pendientes
  const saves = [];
  
  for (const [sid, pending] of pendingSaves.entries()) {
    if (!pending.saved && pending.session) {
      saves.push(
        saveFunction(sid, pending.session).catch(err => {
          // ✅ MEDIO-11: Mejorar logging de errores críticos
          console.error(`[SESSION_SAVER] ❌ Error crítico guardando sesión ${sid}:`, {
            error: err.message,
            stack: err.stack,
            sessionId: sid,
            timestamp: new Date().toISOString()
          });
          // Marcar como error para no perder el dato
          pending.error = err.message;
          pending.errorTimestamp = Date.now();
          return null; // Continuar con otras sesiones aunque una falle
        })
      );
      pending.saved = true;
    }
  }
  
  // Ejecutar todos los guardados en paralelo
  const results = await Promise.all(saves);
  
  // ✅ MEDIO-11: Reportar errores si hubo fallos
  const failedSaves = results.filter(r => r === null).length;
  if (failedSaves > 0) {
    console.warn(`[SESSION_SAVER] ⚠️ ${failedSaves} guardado(s) fallaron. Revisar logs arriba.`);
  }
  
  // Limpiar sesiones guardadas (mantener solo las no guardadas por si hay errores)
  for (const [sid, pending] of pendingSaves.entries()) {
    if (pending.saved) {
      pendingSaves.delete(sid);
    }
  }
}

/**
 * Limpia todas las sesiones pendientes (útil para cleanup)
 */
export function clearPendingSaves() {
  pendingSaves.clear();
}

/**
 * Obtiene el número de sesiones pendientes de guardar
 */
export function getPendingSavesCount() {
  return Array.from(pendingSaves.values()).filter(p => !p.saved).length;
}
