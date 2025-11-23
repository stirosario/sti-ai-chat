/**
 * flowLogger.js
 * Sistema de logging para auditoría del flujo de conversación
 * Exporta cada interacción en formato tabla CSV
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOGS_DIR || path.join(process.cwd(), 'data', 'logs');
const FLOW_LOG_FILE = path.join(LOG_DIR, 'flow-audit.csv');
const FLOW_LOG_JSON = path.join(LOG_DIR, 'flow-audit.json');

// Contador global de interacciones
let interactionCounter = 0;

// Cache en memoria para análisis rápido
const flowCache = [];
const MAX_CACHE_SIZE = 1000;

// Inicializar archivo CSV con headers si no existe
function initFlowLog() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(FLOW_LOG_FILE)) {
      const headers = 'Nº,Timestamp,SessionId,Etapa Actual,Input Usuario,Trigger Detectado,Respuesta del Bot,Siguiente Etapa,Acción Servidor,Duración (ms)\n';
      fs.writeFileSync(FLOW_LOG_FILE, headers, 'utf8');
      console.log('[FlowLogger] ✅ Archivo de auditoría creado:', FLOW_LOG_FILE);
    }
    
    // Leer contador del último registro
    if (fs.existsSync(FLOW_LOG_FILE)) {
      const content = fs.readFileSync(FLOW_LOG_FILE, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length > 1) {
        const lastLine = lines[lines.length - 1];
        const firstColumn = lastLine.split(',')[0];
        interactionCounter = parseInt(firstColumn) || 0;
      }
    }
  } catch (error) {
    console.error('[FlowLogger] ⚠️  Error inicializando log:', error.message);
  }
}

/**
 * Escapar valores CSV (comillas, comas, saltos de línea)
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Si contiene comillas, comas o saltos de línea, escapar
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Truncar texto largo para mejor legibilidad
 */
