/**
 * simulaciones_instalaciones.js
 * Simulaciones de consultas de instalación y configuración
 */

import { STATES } from './handlers/stateMachine.js';

// Lista de consultas de instalación/configuración
const CONSULTAS = [
  'quiero instalar windows desde cero',
  'necesito escanear un documento y no sé cómo',
  'me ayudás a descargar los drivers correctos?',
  'quiero instalar una impresora nueva',
  'me guiás para actualizar los drivers de video?',
  'necesito configurar una red wifi nueva',
  'quiero instalar un antivirus',
  'me ayudás a desinstalar un programa que no deja?',
  'necesito configurar mi correo en outlook',
  'quiero hacer un backup de mis archivos',
  'me explicás cómo clonar mi disco?',
  'necesito activar la licencia de windows',
  'quiero instalar office en mi notebook',
  'me ayudás a conectar una impresora por wifi?',
  'necesito configurar mi router desde cero',
  'quiero descargar un programa seguro sin virus',
  'me ayudás a restaurar el sistema?',
  'necesito sincronizar mis archivos con google drive',
  'quiero instalar un disco ssd nuevo',
  'me guiás para crear un pendrive booteable?'
];

class ConsultaSimulator {
  constructor(consulta) {
    this.consulta = consulta;
    this.session = {
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userName: 'Usuario Test',
      userLocale: 'es-AR',
      stage: STATES.ASK_NEED,
      device: null,
      deviceLabel: null,
      needType: null,
      problem: null,
      tests: { basic: [], advanced: [] },
      stepProgress: {},
      transcript: [],
      ticketId: null,
      waEligible: false
    };
    this.errors = [];
    this.warnings = [];
    this.logEntries = [];
    this.estilos = {
      mensajes: [],
      botones: [],
      formatos: []
    };
  }

  log(message, type = 'INFO') {
    const entry = `[${type}] ${message}`;
    this.logEntries.push(entry);
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
    this.log(`\n${'='.repeat(80)}`, 'INFO');
    this.log(`SIMULANDO: "${this.consulta}"`, 'INFO');
    this.log('='.repeat(80), 'INFO');

    // Paso 1: Usuario menciona la consulta
    this.log('Paso 1: Usuario menciona consulta', 'INFO');
    
    // Detectar tipo de necesidad
    const tipoNecesidad = this.detectarTipoNecesidad(this.consulta);
    this.session.needType = tipoNecesidad;
    this.log(`✅ Tipo de necesidad detectado: ${tipoNecesidad}`, 'INFO');

    // Detectar dispositivo si es relevante
    const dispositivoDetectado = this.detectarDispositivo(this.consulta);
    if (dispositivoDetectado) {
      this.session.device = dispositivoDetectado.device;
      this.session.deviceLabel = dispositivoDetectado.label;
      this.log(`✅ Dispositivo detectado: ${dispositivoDetectado.label}`, 'INFO');
    }

    // Verificar formato de mensaje inicial
    this.verificarFormatoMensaje('inicial');

    // Paso 2: Transición según tipo de necesidad
    if (tipoNecesidad === 'instalacion' || tipoNecesidad === 'consulta_general') {
      this.log('Paso 2: Transición a GUIDING_INSTALLATION o ASK_HOWTO_DETAILS', 'INFO');
      this.session.stage = STATES.ASK_HOWTO_DETAILS;
      
      // Generar pasos de instalación/guía (simulado)
      const pasos = this.generarPasosInstalacion(this.consulta, this.session.device);
      this.log(`✅ Pasos de instalación generados: ${pasos.length}`, 'INFO');

      // Verificar formato de pasos
      this.verificarFormatoPasos(pasos);
    } else {
      this.warning('⚠️ Tipo de necesidad no reconocido como instalación/consulta');
    }

    // Paso 3: Verificar botones disponibles
    this.verificarBotones('INSTALLATION');

    return this.getResults();
  }

