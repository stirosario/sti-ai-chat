/**
 * simulacros_flujo_chat.js
 * Simulacros lógicos para detectar problemas en el flujo del chat
 * 
 * Este script simula 5 escenarios diferentes del flujo conversacional
 * para identificar posibles problemas, inconsistencias o errores.
 */

import { STATES } from './handlers/stateMachine.js';

/**
 * Simulador de flujo de conversación
 */
class ChatFlowSimulator {
  constructor() {
    this.session = {
      id: 'test-session',
      userName: null,
      userLocale: 'es-AR',
      stage: null,
      device: null,
      deviceLabel: null,
      problem: null,
      tests: { basic: [], advanced: [] },
      stepProgress: {},
      transcript: [],
      ticketId: null,
      waEligible: false
    };
    this.errors = [];
    this.warnings = [];
    this.log = [];
  }

  log(message, type = 'INFO') {
    const entry = `[${type}] ${message}`;
    this.log.push(entry);
    console.log(entry);
  }

  error(message) {
    this.errors.push(message);
    this.log(message, 'ERROR');
  }

  warning(message) {
    this.warnings.push(message);
    this.log(message, 'WARNING');
  }

  transition(fromStage, toStage, action) {
    this.log(`Transición: ${fromStage} → ${toStage} (acción: ${action})`);
    
    if (this.session.stage !== fromStage) {
      this.error(`❌ Estado esperado: ${fromStage}, pero actual es: ${this.session.stage}`);
      return false;
    }
    
    this.session.stage = toStage;
    return true;
  }

