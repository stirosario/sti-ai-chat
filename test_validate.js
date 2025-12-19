// Test de validateSessionId
import crypto from 'crypto';

function validateSessionId(sid) {
  if (!sid || typeof sid !== 'string') {
    console.log(`[validateSessionId] REJECT: not string or empty`);
    return false;
  }
  
  if (sid.length !== 82) {
    console.log(`[validateSessionId] REJECT: length ${sid.length} (expected 82)`);
    return false;
  }
  
  const sessionIdRegex = /^srv-\d{13}-[a-f0-9]{64}$/;
  if (!sessionIdRegex.test(sid)) {
    console.log(`[validateSessionId] REJECT: format mismatch`);
    return false;
  }
  
  const timestamp = parseInt(sid.substring(4, 17));
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000;
  if (timestamp > now || timestamp < (now - maxAge)) {
    console.log(`[validateSessionId] REJECT: timestamp out of range (ts=${timestamp}, now=${now})`);
    return false;
  }
  
  console.log(`[validateSessionId] ACCEPT: ${sid.substring(0,20)}...`);
  return true;
}

// Test con un sessionId real de los tests
const sid1 = 'srv-1763937411356-6b548a3e746bbc134b1a2005c44be261c2633bad4eed499b09e2d0599ebf1e97';
console.log('\nTest 1 - SessionId real del test:');
console.log('Longitud:', sid1.length);
console.log('Válido:', validateSessionId(sid1));

// Test generando nuevo sessionId
const ts = Date.now();
const hash = crypto.createHash('sha256').update(`${ts}-${Math.random()}`).digest('hex');
const sid2 = `srv-${ts}-${hash}`;
console.log('\nTest 2 - SessionId recién generado:');
console.log('Longitud:', sid2.length);
console.log('Válido:', validateSessionId(sid2));

// Test con sessionId antiguo (hace 25 horas)
const oldTs = Date.now() - (25 * 60 * 60 * 1000);
const oldHash = crypto.createHash('sha256').update(`${oldTs}-old`).digest('hex');
const sid3 = `srv-${oldTs}-${oldHash}`;
console.log('\nTest 3 - SessionId de hace 25 horas:');
console.log('Longitud:', sid3.length);
console.log('Válido:', validateSessionId(sid3));

// Test con sessionId de hace 50 horas (debería fallar)
const veryOldTs = Date.now() - (50 * 60 * 60 * 1000);
const veryOldHash = crypto.createHash('sha256').update(`${veryOldTs}-veryold`).digest('hex');
const sid4 = `srv-${veryOldTs}-${veryOldHash}`;
console.log('\nTest 4 - SessionId de hace 50 horas (should reject):');
console.log('Longitud:', sid4.length);
console.log('Válido:', validateSessionId(sid4));