  detectarTipoNecesidad(consulta) {
    const texto = consulta.toLowerCase();
    
    // Detectar instalaciones
    if (texto.includes('instalar') || texto.includes('instalación')) {
      return 'instalacion';
    }
    
    // Detectar configuraciones
    if (texto.includes('configurar') || texto.includes('configuración')) {
      return 'consulta_general';
    }
    
    // Detectar guías/explicaciones
    if (texto.includes('explic') || texto.includes('gui') || texto.includes('ayud') || texto.includes('cómo') || texto.includes('como')) {
      return 'consulta_general';
    }
    
    // Detectar descargas
    if (texto.includes('descargar') || texto.includes('descarga')) {
      return 'consulta_general';
    }
    
    // Por defecto, consulta general
    return 'consulta_general';
  }

  detectarDispositivo(consulta) {
    const texto = consulta.toLowerCase();
    
    if (texto.includes('notebook') || texto.includes('laptop') || texto.includes('portátil')) {
      return { device: 'notebook', label: 'notebook' };
    }
    if (texto.includes('pc') || texto.includes('computadora')) {
      return { device: 'desktop', label: 'PC de escritorio' };
    }
    if (texto.includes('impresora')) {
      return { device: 'peripheral', label: 'impresora' };
    }
    if (texto.includes('router')) {
      return { device: 'network', label: 'router' };
    }
    if (texto.includes('disco') || texto.includes('ssd') || texto.includes('pendrive')) {
      return { device: 'storage', label: 'almacenamiento' };
    }
    
    return null;
  }

  generarPasosInstalacion(consulta, device) {
    const texto = consulta.toLowerCase();
    const pasos = [];

    // Pasos genéricos según tipo de consulta
    if (texto.includes('windows')) {
      pasos.push('Preparar USB booteable con Windows');
      pasos.push('Configurar BIOS para arrancar desde USB');
      pasos.push('Seguir el asistente de instalación');
    } else if (texto.includes('escanear') || texto.includes('escaneo')) {
      pasos.push('Conectar el escáner al equipo');
      pasos.push('Instalar drivers del escáner');
      pasos.push('Abrir aplicación de escaneo');
    } else if (texto.includes('driver')) {
      pasos.push('Identificar el modelo exacto del dispositivo');
      pasos.push('Buscar drivers en el sitio oficial del fabricante');
      pasos.push('Descargar e instalar los drivers correctos');
    } else if (texto.includes('impresora')) {
      pasos.push('Conectar la impresora al equipo');
      pasos.push('Instalar drivers de la impresora');
      pasos.push('Configurar la impresora como predeterminada');
    } else if (texto.includes('wifi') || texto.includes('red')) {
      pasos.push('Acceder a la configuración del router');
      pasos.push('Configurar nombre y contraseña de la red');
      pasos.push('Conectar dispositivos a la nueva red');
    } else if (texto.includes('antivirus')) {
      pasos.push('Elegir un antivirus confiable');
      pasos.push('Descargar desde el sitio oficial');
      pasos.push('Instalar y configurar el antivirus');
    } else if (texto.includes('desinstalar')) {
      pasos.push('Abrir Panel de Control');
      pasos.push('Ir a Programas y características');
      pasos.push('Seleccionar y desinstalar el programa');
    } else if (texto.includes('correo') || texto.includes('outlook')) {
      pasos.push('Abrir Outlook');
      pasos.push('Agregar nueva cuenta de correo');
      pasos.push('Configurar servidor y credenciales');
    } else if (texto.includes('backup') || texto.includes('respaldo')) {
      pasos.push('Seleccionar archivos a respaldar');
      pasos.push('Elegir ubicación de respaldo');
      pasos.push('Ejecutar el proceso de respaldo');
    } else if (texto.includes('clonar') || texto.includes('disco')) {
      pasos.push('Conectar el disco destino');
      pasos.push('Usar herramienta de clonación');
      pasos.push('Verificar la clonación exitosa');
    } else if (texto.includes('licencia') || texto.includes('activar')) {
      pasos.push('Abrir Configuración de Windows');
      pasos.push('Ir a Activación');
      pasos.push('Ingresar la clave de producto');
    } else if (texto.includes('office')) {
      pasos.push('Descargar Office desde el sitio oficial');
      pasos.push('Ejecutar el instalador');
      pasos.push('Activar con la licencia');
    } else if (texto.includes('router')) {
      pasos.push('Conectar al router por cable o WiFi');
      pasos.push('Acceder a la interfaz de administración');
      pasos.push('Configurar parámetros de red');
    } else if (texto.includes('programa') || texto.includes('descargar')) {
      pasos.push('Buscar en el sitio oficial del desarrollador');
      pasos.push('Verificar que sea la versión oficial');
      pasos.push('Descargar e instalar');
    } else if (texto.includes('restaurar') || texto.includes('restauración')) {
      pasos.push('Abrir Configuración de Windows');
      pasos.push('Ir a Recuperación');
      pasos.push('Seleccionar punto de restauración');
    } else if (texto.includes('google drive') || texto.includes('sincronizar')) {
      pasos.push('Instalar Google Drive para escritorio');
      pasos.push('Iniciar sesión con cuenta de Google');
      pasos.push('Seleccionar carpetas a sincronizar');
    } else if (texto.includes('ssd') || texto.includes('disco nuevo')) {
      pasos.push('Conectar el SSD al equipo');
      pasos.push('Inicializar el disco en Administración de discos');
      pasos.push('Formatear y asignar letra de unidad');
    } else if (texto.includes('pendrive') || texto.includes('booteable')) {
      pasos.push('Descargar herramienta de creación de medios');
      pasos.push('Conectar el pendrive');
      pasos.push('Crear el medio booteable');
    } else {
      // Pasos genéricos
      pasos.push('Paso 1: Preparar los requisitos');
      pasos.push('Paso 2: Seguir las instrucciones');
      pasos.push('Paso 3: Verificar la instalación');
    }

    return pasos.length > 0 ? pasos : ['Paso 1', 'Paso 2', 'Paso 3'];
  }

