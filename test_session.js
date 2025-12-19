// Test simple para verificar sessionStore
import { getSession, saveSession } from './sessionStore.js';

async function test() {
  const sid = 'srv-1763937411356-6b548a3e746bbc134b1a2005c44be261c2633bad4eed499b09e2d0599ebf1e97';
  
  console.log('1. Guardando sesión...');
  const testData = {
    id: sid,
    userName: 'TestUser',
    stage: 'ASK_NAME',
    transcript: []
  };
  
  await saveSession(sid, testData);
  
  console.log('2. Recuperando sesión...');
  const recovered = await getSession(sid);
  
  if (recovered) {
    console.log('✅ Sesión recuperada:', {
      userName: recovered.userName,
      stage: recovered.stage
    });
  } else {
    console.log('❌ No se pudo recuperar la sesión');
  }
  
  console.log('3. Intentando recuperar sesión inexistente...');
  const notFound = await getSession('srv-9999999999999-0000000000000000000000000000000000000000000000000000000000000000');
  console.log('Resultado:', notFound ? 'ENCONTRADA (ERROR!)' : 'null (correcto)');
}

test().catch(console.error);
