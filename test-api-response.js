/**
 * test-api-response.js
 * Script para probar respuesta real de API con "la kompu no prende"
 */

const API_BASE = 'https://sti-rosario-ai.onrender.com';

async function testGreetingAndKompu() {
  console.log('🚀 TEST: Respuesta API con "la kompu no prende"\n');
  
  try {
    // 1. Obtener greeting (session + csrf)
    console.log('📝 PASO 1: Obtener greeting...');
    const greetResponse = await fetch(`${API_BASE}/api/greeting`);
    const greetData = await greetResponse.json();
    
    const sessionId = greetData.sessionId;
    const csrfToken = greetData.csrfToken;
    
    console.log(`✅ Session ID: ${sessionId.substring(0, 30)}...`);
    console.log(`✅ CSRF Token: ${csrfToken.substring(0, 30)}...`);
    console.log(`✅ Greeting: ${JSON.stringify(greetData, null, 2)}\n`);
    
    // 2. Aceptar GDPR primero
    console.log('📝 PASO 2: Aceptar GDPR...');
    const gdprResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({
        action: 'button',
        value: 'si',
        label: 'Sí',
        sessionId: sessionId,
        csrfToken: csrfToken
      })
    });
    
    const gdprData = await gdprResponse.json();
    console.log(`📥 GDPR response: ${JSON.stringify(gdprData, null, 2)}\n`);
    
    // 3. Seleccionar idioma español
    console.log('📝 PASO 3: Seleccionar idioma español...');
    const langResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({
        action: 'button',
        value: 'español',
        label: '🇦🇷 Español',
        sessionId: sessionId,
        csrfToken: csrfToken
      })
    });
    
    const langData = await langResponse.json();
    console.log(`✅ Idioma seleccionado: ${langData.ok}\n`);
    
    // 4. Dar nombre
    console.log('📝 PASO 4: Enviar nombre "Lucas"...');
    const nameResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({
        text: 'Lucas',
        sessionId: sessionId,
        csrfToken: csrfToken
      })
    });
    
    const nameData = await nameResponse.json();
    console.log(`✅ Nombre registrado (stage: ${nameData.stage})\n`);
    
    // 5. Responder a ASK_NEED (debe haber botones o esperar "problema")
    console.log('📝 PASO 5: Verificar buttons en ASK_NEED...');
    console.log(`   Buttons: ${JSON.stringify(nameData.buttons)}\n`);
    
    // Si hay botón "Problema", hacer click
    if (nameData.buttons && nameData.buttons.length > 0) {
      const problemBtn = nameData.buttons.find(b => 
        b.value && (b.value.includes('PROBLEMA') || b.value.includes('BTN_PROBLEMA'))
      );
      
      if (problemBtn) {
        console.log(`📝 PASO 6: Click botón "${problemBtn.text || problemBtn.label}"...`);
        const needResponse = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId
          },
          body: JSON.stringify({
            action: 'button',
            value: problemBtn.value,
            label: problemBtn.text || problemBtn.label,
            sessionId: sessionId,
            csrfToken: csrfToken
          })
        });
        
        const needData = await needResponse.json();
        console.log(`✅ Need selected (stage: ${needData.stage})\n`);
      }
    }
    
    // 7. Ahora enviar "la kompu no prende" en ASK_PROBLEM
    console.log('📝 PASO 7: Enviar problema "la kompu no prende"...');
    const chatResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({
        text: 'la kompu no prende',
        sessionId: sessionId,
        csrfToken: csrfToken
      })
    });
    
    const chatData = await chatResponse.json();
    
    console.log('📥 RESPUESTA COMPLETA:');
    console.log(JSON.stringify(chatData, null, 2));
    
    console.log('\n🔍 ANÁLISIS DETALLADO:');
    console.log(`- ok: ${chatData.ok}`);
    console.log(`- stage: ${chatData.stage}`);
    console.log(`- reply (primeros 150 chars): ${chatData.reply?.substring(0, 150)}`);
    console.log(`- buttons: ${chatData.buttons ? `✅ ${chatData.buttons.length} botones` : '❌ NO EXISTE'}`);
    console.log(`- options: ${chatData.options ? `✅ ${chatData.options.length} opciones` : '❌ NO EXISTE'}`);
    console.log(`- disambiguation: ${chatData.disambiguation ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`- device: ${chatData.device || '(no especificado)'}`);
    console.log(`- problem: ${chatData.problem || '(no especificado)'}`);
    console.log(`- ui: ${chatData.ui ? '✅ EXISTE' : '❌ NO EXISTE'}`);
    
    if (chatData.buttons && chatData.buttons.length > 0) {
      console.log('\n📋 BOTONES RECIBIDOS:');
      chatData.buttons.forEach((btn, i) => {
        console.log(`  ${i + 1}. ${btn.icon || ''} ${btn.label || btn.text}`);
        console.log(`     id: ${btn.value || btn.id}`);
        if (btn.description) console.log(`     desc: ${btn.description}`);
      });
    }
    
    if (chatData.options && chatData.options.length > 0) {
      console.log('\n📋 OPTIONS RECIBIDOS:');
      chatData.options.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.icon || ''} ${opt.label || opt.text}`);
        console.log(`     id: ${opt.value || opt.id}`);
      });
    }
    
    console.log('\n✅ TEST COMPLETADO');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testGreetingAndKompu();