  checkRequiredData(stage, requiredFields) {
    const missing = [];
    for (const field of requiredFields) {
      if (!this.session[field] && !this.session[`${field}Label`]) {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      this.warning(`⚠️ En stage ${stage}, faltan campos requeridos: ${missing.join(', ')}`);
      return false;
    }
    return true;
  }

  addMessage(who, text) {
    this.session.transcript.push({
      who,
      text,
      ts: new Date().toISOString(),
      stage: this.session.stage
    });
  }

  getResults() {
    return {
      errors: this.errors,
      warnings: this.warnings,
      log: this.log,
      finalState: this.session.stage,
      session: this.session
    };
  }
}

/**
 * SIMULACRO 1: Flujo Completo Exitoso
 * Usuario completa todos los pasos y resuelve el problema
 */
function simulacro1_FlujoCompletoExitoso() {
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACRO 1: Flujo Completo Exitoso');
  console.log('='.repeat(80));
  
  const sim = new ChatFlowSimulator();
  
  // 1. Inicio - Selección de idioma
  sim.session.stage = STATES.ASK_LANGUAGE;
  sim.addMessage('bot', 'Selecciona tu idioma / Select your language');
  sim.addMessage('user', 'Español');
  if (!sim.transition(STATES.ASK_LANGUAGE, STATES.ASK_NAME, 'selección idioma')) {
    return sim.getResults();
  }
  sim.session.userLocale = 'es-AR';
  
  // 2. Pregunta nombre
  sim.addMessage('bot', '¿Con quién tengo el gusto de hablar?');
  sim.addMessage('user', 'Me llamo Juan');
  if (!sim.transition(STATES.ASK_NAME, STATES.ASK_NEED, 'nombre proporcionado')) {
    return sim.getResults();
  }
  sim.session.userName = 'Juan';
  
  // 3. Pregunta necesidad
  sim.addMessage('bot', '¿En qué puedo ayudarte?');
  sim.addMessage('user', 'Tengo un problema');
  if (!sim.transition(STATES.ASK_NEED, STATES.ASK_DEVICE, 'problema reportado')) {
    return sim.getResults();
  }
  sim.session.needType = 'problema';
  
  // 4. Pregunta dispositivo
  sim.addMessage('bot', '¿Qué dispositivo tenés?');
  sim.addMessage('user', 'Mi notebook no enciende');
  if (!sim.transition(STATES.ASK_DEVICE, STATES.ASK_PROBLEM, 'dispositivo detectado')) {
    return sim.getResults();
  }
  sim.session.device = 'notebook';
  sim.session.deviceLabel = 'notebook';
  
  // Verificar que el problema se extrajo del mensaje
  if (!sim.session.problem || !sim.session.problem.includes('no enciende')) {
    sim.warning('⚠️ El problema debería haberse extraído del mensaje "Mi notebook no enciende"');
  } else {
    sim.log('✅ Problema extraído correctamente del mensaje');
  }
  
  // 5. Si ya hay problema, debería ir directo a BASIC_TESTS
  if (sim.session.problem) {
    if (!sim.transition(STATES.ASK_PROBLEM, STATES.BASIC_TESTS, 'problema ya conocido')) {
      return sim.getResults();
    }
    sim.log('✅ Transición directa a BASIC_TESTS porque problema ya está definido');
  } else {
    // Si no hay problema, preguntar
    sim.addMessage('bot', '¿Qué problema tenés?');
    sim.addMessage('user', 'No enciende');
    sim.session.problem = 'No enciende';
    if (!sim.transition(STATES.ASK_PROBLEM, STATES.BASIC_TESTS, 'problema proporcionado')) {
      return sim.getResults();
    }
  }
  
  // 6. BASIC_TESTS - Generar pasos
  sim.session.tests.basic = [
    'Verificar que el cable de alimentación esté conectado',
    'Presionar el botón de encendido durante 5 segundos',
    'Verificar que la batería tenga carga'
  ];
  sim.session.stepProgress = {
    'basic_1': 'pending',
    'basic_2': 'pending',
    'basic_3': 'pending'
  };
  sim.addMessage('bot', 'Pasos de diagnóstico...');
  
  // 7. Usuario completa pasos y dice que lo solucionó
  sim.addMessage('user', 'Lo pude solucionar');
  if (!sim.transition(STATES.BASIC_TESTS, STATES.ENDED, 'problema resuelto')) {
    return sim.getResults();
  }
  
  // Verificaciones finales
  sim.checkRequiredData(STATES.ENDED, ['userName', 'device', 'problem']);
  
  if (sim.session.ticketId) {
    sim.warning('⚠️ No debería haber ticket si el problema se resolvió');
  }
  
  sim.log('✅ Simulacro 1 completado');
  return sim.getResults();
}

/**
 * SIMULACRO 2: Flujo con Pruebas Avanzadas
 * Usuario no resuelve con pasos básicos y necesita pruebas avanzadas
 */
function simulacro2_FlujoConPruebasAvanzadas() {
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACRO 2: Flujo con Pruebas Avanzadas');
  console.log('='.repeat(80));
  
  const sim = new ChatFlowSimulator();
  
  // Inicio rápido (asumiendo que ya pasó por ASK_LANGUAGE, ASK_NAME, ASK_NEED)
  sim.session.stage = STATES.ASK_DEVICE;
  sim.session.userName = 'María';
  sim.session.userLocale = 'es-AR';
  sim.session.needType = 'problema';
  
  // Dispositivo y problema en un solo mensaje
  sim.addMessage('user', 'Mi PC de escritorio no prende');
  sim.session.device = 'desktop';
  sim.session.deviceLabel = 'PC de escritorio';
  sim.session.problem = 'no prende';
  
  // Debería ir directo a BASIC_TESTS
  if (!sim.transition(STATES.ASK_DEVICE, STATES.BASIC_TESTS, 'dispositivo y problema detectados')) {
    return sim.getResults();
  }
  
  // BASIC_TESTS
  sim.session.tests.basic = [
    'Verificar conexión eléctrica',
    'Revisar fuente de alimentación',
    'Probar con otro cable'
  ];
  sim.addMessage('bot', 'Pasos básicos...');
  
  // Usuario dice que el problema persiste
  sim.addMessage('user', 'El problema persiste');
  if (!sim.transition(STATES.BASIC_TESTS, STATES.ESCALATE, 'problema persiste')) {
    return sim.getResults();
  }
  
  // ESCALATE - Usuario pide pruebas avanzadas
  sim.addMessage('bot', 'Opciones: Pruebas avanzadas o conectar con técnico');
  sim.addMessage('user', 'Pruebas avanzadas');
  if (!sim.transition(STATES.ESCALATE, STATES.ADVANCED_TESTS, 'solicitud pruebas avanzadas')) {
    return sim.getResults();
  }
  
  // ADVANCED_TESTS
  sim.session.tests.advanced = [
    'Verificar componentes internos',
    'Probar con otra fuente',
    'Revisar placa madre'
  ];
  sim.addMessage('bot', 'Pasos avanzados...');
  
  // Verificar que hay botones disponibles
  if (!sim.session.tests.advanced || sim.session.tests.advanced.length === 0) {
    sim.error('❌ No se generaron pruebas avanzadas');
  }
  
  // Usuario completa y resuelve
  sim.addMessage('user', 'Lo pude solucionar');
  if (!sim.transition(STATES.ADVANCED_TESTS, STATES.ENDED, 'problema resuelto')) {
    return sim.getResults();
  }
  
  sim.log('✅ Simulacro 2 completado');
  return sim.getResults();
}

/**
 * SIMULACRO 3: Flujo con Escalación a Técnico
 * Usuario no resuelve y necesita conectar con técnico
 */
function simulacro3_FlujoConEscalacion() {
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACRO 3: Flujo con Escalación a Técnico');
  console.log('='.repeat(80));
  
  const sim = new ChatFlowSimulator();
  
  // Setup inicial
  sim.session.stage = STATES.BASIC_TESTS;
  sim.session.userName = 'Carlos';
  sim.session.userLocale = 'es-AR';
  sim.session.device = 'all-in-one';
  sim.session.deviceLabel = 'All in one';
  sim.session.problem = 'pantalla negra';
  sim.session.tests.basic = ['Paso 1', 'Paso 2', 'Paso 3'];
  
  // Usuario dice que persiste
  sim.addMessage('user', 'El problema persiste');
  if (!sim.transition(STATES.BASIC_TESTS, STATES.ESCALATE, 'problema persiste')) {
    return sim.getResults();
  }
  
  // ESCALATE - Usuario pide conectar con técnico directamente
  sim.addMessage('bot', 'Opciones disponibles...');
  sim.addMessage('user', 'Conectar con técnico');
  if (!sim.transition(STATES.ESCALATE, STATES.CREATE_TICKET, 'solicitud técnico')) {
    return sim.getResults();
  }
  
  // CREATE_TICKET
  // Verificar que hay información suficiente para crear ticket
  if (!sim.checkRequiredData(STATES.CREATE_TICKET, ['userName', 'device', 'problem'])) {
    sim.error('❌ Faltan datos requeridos para crear ticket');
  }
  
  // Simular creación de ticket
  sim.session.ticketId = 'TCK-20250115-ABC123';
  if (!sim.transition(STATES.CREATE_TICKET, STATES.TICKET_SENT, 'ticket creado')) {
    return sim.getResults();
  }
  
  // Verificar que hay botón de WhatsApp
  if (!sim.session.waEligible) {
    sim.warning('⚠️ waEligible debería ser true después de crear ticket');
  }
  
  // Verificar que el ticket se guardó
  if (!sim.session.ticketId) {
    sim.error('❌ No se generó ticket ID');
  }
  
  sim.log('✅ Simulacro 3 completado');
  return sim.getResults();
}

/**
 * SIMULACRO 4: Flujo con Dispositivo Ambiguo
 * Usuario menciona dispositivo de forma ambigua y necesita aclaración
 */
function simulacro4_DispositivoAmbiguo() {
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACRO 4: Flujo con Dispositivo Ambiguo');
  console.log('='.repeat(80));
  
  const sim = new ChatFlowSimulator();
  
  // Setup inicial
  sim.session.stage = STATES.ASK_NEED;
  sim.session.userName = 'Ana';
  sim.session.userLocale = 'es-AR';
  sim.session.needType = 'problema';
  
  // Usuario menciona problema con dispositivo ambiguo
  sim.addMessage('user', 'Mi compu no enciende');
  sim.session.problem = 'no enciende'; // Problema extraído
  
  // Debería detectar dispositivo ambiguo y preguntar
  if (!sim.transition(STATES.ASK_NEED, STATES.DETECT_DEVICE, 'dispositivo ambiguo detectado')) {
    return sim.getResults();
  }
  
  // Verificar que el problema se guardó aunque el dispositivo sea ambiguo
  if (!sim.session.problem) {
    sim.error('❌ El problema debería haberse guardado aunque el dispositivo sea ambiguo');
  } else {
    sim.log('✅ Problema guardado correctamente antes de aclarar dispositivo');
  }
  
  // Bot pregunta por aclaración
  sim.addMessage('bot', 'Cuando me decís compu, ¿es una PC de escritorio, una notebook o una all-in-one?');
  
  // Usuario selecciona dispositivo
  sim.addMessage('user', 'PC de escritorio');
  sim.session.device = 'desktop';
  sim.session.deviceLabel = 'PC de escritorio';
  
  // Debería ir a ASK_PROBLEM, pero como ya hay problema, debería ir directo a BASIC_TESTS
  if (sim.session.problem) {
    if (!sim.transition(STATES.DETECT_DEVICE, STATES.BASIC_TESTS, 'dispositivo aclarado y problema ya existe')) {
      return sim.getResults();
    }
    sim.log('✅ Transición directa a BASIC_TESTS porque problema ya estaba definido');
  } else {
    if (!sim.transition(STATES.DETECT_DEVICE, STATES.ASK_PROBLEM, 'dispositivo aclarado')) {
      return sim.getResults();
    }
  }
  
  // Verificar que no se perdió el problema
  if (!sim.session.problem) {
    sim.error('❌ El problema se perdió durante la aclaración del dispositivo');
  }
  
  sim.log('✅ Simulacro 4 completado');
  return sim.getResults();
}

/**
 * SIMULACRO 5: Flujo con Cambio de Tema y Navegación
 * Usuario cambia de tema y usa navegación conversacional
 */
function simulacro5_CambioTemaYNavegacion() {
  console.log('\n' + '='.repeat(80));
  console.log('SIMULACRO 5: Flujo con Cambio de Tema y Navegación');
  console.log('='.repeat(80));
  
  const sim = new ChatFlowSimulator();
  
  // Setup - Usuario en medio de diagnóstico
  sim.session.stage = STATES.BASIC_TESTS;
  sim.session.userName = 'Roberto';
  sim.session.userLocale = 'es-AR';
  sim.session.device = 'notebook';
  sim.session.deviceLabel = 'notebook';
  sim.session.problem = 'lento';
  sim.session.tests.basic = ['Paso 1', 'Paso 2'];
  sim.session.stepProgress = { 'basic_1': 'completed', 'basic_2': 'pending' };
  
  // Usuario quiere cambiar de tema
  sim.addMessage('user', 'Cambiar de tema');
  
  // Verificar que se puede cambiar de tema
  // En un sistema real, esto debería guardar el contexto actual
  if (!sim.session.problem || !sim.session.device) {
    sim.error('❌ No hay contexto para guardar antes de cambiar de tema');
  }
  
  // Simular cambio de tema - volver a ASK_NEED
  // Nota: En el sistema real, esto debería guardar el "punto de conversación"
  sim.session.conversationPoints = sim.session.conversationPoints || [];
  sim.session.conversationPoints.push({
    stage: STATES.BASIC_TESTS,
    problem: sim.session.problem,
    device: sim.session.device,
    timestamp: new Date().toISOString()
  });
  
  if (!sim.transition(STATES.BASIC_TESTS, STATES.ASK_NEED, 'cambio de tema')) {
    return sim.getResults();
  }
  
  // Nuevo problema
  sim.addMessage('user', 'Quiero instalar un programa');
  sim.session.needType = 'instalacion';
  
  // Verificar que el problema anterior se guardó en conversationPoints
  if (!sim.session.conversationPoints || sim.session.conversationPoints.length === 0) {
    sim.warning('⚠️ No se guardaron puntos de conversación anteriores');
  }
  
  // Usuario quiere volver atrás
  sim.addMessage('user', 'Volver atrás');
  
  // Debería restaurar el contexto anterior
  if (sim.session.conversationPoints && sim.session.conversationPoints.length > 0) {
    const previousPoint = sim.session.conversationPoints[sim.session.conversationPoints.length - 1];
    sim.session.stage = previousPoint.stage;
    sim.session.problem = previousPoint.problem;
    sim.session.device = previousPoint.device;
    sim.log('✅ Contexto anterior restaurado');
  } else {
    sim.error('❌ No se pudo restaurar contexto anterior - no hay conversationPoints');
  }
  
  // Verificar que se restauró correctamente
  if (sim.session.stage !== STATES.BASIC_TESTS) {
    sim.error(`❌ Stage no se restauró correctamente. Esperado: ${STATES.BASIC_TESTS}, Actual: ${sim.session.stage}`);
  }
  
  if (sim.session.problem !== 'lento') {
    sim.error(`❌ Problema no se restauró correctamente. Esperado: "lento", Actual: "${sim.session.problem}"`);
  }
  
  sim.log('✅ Simulacro 5 completado');
  return sim.getResults();
}

/**
 * Ejecutar todos los simulacros
 */
async function ejecutarSimulacros() {
  console.log('\n' + '='.repeat(80));
  console.log('INICIANDO SIMULACROS LÓGICOS DEL FLUJO DE CHAT');
  console.log('='.repeat(80));
  
  const resultados = [];
  
  // Ejecutar simulacros
  resultados.push({
    nombre: 'Simulacro 1: Flujo Completo Exitoso',
    resultado: simulacro1_FlujoCompletoExitoso()
  });
  
  resultados.push({
    nombre: 'Simulacro 2: Flujo con Pruebas Avanzadas',
    resultado: simulacro2_FlujoConPruebasAvanzadas()
  });
  
  resultados.push({
    nombre: 'Simulacro 3: Flujo con Escalación',
    resultado: simulacro3_FlujoConEscalacion()
  });
  
  resultados.push({
    nombre: 'Simulacro 4: Dispositivo Ambiguo',
    resultado: simulacro4_DispositivoAmbiguo()
  });
  
  resultados.push({
    nombre: 'Simulacro 5: Cambio de Tema y Navegación',
    resultado: simulacro5_CambioTemaYNavegacion()
  });
  
  // Resumen
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN DE SIMULACROS');
  console.log('='.repeat(80));
  
  let totalErrores = 0;
  let totalWarnings = 0;
  
  resultados.forEach((sim, index) => {
    const num = index + 1;
    const errores = sim.resultado.errors.length;
    const warnings = sim.resultado.warnings.length;
    totalErrores += errores;
    totalWarnings += warnings;
    
    console.log(`\n${num}. ${sim.nombre}`);
    console.log(`   Estado final: ${sim.resultado.finalState}`);
    console.log(`   Errores: ${errores}`);
    console.log(`   Advertencias: ${warnings}`);
    
    if (errores > 0) {
      console.log(`   ❌ ERRORES ENCONTRADOS:`);
      sim.resultado.errors.forEach(err => console.log(`      - ${err}`));
    }
    
    if (warnings > 0) {
      console.log(`   ⚠️ ADVERTENCIAS:`);
      sim.resultado.warnings.forEach(warn => console.log(`      - ${warn}`));
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN GENERAL');
  console.log('='.repeat(80));
  console.log(`Total de errores encontrados: ${totalErrores}`);
  console.log(`Total de advertencias: ${totalWarnings}`);
  
  if (totalErrores === 0 && totalWarnings === 0) {
    console.log('\n✅ Todos los simulacros pasaron sin errores ni advertencias');
  } else if (totalErrores === 0) {
    console.log('\n⚠️ Hay advertencias pero no errores críticos');
  } else {
    console.log('\n❌ Se encontraron errores que requieren atención');
  }
  
  return resultados;
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarSimulacros().then(() => {
    console.log('\n✅ Simulacros completados');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Error ejecutando simulacros:', err);
    process.exit(1);
  });
}

export {
  ejecutarSimulacros,
  simulacro1_FlujoCompletoExitoso,
  simulacro2_FlujoConPruebasAvanzadas,
  simulacro3_FlujoConEscalacion,
  simulacro4_DispositivoAmbiguo,
  simulacro5_CambioTemaYNavegacion
};

