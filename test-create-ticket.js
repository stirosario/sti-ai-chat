/**
 * Script para crear un ticket de prueba en producción
 * Simula una conversación completa del usuario
 */

import axios from 'axios';

const API_BASE = 'https://sti-rosario-ai.onrender.com';
const SESSION_ID = `test-session-${Date.now()}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTestTicket() {
  console.log('🎫 Creando ticket de prueba en producción...\n');
  
  try {
    // PASO 1: Iniciar conversación (obtener CSRF token)
    console.log('1️⃣  Iniciando conversación...');
    const initResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'Hola',
      sessionId: SESSION_ID
    });
    
    const csrfToken = initResponse.data.csrfToken;
    console.log(`   ✅ Sesión iniciada: ${SESSION_ID}`);
    console.log(`   🔐 CSRF Token: ${csrfToken?.substring(0, 20)}...`);
    await sleep(1000);
    
    // PASO 2: Consentimiento GDPR
    console.log('\n2️⃣  Aceptando consentimiento GDPR...');
    const gdprResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'si',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ GDPR aceptado`);
    await sleep(1000);
    
    // PASO 3: Elegir idioma
    console.log('\n3️⃣  Seleccionando idioma español...');
    const langResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'español',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ Idioma configurado`);
    await sleep(1000);
    
    // PASO 4: Proporcionar nombre
    console.log('\n4️⃣  Proporcionando nombre...');
    const nameResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'Juan Pérez',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ Nombre registrado: Juan Pérez`);
    await sleep(1000);
    
    // PASO 5: Describir problema (trigger ticket flow)
    console.log('\n5️⃣  Reportando problema técnico...');
    const problemResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'problema wifi',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ Problema iniciado`);
    console.log(`   💬 Stage: ${problemResponse.data.stage}`);
    await sleep(2000);
    
    // PASO 6: Describir detalles
    console.log('\n6️⃣  Describiendo detalles del problema...');
    const detailsResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'Mi PC no se conecta al WiFi después de actualizar Windows 11. Ya reinicié el router pero no funciona.',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ Detalles proporcionados`);
    console.log(`   💬 Stage: ${detailsResponse.data.stage}`);
    await sleep(2000);
    
    // PASO 7: Confirmar dispositivo si pregunta
    console.log('\n7️⃣  Esperando siguiente paso...');
    const nextResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'PC',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   💬 Stage: ${nextResponse.data.stage}`);
    console.log(`   💬 Reply: ${nextResponse.data.reply?.substring(0, 150)}...`);
    await sleep(2000);
    
    // PASO 8: Proporcionar email
    console.log('\n8️⃣  Proporcionando email...');
    const emailResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'juan.test@stia.com',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   ✅ Email enviado`);
    console.log(`   💬 Stage: ${emailResponse.data.stage}`);
    await sleep(2000);
    
    // PASO 9: Aceptar WhatsApp
    console.log('\n9️⃣  Aceptando WhatsApp...');
    const whatsappResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'si',
      sessionId: SESSION_ID,
      csrfToken: csrfToken
    });
    console.log(`   💬 Stage: ${whatsappResponse.data.stage}`);
    
    // Verificar si hay ticketId en la respuesta
    if (whatsappResponse.data.ticketId || whatsappResponse.data.ticket) {
      console.log(`\n🎉 ¡TICKET CREADO EXITOSAMENTE!`);
      console.log(`   📋 ID: ${whatsappResponse.data.ticketId || whatsappResponse.data.ticket?.id}`);
      console.log(`   🔗 URL: ${whatsappResponse.data.publicUrl || 'N/A'}`);
      console.log(`   📱 WhatsApp: ${whatsappResponse.data.whatsappUrl ? 'Generado' : 'N/A'}`);
    } else {
      console.log(`\n⚠️  Estado actual:`);
      console.log(`   Stage: ${whatsappResponse.data.stage}`);
      console.log(`   Reply: ${whatsappResponse.data.reply}`);
      console.log(`\n   Respuesta completa:`);
      console.log(JSON.stringify(whatsappResponse.data, null, 2));
    }
    
    console.log(`\n✅ PROCESO COMPLETADO`);
    console.log(`\n🔍 Verifica el panel: https://stia.com.ar/tickets-admin.php`);
    
  } catch (error) {
    console.error('\n❌ Error al crear ticket:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Ejecutar
createTestTicket();
