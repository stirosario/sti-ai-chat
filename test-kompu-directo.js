/**
 * test-kompu-directo.js
 * Test simplificado para verificar detección de "kompu" en producción
 */

const API_BASE = 'https://sti-rosario-ai.onrender.com';

async function testKompuDirect() {
  console.log('🔬 TEST DIRECTO: Verificar si deviceDetection funciona en producción\n');
  
  try {
    // 1. Obtener session
    const greetResponse = await fetch(`${API_BASE}/api/greeting`);
    const greetData = await greetResponse.json();
    const sessionId = greetData.sessionId;
    const csrfToken = greetData.csrfToken;
    
    console.log(`✅ Session obtenida: ${sessionId.substring(0, 20)}...\n`);
    
    // 2. Aceptar GDPR
    await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        action: 'button',
        value: 'si',
        label: 'Sí',
        sessionId, csrfToken
      })
    });
    
    // 3. Seleccionar idioma
    await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        action: 'button',
        value: 'español',
        label: '🇦🇷 Español',
        sessionId, csrfToken
      })
    });
    
    // 4. Dar nombre (lo más corto posible para evitar que lo interprete como problema)
    await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        text: 'Ana',
        sessionId, csrfToken
      })
    });
    
    // 5. Click botón "Problema"
    const problemBtnResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        action: 'button',
        value: 'BTN_PROBLEMA',
        label: 'Solucionar / Diagnosticar Problema',
        sessionId, csrfToken
      })
    });
    
    const problemBtnData = await problemBtnResponse.json();
    console.log(`✅ Botón Problema clickeado, stage: ${problemBtnData.stage}\n`);
    
    // 6. AHORA enviar "la kompu no prende"
    console.log('🎯 Enviando texto crítico: "la kompu no prende"...\n');
    
    const finalResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({
        text: 'la kompu no prende',
        sessionId, csrfToken
      })
    });
    
    const finalData = await finalResponse.json();
    
    console.log('📊 ANÁLISIS DE RESPUESTA:');
    console.log('='.repeat(60));
    console.log(`✅ ok: ${finalData.ok}`);
    console.log(`📝 stage: ${finalData.stage}`);
    console.log(`💬 reply (primeros 100 chars): ${finalData.reply?.substring(0, 100)}`);
    console.log(`🎯 buttons existe: ${finalData.buttons ? '✅ SÍ' : '❌ NO'}`);
    console.log(`🎯 options existe: ${finalData.options ? '✅ SÍ' : '❌ NO'}`);
    console.log(`🎯 disambiguation: ${finalData.disambiguation ? '✅ TRUE' : '❌ FALSE'}`);
    
    if (finalData.buttons && finalData.buttons.length > 0) {
      console.log(`\n✅ ¡ÉXITO! Detectó dispositivo y envió ${finalData.buttons.length} botones:`);
      finalData.buttons.forEach((btn, i) => {
        console.log(`   ${i + 1}. ${btn.icon || ''} ${btn.label || btn.text}`);
      });
    } else if (finalData.reply.includes('Disculpa') || finalData.reply.includes('Sorry')) {
      console.log(`\n❌ FALLO: OpenAI rechazó como no informática`);
      console.log(`   Esto significa que detectAmbiguousDevice() NO funcionó`);
    } else {
      console.log(`\n⚠️  Respuesta inesperada`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📄 RESPUESTA COMPLETA:');
    console.log(JSON.stringify(finalData, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testKompuDirect();
