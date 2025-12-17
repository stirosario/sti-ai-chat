/**
 * ticketing.js
 * Sistema de tickets REAL para producción
 * Genera IDs únicos, persiste en disco, integración WhatsApp
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { maskPII } from './flowLogger.js';

const TICKETS_DIR = process.env.TICKETS_DIR || path.join(process.cwd(), 'data', 'tickets');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://stia.com.ar').replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Asegurar directorio existe
try {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
} catch (e) { /* noop */ }

/**
 * Genera ID único de ticket: STI-YYYYMMDD-XXXX
 * @returns {string} ID del ticket
 */
export function generateTicketId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 caracteres hex
  
  return `STI-${year}${month}${day}-${random}`;
}

/**
 * Crea un ticket y lo persiste en /data/tickets/
 * @param {Object} session - Sesión del usuario
 * @returns {Object} Ticket creado
 */
export async function createTicket(session) {
  try {
    const ticketId = generateTicketId();
    const now = new Date().toISOString();
    
    // Construir resumen de pasos realizados
    const stepsCompleted = session.stepsDone || [];
    const stepsSummary = stepsCompleted.length > 0
      ? stepsCompleted.map((step, i) => `${i + 1}. ${step}`).join('\n')
      : 'No se completaron pasos de diagnóstico';
    
    // Generar resumen automático del problema
    const problemSummary = generateProblemSummary(session);
    
    // Formatear conversación limpia para el ticket
    const cleanConversation = formatCleanConversation(session.transcript, session.userName || 'Usuario');
    
    // Construir ticket (CON DATOS ENMASCARADOS)
    const ticket = {
      id: ticketId,
      sessionId: session.id,
      createdAt: now,
      status: 'open',
      priority: 'normal',
      
      // Datos del usuario (ENMASCARADOS)
      user: {
        name: maskPII(session.userName || 'Anónimo'),
        nameOriginal: session.userName || 'Anónimo', // Para uso interno SOLAMENTE
        locale: session.userLocale || 'es-AR'
      },
      
      // Problema reportado
      issue: {
        device: session.detectedEntities?.device || session.device || 'No especificado',
        problem: maskPII(session.detectedEntities?.problem || session.problem || 'No especificado'),
        description: problemSummary, // ✅ NUEVO: Resumen automático generado
        category: session.issueKey || 'general'
      },
      
      // Diagnóstico realizado
      diagnostic: {
        stepsCompleted: stepsCompleted.length,
        steps: stepsCompleted,
        summary: stepsSummary,
        conversationState: session.conversationState || 'escalate'
      },
      
      // Transcript completo (ENMASCARADO)
      transcript: session.transcript ? session.transcript.map(msg => ({
        ...msg,
        text: maskPII(msg.text)
      })) : [],
      
      // ✅ NUEVO: Conversación formateada para humanos
      cleanConversation: cleanConversation,
      
      // Metadatos
      metadata: {
        createdBy: 'Tecnos AI Chatbot v7',
        escalationReason: session.escalationReason || 'Usuario requirió asistencia humana',
        gdprConsent: session.gdprConsent || false,
        gdprConsentDate: session.gdprConsentDate || null
      }
    };
    
    // Guardar en archivo JSON
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
    fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2), 'utf8');
    
    console.log(`[TICKET] ✅ Ticket creado: ${ticketId} (${ticketPath})`);
    
    return ticket;
  } catch (error) {
    console.error('[TICKET] ❌ Error creando ticket:', error);
    throw new Error('Error al generar ticket');
  }
}

/**
 * Genera URL pública para ver el ticket
 * @param {string} ticketId - ID del ticket
 * @returns {string} URL pública
 */
