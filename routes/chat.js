/**
 * routes/chat.js
 * Endpoint principal /api/chat
 * 
 * NOTA: Este archivo está preparado para futura migración.
 * Por ahora, el endpoint sigue en server.js para mantener estabilidad.
 * 
 * Para activar esta ruta:
 * 1. Mover la lógica del endpoint desde server.js aquí
 * 2. Importar todas las dependencias necesarias
 * 3. Actualizar server.js para usar: app.use('/api/chat', chatRouter)
 */

import express from 'express';

const router = express.Router();

/**
 * POST /api/chat
 * Endpoint principal para procesar mensajes del chat
 * 
 * @route POST /api/chat
 * @param {object} req.body - { message, imageBase64, sessionId, stage }
 * @returns {object} { ok, reply, stage, buttons?, ... }
 */
router.post('/', async (req, res) => {
  // TODO: Migrar lógica desde server.js aquí
  // Por ahora, este archivo solo prepara la estructura
  res.status(501).json({ 
    ok: false, 
    error: 'Not implemented - endpoint still in server.js' 
  });
});

export default router;
