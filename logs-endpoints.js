/**
 * logs-endpoints.js
 *
 * Módulo que agrega únicamente los endpoints de logs (SSE + polling)
 * - GET /api/logs/stream  -> SSE stream (mode=once para polling)
 * - GET /api/logs         -> descarga/visualización completa del log
 *
 * Uso:
 *  import registerLogsEndpoints from './logs-endpoints.js';
 *  const logsApi = registerLogsEndpoints(app, { LOGS_DIR, DATA_BASE, SSE_TOKEN });
 *
 * Devuelve: { broadcastLog } para enviar mensajes en vivo desde el servidor.
 */

import fs from 'fs';
import { createReadStream } from 'fs';
import path from 'path';

export default function registerLogsEndpoints(app, opts = {}) {
  const DATA_BASE = opts.DATA_BASE || process.env.DATA_BASE || '/data';
  const LOGS_DIR = opts.LOGS_DIR || process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
  const LOG_FILE = path.join(LOGS_DIR, 'server.log');
  const SSE_TOKEN = (opts.SSE_TOKEN !== undefined) ? String(opts.SSE_TOKEN) : (process.env.SSE_TOKEN || '');

  // asegurar directorio y archivo
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (e) { /* noop */ }
  try { if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8'); } catch (e) { /* noop */ }

  const sseClients = new Set();

  function sseSend(res, data) {
    const payload = String(data || '');
    const safe = payload.split(/\r?\n/).map(line => `data: ${line}`).join('\n') + '\n\n';
    try { res.write(safe); } catch (e) { /* ignore */ }
  }

  // enviá las últimas `bytes` del log (asíncrono, no bloqueante)
  async function sendLastBytes(res, bytes = 32 * 1024) {
    try {
      const stat = await fs.promises.stat(LOG_FILE);
      const start = Math.max(0, stat.size - bytes);
      const stream = createReadStream(LOG_FILE, { start, end: stat.size - 1, encoding: 'utf8' });
      for await (const chunk of stream) {
        sseSend(res, chunk);
      }
    } catch (e) {
      // archivo puede no existir o error de lectura; ignoramos
    }
  }

  // endpoint SSE + polling
  app.get('/api/logs/stream', async (req, res) => {
    try {
      // protección por token opcional
      if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
        return res.status(401).send('unauthorized');
      }

      // polling: devolver todo el log y salir
      if (String(req.query.mode || '') === 'once') {
        const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(txt);
      }

      // configurar SSE
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // CORS explícito útil si la página está en otro dominio
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.flushHeaders && res.flushHeaders();

      // comentario inicial para que algunos proxies no lo descarten
      res.write(': connected\n\n');

      // enviar últimas N KB de forma asíncrona (no bloqueante)
      sendLastBytes(res, 32 * 1024).catch(()=>{});

      // registrar cliente
      sseClients.add(res);
      console.log('[logs] cliente SSE conectado. total=', sseClients.size);

      // heartbeat (comentario SSE) cada 20s para mantener proxies contentos
      const hb = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
      }, 20_000);

      req.on('close', () => {
        clearInterval(hb);
        sseClients.delete(res);
        try { res.end(); } catch (_) {}
        console.log('[logs] cliente SSE desconectado. total=', sseClients.size);
      });

    } catch (e) {
      console.error('[logs/stream] Error', e && e.message);
      try { res.status(500).end(); } catch(_) {}
    }
  });

  // endpoint para descargar/ver todo el log (útil para polling fallback)
  app.get('/api/logs', (req, res) => {
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
      return res.status(401).json({ ok:false, error: 'unauthorized' });
    }
    try {
      const txt = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
      res.set('Content-Type','text/plain; charset=utf-8');
      res.send(txt);
    } catch (e) {
      console.error('[api/logs] Error', e && e.message);
      res.status(500).json({ ok:false, error: e && e.message });
    }
  });

  // broadcastLog: enviar un mensaje a todos los SSE conectados
  function broadcastLog(entry) {
    const it = Array.from(sseClients);
    for (const res of it) {
      try { sseSend(res, entry); } catch (e) { try { res.end(); } catch(_){} sseClients.delete(res); }
    }
  }

  // Exponer utilidades para que el resto del servidor pueda loguear en vivo
  return {
    broadcastLog,
    LOG_FILE,
    LOGS_DIR
  };
}