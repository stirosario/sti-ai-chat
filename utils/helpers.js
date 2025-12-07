/**
 * utils/helpers.js
 * Funciones helper reutilizables y seguras
 */

import crypto from 'crypto';

/**
 * Genera URL de WhatsApp con el texto formateado
 * @param {string} phoneNumber - Número de teléfono (con o sin formato)
 * @param {string} text - Texto del mensaje
 * @returns {string} URL de WhatsApp
 */
export function buildWhatsAppUrl(phoneNumber, text) {
  const cleanNumber = String(phoneNumber || '').replace(/\D+/g, '');
  const encodedText = encodeURIComponent(text || '');
  return `https://wa.me/${cleanNumber}?text=${encodedText}`;
}

/**
 * Genera saludo basado en la hora del día
 * @param {string} userName - Nombre del usuario (opcional)
 * @returns {string} Saludo acorde al horario
 */
export function buildTimeGreeting(userName = '') {
  const now = new Date();
  const hour = now.getHours();
  const namePart = userName ? `, ${userName}` : '';

  if (hour >= 6 && hour < 12) {
    return `🌅 Buen día${namePart}! Gracias por usar Tecnos de STI — Servicio Técnico Inteligente.`;
  }

  if (hour >= 12 && hour < 19) {
    return `🌇 Buenas tardes${namePart}! Gracias por usar Tecnos de STI — Servicio Técnico Inteligente.`;
  }

  return `🌙 Buenas noches${namePart}! Gracias por usar Tecnos de STI — Servicio Técnico Inteligente.`;
}

/**
 * Genera un ID de ticket único
 * @returns {string} ID de ticket en formato TCK-YYYYMMDD-RANDOM
 */
export function generateTicketId() {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TCK-${ymd}-${rand}`;
}

/**
 * Formatea fecha y hora en formato argentino
 * @param {Date} date - Fecha a formatear (default: ahora)
 * @returns {string} Fecha formateada como "DD-MM-YYYY HH:MM (ART)"
 */
export function formatArgentinaDateTime(date = new Date()) {
  const dateFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const datePart = dateFormatter.format(date).replace(/\//g, '-');
  const timePart = timeFormatter.format(date);
  return `${datePart} ${timePart} (ART)`;
}

/**
 * Sanitiza un nombre para uso seguro en tickets
 * @param {string} name - Nombre a sanitizar
 * @returns {string} Nombre sanitizado
 */
export function sanitizeNameForTicket(name) {
  if (!name) return '';
  return String(name)
    .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Genera mensaje de prompt para cambio de idioma
 * @param {string} locale - Locale del usuario (default: 'es-AR')
 * @returns {string} Mensaje de prompt
 */
export function buildLanguagePrompt(locale = 'es-AR') {
  const norm = (locale || '').toLowerCase();
  const isEn = norm.startsWith('en');

  if (isEn) {
    return '🌐 You can change the language at any time using the buttons below:';
  }

  return '🌐 Podés cambiar el idioma en cualquier momento usando los botones:';
}

/**
 * Genera saludo inicial con presentación de Tecnos
 * @param {string} locale - Locale del usuario (default: 'es-AR')
 * @returns {string} Saludo completo
 */
export function buildNameGreeting(locale = 'es-AR') {
  const norm = (locale || '').toLowerCase();
  const isEn = norm.startsWith('en');
  const isEsLatam = norm.startsWith('es-') && !norm.includes('ar');

  if (isEn) {
    const line1 = "👋 Hi, I'm Tecnos, the intelligent assistant of STI — Servicio Técnico Inteligente.";
    const line2 = "I can help you with PCs, notebooks, Wi‑Fi, printers and some TV / streaming devices.";
    const line3 = "I can't access your device remotely or make changes for you; we'll try guided steps to diagnose the issue and, if needed, I'll connect you with a human technician.";
    const line4 = "To get started, what's your name?";
    return `${line1}

${line2} ${line3}

${line4}`;
  }

  if (isEsLatam) {
    const line1 = "👋 Hola, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.";
    const line2 = "Puedo ayudarte con PC, notebooks, Wi‑Fi, impresoras y algunos dispositivos de TV y streaming.";
    const line3 = "No puedo acceder a tu equipo ni ejecutar cambios remotos; vamos a probar pasos guiados para diagnosticar y, si hace falta, te derivo a un técnico humano.";
    const line4 = "Para empezar, ¿cómo te llamas?";
    return `${line1}

${line2} ${line3}

${line4}`;
  }

  const line1 = "👋 Hola, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.";
  const line2 = "Puedo ayudarte con PC, notebooks, Wi‑Fi, impresoras y algunos dispositivos de TV y streaming.";
  const line3 = "No puedo acceder a tu equipo ni ejecutar cambios remotos; vamos a probar pasos guiados para diagnosticar y, si hace falta, te derivo a un técnico humano.";
  const line4 = "Para empezar: ¿cómo te llamás?";
  return `${line1}

${line2} ${line3}

${line4}`;
}
