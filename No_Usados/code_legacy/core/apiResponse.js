/**
 * apiResponse.js
 * 
 * API Response Schema estandarizado.
 * 
 * Define el contrato exacto de la respuesta del backend al frontend,
 * asegurando consistencia y facilitando el desarrollo frontend.
 * 
 * PRINCIPIOS:
 * - P0: Single Source of Truth (backend define todo)
 * - P3: Observabilidad por turno
 */

import { getViewModel } from './stageEnforcer.js';

/**
 * Construir respuesta API estandarizada
 * 
 * @param {object} params - Parámetros de la respuesta
 * @param {boolean} params.ok - Si la operación fue exitosa
 * @param {string} params.sessionId - ID de sesión
 * @param {string} params.csrfToken - CSRF token (opcional)
 * @param {string} params.stage - Stage actual
 * @param {string} params.reply - Mensaje de respuesta del bot
 * @param {Array} params.buttons - Botones a mostrar
 * @param {object} params.viewModel - ViewModel para el frontend (opcional, se genera si no se proporciona)
 * @param {object} params.debug - Info de debug (opcional, solo si está en modo debug)
 * @param {object} params.extra - Campos extra (opcional)
 * @returns {object} Respuesta API estandarizada
 */
export function buildApiResponse(params) {
  const {
    ok = true,
    sessionId,
    csrfToken = null,
    stage,
    reply = '',
    buttons = [],
    viewModel = null,
    debug = null,
    extra = {}
  } = params;

  // Generar viewModel si no se proporciona
  let finalViewModel = viewModel;
  if (!finalViewModel && stage) {
    finalViewModel = getViewModel(stage);
  }

  // Construir respuesta base
  const response = {
    ok,
    sessionId,
    stage,
    reply,
    buttons: buttons.map(btn => ({
      token: btn.token || btn.value || '',
      label: btn.label || btn.text || '',
      order: btn.order || null,
      meta: btn.meta || null
    })),
    viewModel: finalViewModel || {
      stageType: 'OPEN_TEXT',
      allowText: true,
      allowButtons: false,
      maxButtons: 0
    }
  };

  // Agregar CSRF token si se proporciona
  if (csrfToken) {
    response.csrfToken = csrfToken;
  }

  // Agregar debug info si está disponible y estamos en modo debug
  if (debug && process.env.DEBUG === 'true') {
    response.debug = {
      stageBefore: debug.stageBefore || null,
      stageAfter: debug.stageAfter || stage,
      reason: debug.reason || null,
      violations: debug.violations || []
    };
  }

  // Agregar campos extra
  Object.assign(response, extra);

  return response;
}

/**
 * Construir respuesta de error estandarizada
 * 
 * @param {object} params - Parámetros del error
 * @param {string} params.error - Código de error
 * @param {string} params.message - Mensaje de error
 * @param {string} params.sessionId - ID de sesión
 * @param {string} params.stage - Stage actual
 * @param {object} params.extra - Campos extra
 * @returns {object} Respuesta de error estandarizada
 */
export function buildErrorResponse(params) {
  const {
    error = 'UNKNOWN_ERROR',
    message = 'Ocurrió un error inesperado',
    sessionId = null,
    stage = null,
    extra = {}
  } = params;

  return {
    ok: false,
    error,
    message,
    sessionId,
    stage,
    reply: message,
    buttons: [],
    viewModel: {
      stageType: 'OPEN_TEXT',
      allowText: true,
      allowButtons: false,
      maxButtons: 0
    },
    ...extra
  };
}