export function getTicketPublicUrl(ticketId) {
  return `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
}

/**
 * Formatea el transcript como conversación humana limpia
 * @param {Array} transcript - Array de mensajes del transcript
 * @param {string} userName - Nombre del usuario
 * @returns {string} Conversación formateada
 */
function formatCleanConversation(transcript, userName) {
  if (!transcript || transcript.length === 0) {
    return '(Sin conversación registrada)';
  }
  
  const lines = [];
  
  for (const msg of transcript) {
    // Saltar mensajes de sistema, metadata, o vacíos
    if (!msg.text || msg.who === 'system' || msg.text.trim() === '') continue;
    
    // Limpiar texto de emojis de control y metadata
    let cleanText = msg.text
      .replace(/\[ts:.*?\]/g, '') // Eliminar timestamps internos
      .replace(/\[who:.*?\]/g, '') // Eliminar metadata
      .replace(/\[system:.*?\]/g, '') // Eliminar system messages
      .replace(/\{.*?\}/g, '') // Eliminar objetos JSON incrustados
      .trim();
    
    // Saltar si después de limpiar quedó vacío
    if (!cleanText) continue;
    
    // Formatear hora del mensaje
    const timestamp = msg.ts ? new Date(msg.ts) : new Date();
    const timeStr = timestamp.toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    // Determinar quién habla
    const speaker = msg.who === 'user' ? userName : 'Tecnos';
    
    // Agregar línea de conversación
    lines.push(`[${timeStr}] ${speaker}: ${cleanText}`);
  }
  
  return lines.length > 0 ? lines.join('\n') : '(Sin conversación válida)';
}

/**
 * Genera resumen automático del problema detectado
 * @param {Object} session - Sesión del usuario
 * @returns {string} Resumen del problema
 */
function generateProblemSummary(session) {
  const device = session.detectedEntities?.device || session.device || 'dispositivo no especificado';
  const problem = session.detectedEntities?.problem || session.problem || 'problema no especificado';
  const description = session.detectedEntities?.description || '';
  
  let summary = `El usuario reporta ${problem} en ${device}.`;
  
  if (description) {
    summary += ` ${description}`;
  }
  
  const stepsCount = session.stepsDone?.length || 0;
  if (stepsCount > 0) {
    summary += ` Se completaron ${stepsCount} pasos de diagnóstico sin éxito.`;
  }
  
  return summary;
}

/**
 * Genera link de WhatsApp con resumen del ticket en formato humano
 * @param {Object} ticket - Ticket creado
 * @returns {string} URL de WhatsApp
 */
export function generateWhatsAppLink(ticket) {
  const userName = ticket.user.nameOriginal || 'Usuario';
  const device = ticket.issue.device || 'Sin especificar';
  const startTime = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  }) : 'N/A';
  
  // Generar resumen automático
  const problemSummary = ticket.issue.description || 
    `Problema: ${ticket.issue.problem || 'No especificado'}`;
  
  // Formatear conversación limpia
  const conversation = formatCleanConversation(ticket.transcript, userName);
  
  // Determinar estado final
  let finalStatus = '🔄 En espera de asistencia técnica';
  if (ticket.diagnostic.stepsCompleted > 0) {
    finalStatus = `✅ ${ticket.diagnostic.stepsCompleted} pasos de diagnóstico completados - Requiere asistencia adicional`;
  }
  
  // Construir mensaje limpio y legible
  const message = `Hola STI! 👋

Vengo del chat web con Tecnos (Asistente AI).

📝 **Ticket:** ${ticket.id}
👤 **Usuario:** ${userName}
💻 **Dispositivo:** ${device}
🕒 **Inicio:** ${startTime}

🧾 **RESUMEN DEL PROBLEMA:**
${problemSummary}

💬 **CONVERSACIÓN:**

${conversation}

${finalStatus}

🔗 Ver ticket completo: ${getTicketPublicUrl(ticket.id)}

Gracias!`;

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
}

/**
 * Obtener ticket por ID
 * @param {string} ticketId - ID del ticket
 * @returns {Object|null} Ticket o null si no existe
 */
export function getTicket(ticketId) {
  try {
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
    
    if (!fs.existsSync(ticketPath)) {
      return null;
    }
    
    const data = fs.readFileSync(ticketPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`[TICKET] Error reading ticket ${ticketId}:`, error);
    return null;
  }
}

/**
 * Actualizar estado de ticket
 * @param {string} ticketId - ID del ticket
 * @param {string} status - Nuevo estado (open, in_progress, resolved, closed)
 * @returns {boolean} Success
 */
export function updateTicketStatus(ticketId, status) {
  try {
    const ticket = getTicket(ticketId);
    
    if (!ticket) {
      console.error(`[TICKET] Ticket ${ticketId} no encontrado`);
      return false;
    }
    
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
    fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2), 'utf8');
    
    console.log(`[TICKET] ✅ Estado actualizado: ${ticketId} → ${status}`);
    return true;
  } catch (error) {
    console.error(`[TICKET] Error updating ticket ${ticketId}:`, error);
    return false;
  }
}

/**
 * Listar todos los tickets (para panel admin)
 * @param {Object} filters - Filtros opcionales {status, limit}
 * @returns {Array} Array de tickets
 */
export function listTickets(filters = {}) {
  try {
    const files = fs.readdirSync(TICKETS_DIR);
    const tickets = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const ticketPath = path.join(TICKETS_DIR, file);
        const data = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));
        
        // Aplicar filtros
        if (filters.status && data.status !== filters.status) {
          continue;
        }
        
        tickets.push(data);
      }
    }
    
    // Ordenar por fecha (más reciente primero)
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limitar resultados
    if (filters.limit) {
      return tickets.slice(0, filters.limit);
    }
    
    return tickets;
  } catch (error) {
    console.error('[TICKET] Error listing tickets:', error);
    return [];
  }
}
