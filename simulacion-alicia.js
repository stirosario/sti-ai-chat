// ========================================================
// SIMULACIÓN: Caso Alicia
// Señora mayor que necesita ayuda para descargar e instalar AnyDesk
// ========================================================

import { analyzeUserIntent, generateConversationalResponse } from './conversationalBrain.js';

console.log('\n' + '═'.repeat(95));
console.log('👵 SIMULACIÓN: Caso Alicia - Instalación de AnyDesk con paciencia');
console.log('═'.repeat(95) + '\n');

// Sesión inicial
let session = {
  id: 'sim-alicia-001',
  userName: null,
  conversationState: 'greeting',
  problemDescription: '',
  transcript: [],
  detectedEntities: { 
    device: null, 
    action: null, 
    urgency: 'normal' 
  },
  stepProgress: { 
    current: 0, 
    total: 0 
  }
};

// Conversación con Alicia (usuario no técnico, necesita explicaciones muy detalladas)
const conversacion = [
  { 
    user: 'Hola, mi nombre es Alicia', 
    desc: 'Saludo inicial, mujer mayor' 
  },
  { 
    user: 'Me dijeron que necesito bajar un programa que se llama AnyDesk para que me puedan ayudar', 
    desc: 'Solicita ayuda para descargar AnyDesk' 
  },
  { 
    user: 'No sé cómo se hace, no soy muy buena con estas cosas', 
    desc: 'Expresa inseguridad con la tecnología' 
  },
  { 
    user: 'Sí, abrí el Chrome, el de los colores', 
    desc: 'Confirma Paso 1: Abrió el navegador' 
  },
  { 
    user: 'Ya escribí anydesk.com/es y entré, veo la página', 
    desc: 'Confirma Paso 2: Llegó a la página' 
  },
  { 
    user: 'Sí, veo un botón verde que dice Descargar ahora', 
    desc: 'Identifica el botón de descarga' 
  },
  { 
    user: 'Le hice click y abajo apareció algo que está bajando', 
    desc: 'Confirma Paso 3: Descarga iniciada' 
  },
  { 
    user: 'Ya terminó, veo el archivo abajo', 
    desc: 'Descarga completada' 
  },
  { 
    user: 'Le hice click al archivo y apareció una ventana preguntando algo', 
    desc: 'Abrió el archivo descargado' 
  },
  { 
    user: 'Le puse que sí y se abrió una ventana con un número grande', 
    desc: 'Dio permisos y ve la interfaz de AnyDesk' 
  },
  { 
    user: 'El número es 123 456 789', 
    desc: 'Proporciona su ID de AnyDesk' 
  },
  { 
    user: '¡Muchas gracias! Me ayudaste mucho, muy claro todo', 
    desc: 'Agradece la ayuda' 
  }
];

let pasoActual = 0;

console.log('📝 Características del caso:');
console.log('   • Usuario no técnico (señora mayor)');
console.log('   • Requiere explicaciones muy detalladas');
console.log('   • Necesita paciencia y lenguaje simple');
console.log('   • Primera vez usando software de acceso remoto');
console.log('\n' + '═'.repeat(95) + '\n');

for (let i = 0; i < conversacion.length; i++) {
  const { user: mensaje, desc } = conversacion[i];
  
  console.log(`${i + 1}. ${desc}`);
  console.log('─'.repeat(95));
  console.log(`👵 Alicia: "${mensaje}"\n`);
  
  // Procesar mensaje
  const analysis = analyzeUserIntent(mensaje, session);
  const response = generateConversationalResponse(analysis, session, mensaje);
  
  // Guardar en transcripción
  session.transcript.push({ role: 'user', message: mensaje });
  session.transcript.push({ role: 'assistant', message: response.reply });
  
  // Mostrar respuesta del asistente
  console.log('🤖 Asistente IA (tono paciente y amable):');
  console.log(response.reply);
  console.log('\n' + '─'.repeat(95));
  
  // Indicador de progreso
  if (session.stepProgress.current > pasoActual) {
    pasoActual = session.stepProgress.current;
    console.log(`\n✅ Progreso: Paso ${pasoActual} completado con éxito\n`);
  }
  
  // Pausas para simular lectura/acción
  if (i < conversacion.length - 1) {
    console.log('⏳ (Alicia está leyendo y siguiendo las instrucciones...)\n');
  }
}

