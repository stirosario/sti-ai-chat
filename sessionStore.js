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

// Log de conexión
if (redis) {
  redis.on('connect', () => console.log('[Redis] ✅ Connected'));
  redis.on('error', (err) => console.error('[Redis] ❌ Error:', err.message));
} else {
  console.warn('[Redis] ⚠️ REDIS_URL not set - sessions won\'t persist');
}

// TTL: 48 horas (se resetea en cada interacción)
const SESSION_TTL = 48 * 60 * 60;

/**
 * Obtener sesión desde Redis
 */
export async function getSession(sessionId) {
  if (!redis) {
    console.warn('[getSession] Redis not available');
    return null;
  }
  
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
    console.error('[getSession] Error:', e.message);
    return null;
  }
}

/**
 * Guardar sesión en Redis con TTL
 */
export async function saveSession(sessionId, data) {
  if (!redis) {
    console.warn('[saveSession] Redis not available');
    return false;
  }
  
  try {
    // Actualizar timestamp
    data.lastActivity = new Date().toISOString();
    
    // Guardar con expiración
    await redis.setex(
      `session:${sessionId}`, 
      SESSION_TTL, 
      JSON.stringify(data)
    );
    
    console.log(`[saveSession] ✅ Saved ${sessionId}:`, {
      userName: data.userName,
      device: data.device,
      stage: data.stage,
      transcriptLength: data.transcript?.length || 0
    });
    return true;
  } catch (e) {
    console.error('[saveSession] Error:', e.message);
    return false;
  }
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