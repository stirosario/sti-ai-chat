// ========================================================
// CHAT ENDPOINT CONVERSACIONAL
// Reemplazo completo del sistema de botones por IA conversacional
// ========================================================

export function setupConversationalChat(app, {
  chatLimiter,
  getSession,
  saveSession,
  nowIso,
  logFlowInteraction,
  updateMetric,
  analyzeUserIntent,
  generateConversationalResponse
}) {
  
  app.post('/api/chat-v2', chatLimiter, async (req, res) => {
    const startTime = Date.now();
    const sid = req.sessionId;
    
    console.log(`\n[${'='.repeat(70)}]`);
    console.log(`[CHAT-V2] 💬 Nueva conversación - Session: ${sid.substring(0, 25)}...`);
    
    try {
      // 1. OBTENER O CREAR SESIÓN
      let session = await getSession(sid);
      if (!session) {
        console.log('[CHAT-V2] 🆕 Creando nueva sesión conversacional');
        session = {
          id: sid,
          userName: null,
          stage: 'CONVERSATIONAL',
          conversationState: 'greeting',  // greeting, has_name, understanding_problem, solving, resolved
          device: null,
          problem: null,
          problemDescription: '',
          transcript: [],
          startedAt: nowIso(),
          userLocale: 'es-AR',
          contextWindow: [],  // Últimos 5 mensajes
          detectedEntities: {
            device: null,
            action: null,
            urgency: 'normal'
          },
          stepProgress: {
            current: 0,
            total: 0
          },
          metrics: {
            messages: 0,
            avgResponseTime: 0
          }
        };
      }
      
      // 2. EXTRAER MENSAJE
      const body = req.body || {};
      const userMessage = String(body.text || '').trim();
      
      if (!userMessage) {
        return res.json({
          ok: false,
          reply: 'No recibí ningún mensaje. ¿Podrías escribir de nuevo?'
        });
      }
      
      console.log(`[CHAT-V2] 👤 Usuario ${session.userName || 'Anónimo'}: "${userMessage}"`);
      console.log(`[CHAT-V2] 🎯 Estado: ${session.conversationState}`);
      
      // 3. AGREGAR A TRANSCRIPT
      session.transcript.push({
        who: 'user',
        text: userMessage,
        ts: nowIso()
      });
      
      // 4. MANTENER CONTEXTO
      session.contextWindow.push(userMessage);
      if (session.contextWindow.length > 5) {
        session.contextWindow.shift();
      }
      
      // 5. ANALIZAR INTENCIÓN (NLU - Natural Language Understanding)
      const analysis = analyzeUserIntent(userMessage, session);
      console.log(`[CHAT-V2] 🧠 Análisis:`, {
        intent: analysis.intent,
        device: analysis.entities.device,
        action: analysis.entities.action,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence
      });
      
      // 6. GENERAR RESPUESTA (NLG - Natural Language Generation)
      const response = generateConversationalResponse(analysis, session, userMessage);
      console.log(`[CHAT-V2] 🤖 Bot: "${response.reply.substring(0, 100)}..."`);
      
      // 7. AGREGAR RESPUESTA AL TRANSCRIPT
      session.transcript.push({
        who: 'bot',
        text: response.reply,
        ts: nowIso()
      });
      
      // 8. ACTUALIZAR MÉTRICAS
      session.metrics.messages++;
      const responseTime = Date.now() - startTime;
      session.metrics.avgResponseTime = 
        (session.metrics.avgResponseTime * (session.metrics.messages - 1) + responseTime) / session.metrics.messages;
      
      // 9. GUARDAR SESIÓN
      await saveSession(sid, session);
      
      // 10. LOG DE FLUJO
      logFlowInteraction({
        sessionId: sid,
        userName: session.userName || 'Anónimo',
        timestamp: nowIso(),
        currentStage: session.conversationState,
        userInput: userMessage,
        trigger: analysis.intent,
        botResponse: response.reply.substring(0, 100),
        nextStage: session.conversationState,
        serverAction: `conversational_${analysis.intent}`,
        duration: responseTime
      });
      
      // 11. MÉTRICAS GLOBALES
      updateMetric('chat', 'totalMessages', 1);
      updateMetric('chat', 'avgResponseTime', responseTime);
      if (session.userName) {
        updateMetric('chat', 'uniqueUsers', 1);
      }
      
      console.log(`[CHAT-V2] ⏱️  Tiempo: ${responseTime}ms | Mensajes sesión: ${session.metrics.messages}`);
      console.log(`[${'='.repeat(70)}]\n`);
      
      // 12. RESPONDER
      return res.json({
        ok: true,
        reply: response.reply,
        stage: session.stage,
        conversationState: session.conversationState,
        sessionId: sid,
        expectingInput: response.expectingInput !== false,
        metadata: {
          messageCount: session.metrics.messages,
          detectedDevice: session.detectedEntities.device,
          userName: session.userName
        }
      });
      
    } catch (error) {
      console.error('[CHAT-V2] ❌ ERROR:', error.message);
      console.error('[CHAT-V2] Stack:', error.stack);
      
      updateMetric('errors', 'count', 1);
      updateMetric('errors', 'lastError', error.message);
      
      return res.status(500).json({
        ok: false,
        reply: '😅 Disculpá, tuve un problema momentáneo. Probá escribirme de nuevo.',
        error: 'Internal server error'
      });
    }
  });
  
  console.log('[SETUP] ✅ Chat conversacional v2 configurado en /api/chat-v2');
}

export default setupConversationalChat;
