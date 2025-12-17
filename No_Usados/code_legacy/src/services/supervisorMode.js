/**
 * 🔧 MODO SUPERVISOR - Sistema de Corrección de Flujos
 * Permite corregir fallas en el flujo del chatbot desde el mismo chat
 * Solo accesible con autenticación especial
 * 
 * Autor: STI AI Team
 * Fecha: 2025-12-06
 */

import crypto from 'crypto';

// Token secreto para activar modo supervisor (configurar en .env)
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || crypto.randomBytes(32).toString('hex');
const SUPERVISOR_PASSWORD = process.env.SUPERVISOR_PASSWORD || 'admin123'; // Cambiar en producción

// Almacenamiento de sesiones activas en modo supervisor
const supervisorSessions = new Map(); // Map<sessionId, {active: boolean, authenticatedAt: timestamp}>

/**
 * Verifica si un mensaje es un comando de activación del modo supervisor
 */
export function isSupervisorActivationCommand(message) {
  const lowerMsg = message.toLowerCase().trim();
  
  // Comandos de activación
  const activationCommands = [
    '/admin',
    '/supervisor',
    '/modo-admin',
    'activar modo supervisor',
    'modo supervisor'
  ];
  
  return activationCommands.some(cmd => lowerMsg === cmd || lowerMsg.includes(cmd));
}

/**
 * Verifica si una sesión está en modo supervisor
 */
export function isSupervisorModeActive(sessionId) {
  const session = supervisorSessions.get(sessionId);
  return session && session.active && (Date.now() - session.authenticatedAt) < (30 * 60 * 1000); // 30 minutos
}

/**
 * Autentica el modo supervisor con token o contraseña
 */
export function authenticateSupervisor(sessionId, providedToken, providedPassword) {
  // Verificar token
  if (providedToken && providedToken === SUPERVISOR_TOKEN) {
    supervisorSessions.set(sessionId, {
      active: true,
      authenticatedAt: Date.now()
    });
    return { success: true, message: 'Modo supervisor activado con token' };
  }
  
  // Verificar contraseña
  if (providedPassword && providedPassword === SUPERVISOR_PASSWORD) {
    supervisorSessions.set(sessionId, {
      active: true,
      authenticatedAt: Date.now()
    });
    return { success: true, message: 'Modo supervisor activado con contraseña' };
  }
  
  return { success: false, message: 'Token o contraseña incorrectos' };
}

/**
 * Desactiva el modo supervisor para una sesión
 */
export function deactivateSupervisorMode(sessionId) {
  supervisorSessions.delete(sessionId);
  return { success: true, message: 'Modo supervisor desactivado' };
}

/**
 * Procesa comandos del modo supervisor
 */
export async function processSupervisorCommand(sessionId, command, session, saveSessionFn) {
  if (!isSupervisorModeActive(sessionId)) {
    return {
      ok: false,
      reply: '❌ Modo supervisor no activo. Usá `/admin` para activarlo.'
    };
  }
  
  const lowerCmd = command.toLowerCase().trim();
  
  // Comando: /status - Ver estado actual
  if (lowerCmd.startsWith('/status') || lowerCmd === 'status') {
    return {
      ok: true,
      reply: formatSessionStatus(session),
      supervisorMode: true
    };
  }
  
  // Comando: /logs - Ver logs de la conversación
  if (lowerCmd.startsWith('/logs') || lowerCmd === 'logs') {
    return {
      ok: true,
      reply: formatConversationLogs(session),
      supervisorMode: true
    };
  }
  
  // Comando: /goto <estado> - Forzar cambio de estado
  if (lowerCmd.startsWith('/goto ')) {
    const newStage = command.substring(6).trim();
    return await forceStageChange(sessionId, newStage, session, saveSessionFn);
  }
  
  // Comando: /say <mensaje> - Inyectar respuesta del bot
  if (lowerCmd.startsWith('/say ')) {
    const botMessage = command.substring(5).trim();
    return await injectBotResponse(sessionId, botMessage, session, saveSessionFn);
  }
  
  // Comando: /fix - Marcar sesión como corregida
  if (lowerCmd === '/fix' || lowerCmd === 'fix') {
    return await markSessionAsFixed(sessionId, session, saveSessionFn);
  }
  
  // Comando: /help - Ayuda de comandos
  if (lowerCmd === '/help' || lowerCmd === 'help') {
    return {
      ok: true,
      reply: formatSupervisorHelp(),
      supervisorMode: true
    };
  }
  
  // Comando: /exit - Salir del modo supervisor
  if (lowerCmd === '/exit' || lowerCmd === 'exit') {
    deactivateSupervisorMode(sessionId);
    return {
      ok: true,
      reply: '✅ Modo supervisor desactivado. Volviste al modo normal.',
      supervisorMode: false
    };
  }
  
  // Comando desconocido
  return {
    ok: true,
    reply: `❓ Comando desconocido: "${command}"\n\nUsá /help para ver comandos disponibles.`,
    supervisorMode: true
  };
}

/**
 * Formatea el estado de la sesión para mostrar
 */