function truncate(text, maxLength = 100) {
  if (!text) return '';
  const str = String(text).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Log de una interacción en el flujo
 * @param {Object} data - Datos de la interacción
 */
export function logFlowInteraction(data) {
  try {
    interactionCounter++;
    
    const timestamp = new Date().toISOString();
    const entry = {
      numero: interactionCounter,
      timestamp,
      sessionId: data.sessionId || 'N/A',
      etapaActual: data.currentStage || 'N/A',
      inputUsuario: truncate(data.userInput, 150),
      triggerDetectado: data.trigger || 'N/A',
      respuestaBot: truncate(data.botResponse, 150),
      siguienteEtapa: data.nextStage || 'N/A',
      accionServidor: data.serverAction || 'N/A',
      duracionMs: data.duration || 0
    };

    // Agregar a cache en memoria
    flowCache.push(entry);
    if (flowCache.length > MAX_CACHE_SIZE) {
      flowCache.shift(); // Eliminar el más antiguo
    }

    // Escribir en CSV
    const csvLine = [
      entry.numero,
      entry.timestamp,
      escapeCsv(entry.sessionId),
      escapeCsv(entry.etapaActual),
      escapeCsv(entry.inputUsuario),
      escapeCsv(entry.triggerDetectado),
      escapeCsv(entry.respuestaBot),
      escapeCsv(entry.siguienteEtapa),
      escapeCsv(entry.accionServidor),
      entry.duracionMs
    ].join(',') + '\n';

    fs.appendFileSync(FLOW_LOG_FILE, csvLine, 'utf8');

    // Escribir también en JSON para análisis programático
    const jsonEntry = JSON.stringify(entry) + '\n';
    fs.appendFileSync(FLOW_LOG_JSON, jsonEntry, 'utf8');

    // Log en consola con formato tabla
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│ 📊 FLOW LOG #${entry.numero.toString().padEnd(52)}│`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ Session:    ${entry.sessionId.substring(0, 48).padEnd(48)}│`);
    console.log(`│ Stage:      ${entry.etapaActual.padEnd(48)}│`);
    console.log(`│ Input:      ${entry.inputUsuario.substring(0, 48).padEnd(48)}│`);
    console.log(`│ Trigger:    ${entry.triggerDetectado.padEnd(48)}│`);
    console.log(`│ Response:   ${entry.respuestaBot.substring(0, 48).padEnd(48)}│`);
    console.log(`│ Next Stage: ${entry.siguienteEtapa.padEnd(48)}│`);
    console.log(`│ Action:     ${entry.accionServidor.padEnd(48)}│`);
    console.log(`│ Duration:   ${(entry.duracionMs + 'ms').padEnd(48)}│`);
    console.log('└─────────────────────────────────────────────────────────────────┘\n');

    return entry;
  } catch (error) {
    console.error('[FlowLogger] ⚠️  Error logging interaction:', error.message);
    return null;
  }
}

/**
 * Detectar loops: misma etapa repetida sin avanzar
 */
export function detectLoops(sessionId, maxRepeats = 3) {
  const sessionLogs = flowCache.filter(entry => entry.sessionId === sessionId);
  if (sessionLogs.length < maxRepeats) return null;

  // Obtener las últimas N entradas
  const recentLogs = sessionLogs.slice(-maxRepeats);
  const stages = recentLogs.map(log => log.etapaActual);
  
  // Verificar si todas son iguales
  const allSame = stages.every(stage => stage === stages[0]);
  
  if (allSame && stages[0] !== 'ENDED') {
    return {
      detected: true,
      stage: stages[0],
      count: maxRepeats,
      message: `⚠️  LOOP DETECTADO: Etapa ${stages[0]} repetida ${maxRepeats} veces sin avanzar`
    };
  }
  
  return null;
}

/**
 * Generar reporte de auditoría para una sesión
 */
export function getSessionAudit(sessionId) {
  const sessionLogs = flowCache.filter(entry => entry.sessionId === sessionId);
  
  if (sessionLogs.length === 0) {
    return { error: 'Sesión no encontrada en cache' };
  }

  // Análisis de transiciones
  const transitions = [];
  for (let i = 0; i < sessionLogs.length - 1; i++) {
    transitions.push({
      from: sessionLogs[i].etapaActual,
      to: sessionLogs[i].siguienteEtapa,
      trigger: sessionLogs[i].triggerDetectado
    });
  }

  // Detectar anomalías
  const anomalies = [];
  
  // 1. Etapas que no avanzan
  const stuckStages = transitions.filter(t => t.from === t.to && t.from !== 'ENDED');
  if (stuckStages.length > 0) {
    anomalies.push(`Etapas sin avance: ${stuckStages.length}`);
  }

  // 2. Retrocesos inesperados
  const stageOrder = ['ASK_LANGUAGE', 'ASK_NAME', 'ASK_NEED', 'ASK_PROBLEM', 'BASIC_TESTS', 'ESCALATE', 'CREATE_TICKET'];
  const backwards = transitions.filter(t => {
    const fromIdx = stageOrder.indexOf(t.from);
    const toIdx = stageOrder.indexOf(t.to);
    return fromIdx > toIdx && fromIdx !== -1 && toIdx !== -1;
  });
  if (backwards.length > 0) {
    anomalies.push(`Retrocesos detectados: ${backwards.length}`);
  }

  return {
    sessionId,
    totalInteractions: sessionLogs.length,
    stages: [...new Set(sessionLogs.map(l => l.etapaActual))],
    transitions,
    anomalies,
    firstInteraction: sessionLogs[0].timestamp,
    lastInteraction: sessionLogs[sessionLogs.length - 1].timestamp,
    totalDuration: sessionLogs.reduce((sum, log) => sum + (log.duracionMs || 0), 0),
    logs: sessionLogs
  };
}

/**
 * Generar reporte completo en formato markdown
 */
export function generateAuditReport() {
  const allSessions = [...new Set(flowCache.map(e => e.sessionId))];
  
  let report = '# 📊 Reporte de Auditoría de Flujo\n\n';
  report += `**Generado:** ${new Date().toISOString()}\n\n`;
  report += `**Total de interacciones:** ${interactionCounter}\n`;
  report += `**Sesiones activas:** ${allSessions.length}\n\n`;
  
  report += '## Resumen por Sesión\n\n';
  
  for (const sessionId of allSessions.slice(-10)) { // Últimas 10 sesiones
    const audit = getSessionAudit(sessionId);
    report += `### Sesión: ${sessionId.substring(0, 16)}...\n\n`;
    report += `- **Interacciones:** ${audit.totalInteractions}\n`;
    report += `- **Etapas visitadas:** ${audit.stages.join(' → ')}\n`;
    report += `- **Duración total:** ${audit.totalDuration}ms\n`;
    
    if (audit.anomalies.length > 0) {
      report += `- **⚠️  Anomalías:** ${audit.anomalies.join(', ')}\n`;
    } else {
      report += `- **✅ Sin anomalías detectadas**\n`;
    }
    
    report += '\n';
  }
  
  return report;
}

/**
 * Exportar logs a archivo Excel-compatible
 */
export function exportToExcel(outputPath) {
  try {
    // Copiar el CSV actual con mejor formato para Excel
    const content = fs.readFileSync(FLOW_LOG_FILE, 'utf8');
    const excelPath = outputPath || path.join(LOG_DIR, `flow-audit-${Date.now()}.csv`);
    fs.writeFileSync(excelPath, '\ufeff' + content, 'utf8'); // BOM para UTF-8 en Excel
    console.log(`[FlowLogger] ✅ Exportado a: ${excelPath}`);
    return excelPath;
  } catch (error) {
    console.error('[FlowLogger] ⚠️  Error exportando:', error.message);
    return null;
  }
}

// Inicializar al cargar el módulo
initFlowLog();

export default {
  logFlowInteraction,
  detectLoops,
  getSessionAudit,
  generateAuditReport,
  exportToExcel
};
