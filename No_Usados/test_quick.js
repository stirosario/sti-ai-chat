// Test rápido del flujo
async function test() {
  const baseURL = 'http://localhost:3004';
  
  console.log('1. Iniciando conversación...');
  const greetingRes = await fetch(`${baseURL}/api/greeting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3004'
    }
  });
  
  const greetingData = await greetingRes.json();
  console.log('Respuesta greeting:', JSON.stringify(greetingData, null, 2));
  
  const sessionId = greetingData.sessionId;
  const csrfToken = greetingData.csrfToken;
  
  console.log('\n2. Enviando nombre "lucia"...');
  const chatRes = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3004',
      'X-Session-Id': sessionId,
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      text: 'lucia',
      sessionId: sessionId
    })
  });
  
  const chatData = await chatRes.json();
  console.log('Respuesta chat:', JSON.stringify(chatData, null, 2));
}

test().catch(console.error);