function formatSessionStatus(session) {
  const status = [];
  status.push('📊 **ESTADO DE LA SESIÓN**\n');
  status.push(`🆔 Session ID: \`${session.id?.substring(0, 20)}...\``);
  status.push(`👤 Usuario: ${session.userName || 'No definido'}`);
  status.push(`🌍 Idioma: ${session.userLocale || 'No definido'}`);
  status.push(`📍 Estado actual: \`${session.stage || 'N/A'}\``);
  status.push(`💬 Mensajes: ${session.transcript?.length || 0}`);
  
  if (session.activeIntent) {
    status.push(`\n🎯 **Intent Activo:**`);
    status.push(`   Tipo: ${session.activeIntent.type || 'N/A'}`);
    status.push(`   Confianza: ${(session.activeIntent.confidence * 100).toFixed(1)}%`);
    status.push(`   Resuelto: ${session.activeIntent.resolved ? 'Sí' : 'No'}`);
  }
  
  if (session.problem) {
    status.push(`\n🔧 **Problema:** ${session.problem}`);
  }
  
  if (session.device) {
    status.push(`\n💻 **Dispositivo:** ${session.device}`);
  }
  
  if (session.stepProgress) {
    status.push(`\n📈 **Progreso:** Paso ${session.stepProgress.current || 0} de ${session.stepProgress.total || 0}`);
  }
  
  status.push(`\n⏰ Última actividad: ${new Date(session.lastActivity || Date.now()).toLocaleString('es-AR')}`);
  
  return status.join('\n');
}

/**
 * Formatea los logs de la conversación
 */
function formatConversationLogs(session) {
  const logs = [];
  logs.push('📋 **LOGS DE LA CONVERSACIÓN**\n');
  
  if (!session.transcript || session.transcript.length === 0) {
    logs.push('No hay mensajes registrados aún.');
    return logs.join('\n');
  }
  
  session.transcript.forEach((entry, index) => {
    const who = entry.who === 'user' ? '👤 Usuario' : '🤖 Tecnos';
    const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('es-AR') : 'N/A';
    const text = entry.text ? entry.text.substring(0, 100) : '[sin texto]';
    
    logs.push(`${index + 1}. [${time}] ${who}:`);
    logs.push(`   ${text}${text.length >= 100 ? '...' : ''}`);
  });
  
  return logs.join('\n');
}

/**
 * Fuerza un cambio de estado
 */
async function forceStageChange(sessionId, newStage, session, saveSessionFn) {
  const oldStage = session.stage;
  session.stage = newStage;
  session.supervisorCorrections = session.supervisorCorrections || [];
  session.supervisorCorrections.push({
    type: 'stage_change',
    oldStage,
    newStage,
    timestamp: new Date().toISOString()
  });
  
  if (saveSessionFn) {
    await saveSessionFn(sessionId, session);
  }
  
  return {
    ok: true,
    reply: `✅ Estado cambiado: \`${oldStage}\` → \`${newStage}\`\n\nLa sesión ahora está en el nuevo estado.`,
    supervisorMode: true
  };
}

/**
 * Inyecta una respuesta del bot
 */
async function injectBotResponse(sessionId, botMessage, session, saveSessionFn) {
  session.transcript = session.transcript || [];
  session.transcript.push({
    who: 'bot',
    text: botMessage,
    ts: new Date().toISOString(),
    injected: true // Marca que fue inyectado por supervisor
  });
  
  session.supervisorCorrections = session.supervisorCorrections || [];
  session.supervisorCorrections.push({
    type: 'injected_response',
    message: botMessage,
    timestamp: new Date().toISOString()
  });
  
  if (saveSessionFn) {
    await saveSessionFn(sessionId, session);
  }
  
  return {
    ok: true,
    reply: botMessage,
    supervisorMode: true,
    injected: true
  };
}

/**
 * Marca la sesión como corregida
 */
async function markSessionAsFixed(sessionId, session, saveSessionFn) {
  session.supervisorFixed = true;
  session.supervisorFixedAt = new Date().toISOString();
  session.supervisorCorrections = session.supervisorCorrections || [];
  session.supervisorCorrections.push({
    type: 'marked_as_fixed',
    timestamp: new Date().toISOString()
  });
  
  if (saveSessionFn) {
    await saveSessionFn(sessionId, session);
  }
  
  return {
    ok: true,
    reply: '✅ Sesión marcada como corregida. El flujo debería continuar normalmente ahora.',
    supervisorMode: true
  };
}

/**
 * Formatea la ayuda de comandos
 */
function formatSupervisorHelp() {
  const help = [];
  help.push('🔧 **MODO SUPERVISOR - COMANDOS DISPONIBLES**\n');
  help.push('📊 `/status` - Ver estado actual de la sesión');
  help.push('📋 `/logs` - Ver logs de la conversación');
  help.push('➡️ `/goto <estado>` - Forzar cambio de estado');
  help.push('💬 `/say <mensaje>` - Inyectar respuesta del bot');
  help.push('✅ `/fix` - Marcar sesión como corregida');
  help.push('❌ `/exit` - Salir del modo supervisor');
  help.push('❓ `/help` - Mostrar esta ayuda\n');
  help.push('**Ejemplos:**');
  help.push('• `/goto ASK_NEED` - Cambiar a estado ASK_NEED');
  help.push('• `/say Hola, ¿en qué puedo ayudarte?` - Inyectar mensaje del bot');
  
  return help.join('\n');
}

export default {
  isSupervisorActivationCommand,
  isSupervisorModeActive,
  authenticateSupervisor,
  deactivateSupervisorMode,
  processSupervisorCommand
};