  verificarFormatoMensaje(tipo) {
    const mensaje = tipo === 'inicial' 
      ? `Consulta: ${this.consulta}`
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

  verificarFormatoPasos(pasos) {
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
      'INSTALLATION': ['BTN_BACK', 'BTN_CLOSE'],
      'GUIDING_INSTALLATION': ['BTN_BACK', 'BTN_CLOSE']
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
      consulta: this.consulta,
      errors: this.errors,
      warnings: this.warnings,
      log: this.logEntries,
      estilos: this.estilos,
      session: this.session
    };
  }
}

// Ejecutar simulaciones
async function ejecutarSimulacionesInstalaciones() {
  console.log('\n' + '='.repeat(80));
  console.log('INICIANDO SIMULACIONES DE INSTALACIONES Y CONFIGURACIONES');
  console.log('='.repeat(80));

  const resultados = [];
  const problemasErrores = [];

  for (const consulta of CONSULTAS) {
    const sim = new ConsultaSimulator(consulta);
    const resultado = await sim.simular();
    resultados.push(resultado);

    // Detectar errores
    if (resultado.errors.length > 0 || resultado.warnings.length > 0) {
      problemasErrores.push({
        consulta,
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
          consulta: r.consulta,
          paso: f.paso
        });
      }
    });
  });

  if (formatosInconsistentes.length > 0) {
    console.log(`\n⚠️ Se encontraron ${formatosInconsistentes.length} pasos con formato inconsistente:`);
    formatosInconsistentes.forEach(f => {
      console.log(`  - "${f.consulta}": "${f.paso}"`);
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
      console.log(`\n${num}. "${r.consulta}"`);
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
  console.log(`Total de consultas simuladas: ${CONSULTAS.length}`);
  console.log(`Total de errores encontrados: ${totalErrores}`);
  console.log(`Total de advertencias: ${totalWarnings}`);
  console.log(`Consultas con errores/advertencias: ${problemasErrores.length}`);

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
      total: CONSULTAS.length,
      errores: totalErrores,
      warnings: totalWarnings,
      consultasConErrores: problemasErrores.length
    }
  };
}

// Ejecutar si se llama directamente
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] && process.argv[1].endsWith('simulaciones_instalaciones.js')) {
  ejecutarSimulacionesInstalaciones().then((resultados) => {
    console.log('\n✅ Simulaciones completadas');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Error ejecutando simulaciones:', err);
    process.exit(1);
  });
}

export { ejecutarSimulacionesInstalaciones, ConsultaSimulator, CONSULTAS };