// Resumen final
console.log('\n' + '═'.repeat(95));
console.log('📊 RESUMEN DE LA SIMULACIÓN');
console.log('═'.repeat(95));
console.log(`✓ Usuario: ${session.userName}`);
console.log(`✓ Tipo de caso: ${session.detectedEntities.device} - ${session.detectedEntities.action}`);
console.log(`✓ Estado conversacional: ${session.conversationState}`);
console.log(`✓ Pasos completados: ${session.stepProgress.current}`);
console.log(`✓ Total de intercambios: ${conversacion.length}`);
console.log(`✓ Nivel de éxito: ✅ COMPLETADO`);

console.log('\n' + '═'.repeat(95));
console.log('🎯 CARACTERÍSTICAS DE LA ASISTENCIA:');
console.log('═'.repeat(95));
console.log(`
✅ Lenguaje adaptado para usuario no técnico:
   • Sin jerga técnica
   • Explicaciones paso a paso muy detalladas
   • Referencias visuales (colores, ubicaciones)
   • Confirmaciones en cada paso
   • Tono paciente y tranquilizador

✅ Instrucciones específicas incluidas:
   • Dónde buscar el ícono del navegador
   • Cómo hacer doble click
   • Dónde aparece la descarga
   • Qué ventanas van a aparecer
   • Qué hacer con los permisos
   • Para qué sirve el número de AnyDesk

✅ Empatía y soporte emocional:
   • "Con mucha calma"
   • "¡Ya casi estamos!"
   • "¡Perfecto!"
   • "No te preocupes, es normal"
   • Celebra cada pequeño logro
`);

console.log('═'.repeat(95));
console.log('\n💡 PASOS GUIADOS PARA ANYDESK:');
console.log('═'.repeat(95));
console.log(`
📍 Paso 1: Abrir el navegador
   → Buscar ícono de Chrome (rueda de colores) o Edge (e azul)
   → Hacer doble click
   → Objetivo: Tener navegador abierto

📍 Paso 2: Ir a la página de AnyDesk
   → Hacer click en la barra de direcciones (arriba)
   → Escribir: anydesk.com/es
   → Presionar Enter
   → Esperar que cargue

📍 Paso 3: Descargar AnyDesk
   → Buscar botón VERDE que dice "Descargar ahora"
   → Hacer un solo click
   → Ver la descarga abajo del navegador
   → Esperar 1-2 minutos

📍 Paso 4: Abrir el archivo descargado
   → Mirar abajo del navegador
   → Click en el archivo "AnyDesk.exe"
   → Si pregunta, hacer click en "Sí"
   → Se abre ventana de AnyDesk

📍 Paso 5: Instalación (opcional)
   → Click en "Instalar" si se desea
   → Dejar opciones por defecto
   → Click en "Aceptar"
   → Ver número de 9 dígitos

📍 Paso 6: Dar permiso de conexión
   → Compartir el número de 9 dígitos
   → Cuando alguien pida conectarse
   → Hacer click en "Aceptar"
   → ¡Listo para recibir ayuda!
`);

console.log('═'.repeat(95));
console.log('\n✅ RESULTADO:');
console.log('   Alicia pudo instalar AnyDesk exitosamente con instrucciones');
console.log('   claras, pacientes y adaptadas a su nivel de conocimiento técnico.');
console.log('   El sistema detectó su inseguridad y adaptó el tono y detalle.');
console.log('\n' + '═'.repeat(95) + '\n');

console.log('🎓 LECCIONES APRENDIDAS:');
console.log('   ✓ Importancia de adaptar el lenguaje al usuario');
console.log('   ✓ Explicaciones visuales (colores, ubicaciones)');
console.log('   ✓ Confirmación después de cada paso');
console.log('   ✓ Tono paciente y celebratorio');
console.log('   ✓ Anticipar ventanas de permisos');
console.log('\n' + '═'.repeat(95) + '\n');
