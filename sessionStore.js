// sessionStore.js - Persistencia con Redis para STI Chat
import Redis from 'ioredis';

// Conectar a Redis (usa variable de entorno REDIS_URL)
const redis = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Retry ${times}, delay ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        console.error('[Redis] Connection error:', err.message);
        return true;
      }
    })
  : null;

// Fallback a memoria cuando no hay Redis
const memoryStore = new Map();

// Log de conexión
if (redis) {
  redis.on('connect', () => console.log('[Redis] ✅ Connected'));
  redis.on('error', (err) => console.error('[Redis] ❌ Error:', err.message));
} else {
  console.warn('[Redis] ⚠️ REDIS_URL not set - using in-memory store (sessions will be lost on restart)');
}

// TTL: 48 horas (se resetea en cada interacción)
const SESSION_TTL = 48 * 60 * 60;

/**
 * Obtener sesión desde Redis o memoria
 */
export async function getSession(sessionId) {
  // Intentar Redis primero
  if (redis) {
    try {
      const data = await redis.get(`session:${sessionId}`);
      if (!data) {
        console.log(`[getSession] No session found for ${sessionId}`);
        return null;
      }
      
      const session = JSON.parse(data);
      console.log(`[getSession] ✅ Loaded ${sessionId}:`, {
        userName: session.userName,
        device: session.device,
        stage: session.stage,
        stepsDone: session.stepsDone?.length || 0
      });
      return session;
    } catch (e) {
      console.error('[getSession] Redis error:', e.message);
      // Fall through to memory store
    }
  }
  
  // Usar memoria como fallback
  const session = memoryStore.get(sessionId);
  if (session) {
    console.log(`[getSession] ✅ Loaded from memory ${sessionId}:`, {
      userName: session.userName,
      stage: session.stage
    });
  } else {
    console.log(`[getSession] No session in memory for ${sessionId}`);
  }
  return session || null;
}

/**
 * Guardar sesión en Redis o memoria con TTL
 */
export async function saveSession(sessionId, data) {
  // Actualizar timestamp
  data.lastActivity = new Date().toISOString();
  
  // Intentar Redis primero
  if (redis) {
    try {
      await redis.setex(
        `session:${sessionId}`, 
        SESSION_TTL, 
        JSON.stringify(data)
      );
      
      console.log(`[saveSession] ✅ Saved to Redis ${sessionId}:`, {
        userName: data.userName,
        device: data.device,
        stage: data.stage,
        transcriptLength: data.transcript?.length || 0
      });
      return true;
    } catch (e) {
      console.error('[saveSession] Redis error:', e.message);
      // Fall through to memory store
    }
  }
  
  // Guardar en memoria como fallback
  memoryStore.set(sessionId, data);
  console.log(`[saveSession] ✅ Saved to memory ${sessionId}:`, {
    userName: data.userName,
    stage: data.stage,
    transcriptLength: data.transcript?.length || 0
  });
  return true;
}

/**
 * Eliminar sesión (útil para reset/debug)
 */
export async function deleteSession(sessionId) {
  if (!redis) return false;
  
  try {
    await redis.del(`session:${sessionId}`);
    console.log(`[deleteSession] ✅ Deleted ${sessionId}`);
    return true;
  } catch (e) {
    console.error('[deleteSession] Error:', e.message);
    return false;
  }
}

/**
 * Listar todas las sesiones activas (útil para debug)
 */
export async function listActiveSessions() {
  if (!redis) return [];
  
  try {
    const keys = await redis.keys('session:*');
    console.log(`[listActiveSessions] Found ${keys.length} active sessions`);
    return keys.map(k => k.replace('session:', ''));
  } catch (e) {
    console.error('[listActiveSessions] Error:', e.message);
    return [];
  }
}

/**
 * Crear sesión vacía (estado inicial)
 */
export function createEmptySession(sessionId) {
  const session = {
    sessionId,
    userName: null,
    device: null,
    issueKey: null,
    stage: 'greeting',
    stepsDone: [],
    tests: {
      basic: [],
      advanced: []
    },
    waEligible: false,
    transcript: [],
    fallbackCount: 0,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  
  console.log(`[createEmptySession] ✨ Created new session ${sessionId}`);
  return session;
}

/**
 * Health check de Redis
 */
export async function healthCheck() {
  if (!redis) return { ok: false, error: 'Redis not configured' };
  
  try {
    await redis.ping();
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    return { 
      ok: true, 
      version,
      connected: redis.status === 'ready'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * T2: Dedup cross-request con Redis (idempotencia por clientEventId)
 * Retorna { isDuplicate: boolean } - true si el request ya fue procesado
 */
export async function checkDuplicateRequest(sessionId, clientEventId, ttlMs = 8000) {
  // Si no hay Redis, no podemos hacer dedup cross-request (fallback a dedup en memoria)
  if (!redis) {
    return { isDuplicate: false };
  }
  
  // Si no hay clientEventId, no podemos hacer dedup (fallback a hash)
  if (!clientEventId || typeof clientEventId !== 'string' || clientEventId.trim() === '') {
    return { isDuplicate: false };
  }
  
  try {
    const key = `dedup:chat:${sessionId}:${clientEventId}`;
    
    // SETNX: solo establece si no existe (retorna 1 si se estableció, 0 si ya existía)
    const result = await redis.set(key, '1', 'EX', Math.ceil(ttlMs / 1000), 'NX');
    
    if (result === 'OK' || result === 1) {
      // Se estableció la clave -> no es duplicado
      return { isDuplicate: false };
    } else {
      // La clave ya existía -> es duplicado
      console.log(`[DEDUP_REDIS] ⚠️ Request duplicado detectado: sid=${sessionId.substring(0, 20)}..., clientEventId=${clientEventId.substring(0, 20)}...`);
      return { isDuplicate: true };
    }
  } catch (e) {
    // Si Redis falla, no bloquear el request (fallback a dedup en memoria)
    console.error('[DEDUP_REDIS] Error:', e.message);
    return { isDuplicate: false };
  }
}