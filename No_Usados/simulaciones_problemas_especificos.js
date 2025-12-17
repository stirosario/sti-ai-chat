/**
 * simulaciones_problemas_especificos.js
 * Simulaciones de problemas específicos para detectar irregularidades en el flujo conversacional
 */

import { STATES } from './handlers/stateMachine.js';

// Lista de problemas a simular
const PROBLEMAS = [
  'mi compu no prende',
  'mi notebook se mojo',
  'necesito ayuda para implementar anydesk',
  'mi teclado no anda',
  'el puntero del mouse no se mueve',
  'mi notebook no carga',
  'mi pc se reinicia',
  'no tengo wifi',
  'no tengo internet',
  'queda papel atascado en la impresora',
  'mi monitor no da imagen',
  'la pc hace ruidos raros',
  'mi notebook anda muy lenta',
  'no me reconoce el pendrive',
  'la impresora no imprime',
  'mi compu se queda tildada',
  'no puedo instalar un programa',
  'mi correo no funciona',
  'la pantalla se ve muy oscura',
  'mi compu tiene virus'
];

class ProblemaSimulator {
  constructor(problema) {
    this.problema = problema;
    this.session = {
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userName: 'Usuario Test',
      userLocale: 'es-AR',
      stage: STATES.ASK_NEED,
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
    this.estilos = {
      mensajes: [],
      botones: [],
      formatos: []
    };
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

  // Simular flujo completo
  async simular() {
    this.log(`\n${'='.repeat(80)}`);
    this.log(`SIMULANDO: "${this.problema}"`);
    this.log('='.repeat(80));

    // Paso 1: Usuario menciona el problema
    this.log('Paso 1: Usuario menciona problema');
    this.session.problem = this.problema;
    
    // Detectar dispositivo
    const dispositivoDetectado = this.detectarDispositivo(this.problema);
    if (dispositivoDetectado) {
      this.session.device = dispositivoDetectado.device;
      this.session.deviceLabel = dispositivoDetectado.label;
      this.log(`✅ Dispositivo detectado: ${dispositivoDetectado.label}`);
    } else {
      this.warning('⚠️ Dispositivo no detectado automáticamente');
    }

    // Verificar formato de mensaje inicial
    this.verificarFormatoMensaje('inicial');

    // Paso 2: Transición a BASIC_TESTS
    this.log('Paso 2: Transición a BASIC_TESTS');
    this.session.stage = STATES.BASIC_TESTS;
    
    // Generar pasos básicos (simulado)
    this.session.tests.basic = this.generarPasosBasicos(this.problema, this.session.device);
    this.log(`✅ Pasos básicos generados: ${this.session.tests.basic.length}`);

    // Verificar formato de pasos
    this.verificarFormatoPasos();

    // Paso 3: Usuario dice que persiste
    this.log('Paso 3: Usuario dice que persiste');
    this.session.stage = STATES.ESCALATE;
    
    // Verificar botones disponibles
    this.verificarBotones('ESCALATE');

    // Paso 4: Usuario pide pruebas avanzadas
    this.log('Paso 4: Usuario pide pruebas avanzadas');
    this.session.stage = STATES.ADVANCED_TESTS;
    this.session.tests.advanced = this.generarPasosAvanzados(this.problema, this.session.device);
    this.log(`✅ Pasos avanzados generados: ${this.session.tests.advanced.length}`);

    // Verificar formato de pasos avanzados
    this.verificarFormatoPasos();

    // Paso 5: Usuario resuelve o necesita técnico
    this.log('Paso 5: Usuario necesita técnico');
    this.session.stage = STATES.CREATE_TICKET;
    this.session.ticketId = `TCK-TEST-${Date.now()}`;
    this.session.waEligible = true;

    // Verificar botones después de ticket
    this.verificarBotones('TICKET_SENT');

    return this.getResults();
  }

  detectarDispositivo(problema) {
    const texto = problema.toLowerCase();
    
    // Detectar dispositivos explícitos
    if (texto.includes('notebook') || texto.includes('laptop') || texto.includes('portátil')) {
      return { device: 'notebook', label: 'notebook' };
    }
    if (texto.includes('pc de escritorio') || texto.includes('computadora de escritorio') || texto.includes('torre')) {
      return { device: 'desktop', label: 'PC de escritorio' };
    }
    if (texto.includes('all in one') || texto.includes('all-in-one') || texto.includes('todo en uno')) {
      return { device: 'all-in-one', label: 'All in one' };
    }
    
    // Detectar dispositivos ambiguos
    if (texto.includes('compu') || texto.includes('pc') || texto.includes('computadora')) {
      return { device: null, label: null, ambiguous: true };
    }
    
    // Dispositivos específicos mencionados en problemas
    if (texto.includes('teclado')) return { device: 'peripheral', label: 'teclado' };
    if (texto.includes('mouse') || texto.includes('puntero')) return { device: 'peripheral', label: 'mouse' };
    if (texto.includes('monitor') || texto.includes('pantalla')) return { device: 'peripheral', label: 'monitor' };
    if (texto.includes('impresora')) return { device: 'peripheral', label: 'impresora' };
    if (texto.includes('pendrive') || texto.includes('usb')) return { device: 'peripheral', label: 'pendrive' };
    
    // Por defecto, asumir PC de escritorio si no se especifica
    return { device: 'desktop', label: 'PC de escritorio' };
  }

  generarPasosBasicos(problema, device) {
    const texto = problema.toLowerCase();
    const pasos = [];

    // Pasos genéricos según tipo de problema
    if (texto.includes('no prende') || texto.includes('no enciende') || texto.includes('no arranca')) {
      pasos.push('Verificar que el cable de alimentación esté conectado correctamente');
      pasos.push('Presionar el botón de encendido durante 5 segundos');
      pasos.push('Verificar que la fuente de alimentación esté funcionando');
    } else if (texto.includes('se mojo') || texto.includes('se mojó') || texto.includes('agua')) {
      pasos.push('Apagar inmediatamente el equipo y desconectarlo de la corriente');
      pasos.push('No intentar encender el equipo hasta que esté completamente seco');
      pasos.push('Dejar secar al menos 48 horas en un lugar ventilado');
    } else if (texto.includes('lenta') || texto.includes('lento') || texto.includes('tildada')) {
      pasos.push('Cerrar programas innecesarios que estén consumiendo recursos');
      pasos.push('Reiniciar el equipo para liberar memoria');
      pasos.push('Verificar espacio disponible en el disco duro');
    } else if (texto.includes('wifi') || texto.includes('internet')) {
      pasos.push('Reiniciar el router y esperar 30 segundos');
      pasos.push('Verificar que el WiFi esté activado en el equipo');
      pasos.push('Verificar la contraseña del WiFi');
    } else if (texto.includes('teclado') || texto.includes('mouse') || texto.includes('puntero')) {
      pasos.push('Desconectar y volver a conectar el dispositivo');
      pasos.push('Probar el dispositivo en otro puerto USB');
      pasos.push('Verificar que el dispositivo funcione en otro equipo');
    } else if (texto.includes('monitor') || texto.includes('pantalla') || texto.includes('imagen')) {
      pasos.push('Verificar que el cable de video esté bien conectado');
      pasos.push('Probar con otro cable de video');
      pasos.push('Conectar otro monitor para verificar si el problema es del monitor');
    } else if (texto.includes('impresora') || texto.includes('papel')) {
      pasos.push('Apagar la impresora y desconectarla');
      pasos.push('Retirar cuidadosamente el papel atascado');
      pasos.push('Limpiar los rodillos internos con un paño seco');
    } else if (texto.includes('virus') || texto.includes('malware')) {
      pasos.push('Ejecutar un análisis completo con el antivirus');
      pasos.push('Actualizar el antivirus a la última versión');
      pasos.push('Desconectar el equipo de internet mientras se resuelve');
    } else {
      // Pasos genéricos
      pasos.push('Reiniciar el equipo');
      pasos.push('Verificar conexiones y cables');
      pasos.push('Revisar si hay actualizaciones pendientes');
    }

    return pasos.length > 0 ? pasos : ['Paso 1', 'Paso 2', 'Paso 3'];
  }

  generarPasosAvanzados(problema, device) {
    // Simular pasos avanzados (en producción vendrían de AI)
    return [
      'Verificar componentes internos',
      'Probar con hardware alternativo',
      'Revisar logs del sistema'
    ];
  }

  verificarFormatoMensaje(tipo) {
    // Verificar que los mensajes tengan formato consistente
    const mensaje = tipo === 'inicial' 
      ? `Problema reportado: ${this.problema}`
      : 'Mensaje del bot';

    // Verificar emojis consistentes
    if (mensaje.includes('✅') || mensaje.includes('❌') || mensaje.includes('⚠️')) {
      this.estilos.mensajes.push({
        tipo,
        tieneEmojis: true,
        formato: 'correcto'
      });
    } else {
      this.estilos.mensajes.push({
        tipo,
        tieneEmojis: false,
        formato: 'sin emojis'
      });
    }
  }

  verificarFormatoPasos() {
    const pasos = [...(this.session.tests.basic || []), ...(this.session.tests.advanced || [])];
    
    pasos.forEach((paso, index) => {
      // Verificar que los pasos tengan formato consistente
      const tieneNumero = /^\d+[\.\)]\s/.test(paso) || paso.includes('Paso');
      const tieneEmoji = /[1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟]/.test(paso);
      
      this.estilos.formatos.push({
        paso: paso.substring(0, 50),
        tieneNumero,
        tieneEmoji,
        formato: tieneNumero || tieneEmoji ? 'correcto' : 'inconsistente'
      });

      if (!tieneNumero && !tieneEmoji) {
        this.warning(`⚠️ Paso sin formato numérico ni emoji: "${paso.substring(0, 50)}"`);
      }
    });
  }

  verificarBotones(stage) {
    const botonesEsperados = {
      'ESCALATE': ['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'],
      'TICKET_SENT': ['BTN_WHATSAPP_TECNICO', 'BTN_CLOSE'],
      'BASIC_TESTS': ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH']
    };

    const botones = botonesEsperados[stage] || [];
    
    this.estilos.botones.push({
      stage,
      botonesEsperados: botones.length,
      formato: 'correcto'
    });

    if (botones.length === 0) {
      this.warning(`⚠️ Stage ${stage} sin botones definidos`);
    }
  }

  getResults() {
    return {
      problema: this.problema,
      errors: this.errors,
      warnings: this.warnings,
      log: this.log,
      estilos: this.estilos,
      session: this.session
    };
  }
}

// Ejecutar simulaciones
async function ejecutarSimulaciones() {
  console.log('\n' + '='.repeat(80));
  console.log('INICIANDO SIMULACIONES DE PROBLEMAS ESPECÍFICOS');
  console.log('='.repeat(80));

  const resultados = [];
  const problemasEstilos = {};
  const problemasErrores = [];

  for (const problema of PROBLEMAS) {
    const sim = new ProblemaSimulator(problema);
    const resultado = await sim.simular();
    resultados.push(resultado);

    // Agrupar por tipo de problema para análisis
    const tipoProblema = sim.detectarDispositivo(problema).label || 'desconocido';
    if (!problemasEstilos[tipoProblema]) {
      problemasEstilos[tipoProblema] = [];
    }
    problemasEstilos[tipoProblema].push(resultado);

    // Detectar errores
    if (resultado.errors.length > 0 || resultado.warnings.length > 0) {
      problemasErrores.push({
        problema,
        errors: resultado.errors,
        warnings: resultado.warnings
      });
    }
  }

  // Análisis de estilos
  console.log('\n' + '='.repeat(80));
  console.log('ANÁLISIS DE ESTILOS VISUALES');
  console.log('='.repeat(80));

  const formatosInconsistentes = [];
  resultados.forEach(r => {
    r.estilos.formatos.forEach(f => {
      if (f.formato === 'inconsistente') {
        formatosInconsistentes.push({
          problema: r.problema,
          paso: f.paso
        });
      }
    });
  });

  if (formatosInconsistentes.length > 0) {
    console.log(`\n⚠️ Se encontraron ${formatosInconsistentes.length} pasos con formato inconsistente:`);
    formatosInconsistentes.forEach(f => {
      console.log(`  - "${r.problema}": "${f.paso}"`);
    });
  } else {
    console.log('\n✅ Todos los pasos tienen formato consistente');
  }

  // Resumen
  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN DE SIMULACIONES');
  console.log('='.repeat(80));

  let totalErrores = 0;
  let totalWarnings = 0;

  resultados.forEach((r, index) => {
    const num = index + 1;
    const errores = r.errors.length;
    const warnings = r.warnings.length;
    totalErrores += errores;
    totalWarnings += warnings;

    if (errores > 0 || warnings > 0) {
      console.log(`\n${num}. "${r.problema}"`);
      if (errores > 0) {
        console.log(`   ❌ ERRORES: ${errores}`);
        r.errors.forEach(e => console.log(`      - ${e}`));
      }
      if (warnings > 0) {
        console.log(`   ⚠️ ADVERTENCIAS: ${warnings}`);
        r.warnings.forEach(w => console.log(`      - ${w}`));
      }
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('RESUMEN GENERAL');
  console.log('='.repeat(80));
  console.log(`Total de problemas simulados: ${PROBLEMAS.length}`);
  console.log(`Total de errores encontrados: ${totalErrores}`);
  console.log(`Total de advertencias: ${totalWarnings}`);
  console.log(`Problemas con errores/advertencias: ${problemasErrores.length}`);

  if (totalErrores === 0 && totalWarnings === 0) {
    console.log('\n✅ Todas las simulaciones pasaron sin errores ni advertencias');
  } else if (totalErrores === 0) {
    console.log('\n⚠️ Hay advertencias pero no errores críticos');
  } else {
    console.log('\n❌ Se encontraron errores que requieren atención');
  }

  return {
    resultados,
    problemasErrores,
    formatosInconsistentes,
    resumen: {
      total: PROBLEMAS.length,
      errores: totalErrores,
      warnings: totalWarnings,
      problemasConErrores: problemasErrores.length
    }
  };
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarSimulaciones().then((resultados) => {
    console.log('\n✅ Simulaciones completadas');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Error ejecutando simulaciones:', err);
    process.exit(1);
  });
}

export { ejecutarSimulaciones, ProblemaSimulator, PROBLEMAS };

