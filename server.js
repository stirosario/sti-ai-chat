// server.js V4.8.4 — STI Chat (Redis + Tickets + Transcript) + NameFix + CORS + Reload + GreeterFix + FlowFix + DiagnosticoHíbrido
// Resumen del flujo y features implementadas
// - Estados: ASK_NAME → ASK_PROBLEM → ASK_DEVICE → BASIC/ADVANCED/ESCALATE
// - Sesión por 'x-session-id' / 'sid' (si ya hay nombre no reinicia)
// - pendingUtterance: guarda el problema si lo mandan antes del nombre
// - CORS sólido con OPTIONS para preflight
// - Endpoints: / /api/health /api/reload(GET/POST) /api/greeting /api/chat
//   /api/transcript/:sid /api/whatsapp-ticket /ticket/:id /api/sessions /api/reset
// - OpenAI opcional para análisis/steps; si no hay API Key usa fallback local
// - NUEVO: Diagnóstico híbrido (heurísticas locales + OpenAI) con issues específicos por dispositivo

import 'dotenv/config'; // Carga variables de entorno desde .env
import express from 'express'; // Framework HTTP
import cors from 'cors'; // Middleware CORS
import fs from 'fs'; // FileSystem para logs, tickets y transcripts
import path from 'path'; // Utilidades de rutas
import OpenAI from 'openai'; // SDK OpenAI (opcional)

// ===== OpenAI (opcional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Modelo por defecto

// Instancia de cliente OpenAI solo si hay API key (evita crashear en local)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ===== Persistencia / paths =====
// Carpetas base (se pueden mapear a volúmenes en Render/Docker)
const DATA_BASE = process.env.DATA_BASE || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');

// URL pública del backend para construir links (tickets, og:image, etc.)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';

// Número de WhatsApp destino para derivaciones
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Crea directorios si no existen (recursivo)
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}

const nowIso = () => new Date().toISOString(); // Helper timestamp ISO

// ===== Carga chat JSON =====
// Ruta al archivo de configuración conversacional (nlp, steps, labels)
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = {}; // Objeto con todo el JSON cargado
let deviceMatchers = []; // Cache de regex para dispositivos (legacy)
let issueMatchers = []; // Cache de regex para issues (legacy)

// Carga/parsing de sti-chat.json, compila regex de devices/issues para rendimiento
function loadChat() {
  try {
    CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
    console.log('[chat] ✅ Cargado', CHAT.version, 'desde', CHAT_JSON_PATH);
    deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ key: d.key, rx: new RegExp(d.rx, 'i') }));
    issueMatchers = (CHAT?.nlp?.issues || []).map(i => ({ key: i.key, rx: new RegExp(i.rx, 'i') }));
  } catch (e) {
    console.error('[chat] ❌ No pude cargar sti-chat.json:', e.message);
    CHAT = {};
    deviceMatchers = [];
    issueMatchers = [];
  }
}
loadChat();

// ============================================================================
// === NUEVO: Diagnóstico híbrido (local + OpenAI opcional) ===
// ============================================================================

// === Helpers de normalización ===
const CANON_DEVICES = [
  'pc','notebook','monitor','teclado','mouse','impresora','almacenamiento','red','camara','microfono'
];

const DEVICE_SYNONYMS = [
  [/^(pc|computadora|compu|cpu|gabinete|torre)$/i, 'pc'],
  [/^(notebook|laptop|netbook|ultrabook|macbook)$/i, 'notebook'],
  [/^(monitor|pantalla|display)$/i, 'monitor'],
  [/^(teclado|keyboard|keyb|keys?)$/i, 'teclado'],
  [/^(mouse|rat[oó]n|trackpad)$/i, 'mouse'],
  [/^(impresora|printer|multifuncion|multifunción)$/i, 'impresora'],
  [/^(disco|ssd|hdd|pendrive|usb|memoria|almacenamiento)$/i, 'almacenamiento'],
  [/^(red|internet|wifi|wi-?fi|ethernet|router|modem|m[oó]dem)$/i, 'red'],
  [/^(c[aá]mara|webcam|cam|camera)$/i, 'camara'],
  [/^(micr[oó]fono|micro|mic)$/i, 'microfono']
];

// Mapeo de issues a "issueKey" canónicos
const ISSUE_PATTERNS = [
  // TECLADO
  { key:'no_funcionan_teclas', rx: /(no\s*funciona[n]?|algunas|varias)\s+(letras|teclas)/i, deviceHint:'teclado' },
  { key:'teclas_repetidas_o_fantasma', rx: /(se\s*repiten|tecleo\s*fantasma|escribe\s*solo)/i, deviceHint:'teclado' },
  { key:'teclado_no_detectado', rx: /(teclado).*(no\s*(detecta|reconoce|instala))/i, deviceHint:'teclado' },
  // MOUSE
  { key:'mouse_no_detectado', rx: /(mouse).*(no\s*(detecta|reconoce|instala))/i, deviceHint:'mouse' },
  { key:'mouse_salta_o_corta', rx: /(mouse).*(salta|se\s*corta|se\s*traba)/i, deviceHint:'mouse' },
  // PANTALLA / VIDEO
  { key:'no_hay_video', rx: /(no\s*(hay|da)\s*(imagen|video)|pantalla\s*negra)/i, deviceHint:'monitor' },
  { key:'pantalla_parpadea', rx: /(parpadea|titila|flicker|intermitente)/i, deviceHint:'monitor' },
  { key:'artefactos_graficos', rx: /(artefactos|rayas|bloques|líneas\s*raras)/i, deviceHint:'monitor' },
  // ENCENDIDO / POWER
  { key:'no_enciende', rx: /(no\s*(enciende|prende)|no\s*arranca)/i, deviceHint:'pc' },
  { key:'reinicios_aleatorios', rx: /(se\s*reinicia|reinicios\s*solo|cuelgues\s*al\s*azar)/i, deviceHint:'pc' },
  // RUIDOS
  { key:'ruido_ventilador', rx: /(ruido|zumbido|vibra).*(ventilador|cooler|fan)/i, deviceHint:'pc' },
  { key:'ruido_disco', rx: /(clic|clack|chirrido|raspa).*(disco|hdd)/i, deviceHint:'almacenamiento' },
  // TEMPERATURA / LENTITUD
  { key:'sobrecalentamiento', rx: /(caliente|sobrecalienta|temperatura\s*alta)/i, deviceHint:'pc' },
  { key:'lento_general', rx: /(lento|trabado|tarda\s*mucho|se\s*traba)/i, deviceHint:'pc' },
  // RED
  { key:'sin_internet', rx: /(sin\s*internet|no\s*conecta\s*internet)/i, deviceHint:'red' },
  { key:'wifi_se_corta', rx: /(wifi|wi-?fi).*(se\s*corta|inestable|baja\s*señal)/i, deviceHint:'red' },
  // IMPRESORA
  { key:'impresora_fuera_linea', rx: /(impresora).*(fuera\s*de\s*l[ií]nea|offline)/i, deviceHint:'impresora' },
  { key:'atasco_papel', rx: /(atasco|papel\s*atascado)/i, deviceHint:'impresora' },
  // ALMACENAMIENTO
  { key:'disco_lleno', rx: /(disco|ssd).*(lleno|sin\s*espacio)/i, deviceHint:'almacenamiento' },
  { key:'errores_disco', rx: /(sectores\s*defectuosos|smart|errores\s*de\s*disco)/i, deviceHint:'almacenamiento' },
  // CAMARA / MICRO
  { key:'camara_no_detectada', rx: /(c[aá]mara|webcam).*(no\s*(detecta|reconoce|funciona))/i, deviceHint:'camara' },
  { key:'microfono_bajo_o_mudo', rx: /(micro|micr[oó]fono).*(bajo|no\s*se\s*escucha|mudo)/i, deviceHint:'microfono' },
];

function normalizeText(s='') {
  if (!s) return '';
  // tolerante a ```json y respuestas con code blocks
  s = String(s).replace(/```[\s\S]*?```/g, m => m.replace(/```/g,''));
  s = s.replace(/[""«»]/g,'"').replace(/['']/g,"'");
  // quita html simple
  s = s.replace(/<[^>]+>/g, ' ');
  // colapsa espacios
  s = s.replace(/\s+/g,' ').trim();
  return s;
}

function toCanonDevice(raw='') {
  const t = (raw||'').toLowerCase().trim();
  for (const [rx,canon] of DEVICE_SYNONYMS) {
    if (rx.test(t)) return canon;
  }
  // si ya vino canónico
  if (CANON_DEVICES.includes(t)) return t;
  return null;
}

function detectDeviceHeuristics(text) {
  const t = normalizeText(text);
  for (const [rx,canon] of DEVICE_SYNONYMS) {
    if (rx.test(t)) return canon;
  }
  // pistas por palabras
  if (/(tecla|letra|espacio|enter|backspace)/i.test(t)) return 'teclado';
  if (/(cursor|puntero|clic|click|scroll)/i.test(t)) return 'mouse';
  if (/(pantalla|monitor|flicker|imagen|video)/i.test(t)) return 'monitor';
  if (/(impresi[oó]n|cartucho|tinta|toner|papel)/i.test(t)) return 'impresora';
  if (/(wifi|wi-?fi|ethernet|router|internet|modem|m[oó]dem)/i.test(t)) return 'red';
  if (/(c[aá]mara|webcam)/i.test(t)) return 'camara';
  if (/(mic|micr[oó]fono)/i.test(t)) return 'microfono';
  if (/(disco|ssd|hdd|pendrive|usb|almacenamiento)/i.test(t)) return 'almacenamiento';
  if (/(pc|computadora|notebook|laptop|torre|gabinete|cpu)/i.test(t)) return 'pc';
  return null;
}

function detectIssueHeuristics(text) {
  const t = normalizeText(text);
  for (const rule of ISSUE_PATTERNS) {
    if (rule.rx.test(t)) return { issueKey: rule.key, deviceHint: rule.deviceHint || null };
  }
  // algunas heurísticas simples
  if (/tecla|letra/i.test(t) && /(no\s*funciona|algunas|varias)/i.test(t)) {
    return { issueKey:'no_funcionan_teclas', deviceHint:'teclado' };
  }
  if (/ruido|zumbido|vibra/i.test(t)) {
    if (/ventilador|cooler|fan/i.test(t)) return { issueKey:'ruido_ventilador', deviceHint:'pc' };
    if (/disco|hdd/i.test(t) ) return { issueKey:'ruido_disco', deviceHint:'almacenamiento' };
    return { issueKey:'ruido_ventilador', deviceHint:'pc' }; // default ruido
  }
  if (/parpadea|titila|flicker/i.test(t)) return { issueKey:'pantalla_parpadea', deviceHint:'monitor' };
  if (/no\s*(enciende|prende|arranca)/i.test(t)) return { issueKey:'no_enciende', deviceHint:'pc' };
  if (/lento|trabado|tarda/i.test(t)) return { issueKey:'lento_general', deviceHint:'pc' };
  if (/sin\s*internet|no\s*conecta/i.test(t)) return { issueKey:'sin_internet', deviceHint:'red' };
  return null;
}

// === OpenAI opcional (tolerante a ausencia de API key) ===
async function analyzeProblemWithOA(userText) {
  const hasOA = !!(process.env.OPENAI_API_KEY && openai);
  if (!hasOA) return null;

  const prompt = [
    'Analiza el texto del usuario y devuelve JSON estricto con las claves:',
    '{ "device": "",',
    '  "issueKey": "",',
    '  "confidence": <0..1> }',
    '',
    'Reglas:',
    '- Elegí device canónico (según lista).',
    '- Si el usuario menciona "teclas/letras", favorecé teclado.',
    '- Para ruidos: distinguí ventilador vs disco cuando sea posible.',
    '- issueKey ejemplos: "no_funcionan_teclas","ruido_ventilador","ruido_disco","pantalla_parpadea","no_enciende","lento_general","sin_internet","impresora_fuera_linea","camara_no_detectada","microfono_bajo_o_mudo".',
    '- Si quedás genérico, devolvé issueKey contextual: "no_detecta_teclado","ruido_extraño","problema_video","problema_red".',
    '',
    `Texto: """${normalizeText(userText)}"""`,
  ].join('\n');

  try {
    const res = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role:'system', content:'Sos un asistente de diagnóstico técnico. Respondé SOLO JSON.' },
        { role:'user', content: prompt }
      ]
    });
    const raw = (res.choices?.[0]?.message?.content || '').trim();
    const clean = normalizeText(raw).replace(/^```json/i,'').replace(/```$/,'').trim();
    const parsed = JSON.parse(clean);
    // saneo de device
    parsed.device = toCanonDevice(parsed.device) || detectDeviceHeuristics(userText) || null;
    return parsed;
  } catch(e) {
    console.error('[analyzeProblemWithOA] error:', e.message);
    // en caso de fallo, seguimos con heurística local
    return null;
  }
}

// === Fusión: heurística local + OpenAI ===
async function analyzeProblemHybrid(userText) {
  const text = normalizeText(userText);

  // 1) Detección local rápida
  const localIssue = detectIssueHeuristics(text);
  let device = detectDeviceHeuristics(text) || (localIssue?.deviceHint || null);
  let issueKey = localIssue?.issueKey || null;
  let confidence = issueKey ? 0.7 : (device ? 0.5 : 0.0);

  // 2) OpenAI, si existe, para afinar
  const oa = await analyzeProblemWithOA(text);
  if (oa) {
    // mezcla ponderada (prefiere específico)
    if (oa.issueKey && oa.issueKey !== 'desconocido') {
      issueKey = oa.issueKey;
      confidence = Math.max(confidence, Number(oa.confidence || 0.65));
    }
    device = toCanonDevice(oa.device) || device;
  }

  // 3) Fallbacks contextualizados
  if (!issueKey) {
    if (device === 'teclado') issueKey = 'no_detecta_teclado';
    else if (/ruido|zumbido|vibra/i.test(text)) issueKey = 'ruido_extraño';
    else if (device === 'monitor') issueKey = 'problema_video';
    else if (device === 'red') issueKey = 'problema_red';
    else if (device === 'impresora') issueKey = 'impresora_fuera_linea';
    else if (device === 'camara') issueKey = 'camara_no_detectada';
    else if (device === 'microfono') issueKey = 'microfono_bajo_o_mudo';
    else if (/no\s*(enciende|prende|arranca)/i.test(text)) issueKey = 'no_enciende';
    else issueKey = 'diagnostico_general';
    confidence = Math.max(confidence, 0.55);
  }

  // 4) Si no hay device, inferí por issueKey
  if (!device) {
    const byIssue = {
      no_funcionan_teclas:'teclado', teclas_repetidas_o_fantasma:'teclado', teclado_no_detectado:'teclado',
      mouse_no_detectado:'mouse', mouse_salta_o_corta:'mouse',
      no_hay_video:'monitor', pantalla_parpadea:'monitor', artefactos_graficos:'monitor',
      no_enciende:'pc', reinicios_aleatorios:'pc', sobrecalentamiento:'pc', lento_general:'pc',
      ruido_ventilador:'pc', ruido_disco:'almacenamiento',
      sin_internet:'red', wifi_se_corta:'red', problema_red:'red',
      impresora_fuera_linea:'impresora', atasco_papel:'impresora',
      disco_lleno:'almacenamiento', errores_disco:'almacenamiento',
      camara_no_detectada:'camara', microfono_bajo_o_mudo:'microfono',
      diagnostico_general:'pc', problema_video:'monitor', ruido_extraño:'pc',
      no_detecta_teclado:'teclado'
    };
    device = byIssue[issueKey] || 'pc';
  }

  // clamp
  confidence = Math.max(0, Math.min(1, confidence));
  return { device, issueKey, confidence };
}

// === Pasos básicos por issue/device (extensible) ===
function getBasicSteps(issueKey, device) {
  const STEPS = {
    // TECLADO
    no_funcionan_teclas: [
      'Probá el teclado en otro puerto USB (o en otra PC).',
      'Si es inalámbrico, cambiá pilas y reconectá el receptor.',
      'En Windows: Configuración → Hora e idioma → Idioma → Disposición del teclado (verificá idioma).',
      'Desinstalá el teclado desde el Administrador de dispositivos y reiniciá.',
    ],
    teclas_repetidas_o_fantasma: [
      'Limpieza suave (aire comprimido) y revisá si alguna tecla queda hundida.',
      'Desactivá "Filtro de Teclas" y "Teclas Adhesivas" (Accesibilidad).',
      'Probá otro puerto/PC para descartar driver.',
    ],
    teclado_no_detectado: [
      'Cambiá el cable/USB y probá en otro equipo.',
      'Verificá en "Administrador de dispositivos" si aparece con alerta y reinstalalo.',
      'Si es notebook, probá con teclado USB externo para continuar trabajando.',
    ],
    no_detecta_teclado: [
      'Probá otro puerto USB o reconectá el dongle (si es inalámbrico).',
      'Entra al Administrador de dispositivos y reinstalá el driver de teclado.',
      'Probá el teclado en otra PC para descartar falla del periférico.',
    ],
    // MOUSE
    mouse_no_detectado: [
      'Probá otro puerto USB y otra superficie.',
      'Si es inalámbrico, cambiá pilas y reemparejá.',
      'Reinstalá el driver de mouse desde el Administrador de dispositivos.',
    ],
    mouse_salta_o_corta: [
      'Limpieza del sensor y probá sin pad con otra superficie.',
      'Desactivá ahorros de energía del USB (Panel de control → Opciones de energía).',
      'Probá con otro mouse para descartar hardware.',
    ],
    // VIDEO
    no_hay_video: [
      'Chequeá cable (HDMI/DP/VGA) y probá otro cable/entrada del monitor.',
      'Asegurate que la PC encienda (luces/sonidos). Si enciende pero no da imagen, probá con monitor externo.',
      'Reseteá CMOS si hubo cambios de hardware (quitar batería o jumper).',
    ],
    pantalla_parpadea: [
      'Verificá la frecuencia de actualización recomendada del monitor.',
      'Probá otro cable y otra entrada del monitor.',
      'Actualizá o reinstalá el driver gráfico.',
    ],
    artefactos_graficos: [
      'Reinstalá drivers de video (limpieza con DDU si es posible).',
      'Probá otra salida de la placa y otro cable.',
      'Testeá temperaturas de GPU; limpiá polvo del gabinete.',
    ],
    problema_video: [
      'Probá con otro cable y otra entrada del monitor.',
      'Conectá un segundo monitor o TV para aislar si es la PC o el monitor.',
      'Reinstalá/actualizá drivers de video.',
    ],
    // POWER
    no_enciende: [
      'Verificá energía: enchufe, zapatilla, cable y botón de la fuente en "I".',
      'Mantené presionado el botón de encendido 15–30s y probá de nuevo.',
      'Quitá periféricos y probá con mínimo (placa madre + CPU + 1 RAM + video).',
    ],
    reinicios_aleatorios: [
      'Revisá temperatura (limpieza y pasta térmica si es necesario).',
      'Chequeá RAM con MemTest y fuente con multímetro si se dispone.',
      'Mirar Visor de eventos de Windows (Kernel-Power, etc.).',
    ],
    // RUIDOS
    ruido_ventilador: [
      'Limpieza de ventiladores y verificación de obstrucciones.',
      'Ajustá curvas de ventilador en BIOS/soft si están muy agresivas.',
      'Reaplicar pasta térmica si la CPU/GPU calientan de más.',
    ],
    ruido_disco: [
      'Hacé backup urgente de datos.',
      'Chequeá SMART con CrystalDiskInfo/Diagnóstico del fabricante.',
      'Evaluá reemplazo de HDD por SSD si el ruido persiste.',
    ],
    ruido_extraño: [
      'Abrí el gabinete y localizá si proviene de ventiladores o disco.',
      'Desconectá periféricos y testeá en mínimo para aislar.',
      'Si es HDD y hace "clic", respaldá datos de inmediato.',
    ],
    // TEMPERATURA / LENTITUD
    sobrecalentamiento: [
      'Limpieza interna (polvo) y verificación de flujo de aire.',
      'Reemplazo de pasta térmica si tiene muchos años.',
      'Monitoreo con HWInfo/LibreHardwareMonitor para ver picos.',
    ],
    lento_general: [
      'Verificá uso de disco/CPU en el Administrador de tareas.',
      'Desinstalá programas que inician con Windows y malware scan.',
      'Si es HDD, considerá migrar a SSD y ampliar RAM.',
    ],
    // RED
    sin_internet: [
      'Reiniciá router/módem y probá por cable (Ethernet).',
      'Olvidá y reconectá la red Wi-Fi; renová IP (ipconfig /release /renew).',
      'Probá otra red o celular para descartar proveedor.',
    ],
    wifi_se_corta: [
      'Cambiá banda (2.4/5GHz) y canal del router.',
      'Actualizá drivers de red y desactivá ahorro de energía del adaptador.',
      'Probá acercarte al router o usar repetidor.',
    ],
    problema_red: [
      'Probá por cable para descartar Wi-Fi.',
      'Olvidá y volvé a conectar la red; renová IP.',
      'Verificá DNS y drivers de red.',
    ],
    // IMPRESORA
    impresora_fuera_linea: [
      'Asegurate de que esté encendida y en la misma red.',
      'Reinstalá la impresora y ponela como predeterminada.',
      'Desactivá "Usar impresora sin conexión".',
    ],
    atasco_papel: [
      'Retirá papel atascado según la tapa de servicio.',
      'Revisá rodillos y nivel de papel/tamaño correcto.',
      'Apagá/encendé y probá una hoja de test.',
    ],
    // ALMACENAMIENTO
    disco_lleno: [
      'Liberá espacio (Descargas/Temporales) y vaciá la papelera.',
      'Ejecutá liberador de espacio/Storage Sense.',
      'Mové datos a un disco externo o nube.',
    ],
    errores_disco: [
      'Chequeá SMART y ejecutá CHKDSK /F.',
      'Respaldá los datos críticos de inmediato.',
      'Considerá reemplazo si SMART alerta.',
    ],
    // CAMARA / MICRO
    camara_no_detectada: [
      'Verificá permisos de Cámara en el sistema y la app.',
      'Actualizá drivers; probá otra app (Zoom/Meet).',
      'Si es USB, cambiá de puerto/cable.',
    ],
    microfono_bajo_o_mudo: [
      'Subí el nivel de entrada y desactivá "mejoras" conflictivas.',
      'Probá en otra app; actualizá drivers.',
      'Testeá con otro micrófono para aislar.',
    ],
    // Genérico
    diagnostico_general: [
      'Contame si es de hardware (ruidos/temperatura) o de software (errores/lentitud).',
      '¿Cambió algo antes de que empiece el problema? (golpe, caída, actualización).',
      'Puedo darte pruebas más avanzadas o coordinar un WhatsApp con técnico.',
    ],
  };

  // fallback por device si no hay issueKey en tabla
  if (!STEPS[issueKey]) {
    const fallbackByDevice = {
      teclado: STEPS.no_detecta_teclado,
      mouse: STEPS.mouse_no_detectado,
      monitor: STEPS.problema_video,
      red: STEPS.problema_red,
      impresora: STEPS.impresora_fuera_linea,
      almacenamiento: STEPS.disco_lleno,
      camara: STEPS.camara_no_detectada,
      microfono: STEPS.microfono_bajo_o_mudo,
      pc: STEPS.diagnostico_general,
      notebook:STEPS.diagnostico_general,
    };
    return fallbackByDevice[device] || STEPS.diagnostico_general;
  }
  return STEPS[issueKey];
}

// === Helper human-readable (mejorado) ===
function issueHuman(issueKey) {
  const MAP = {
    no_funcionan_teclas:'algunas teclas no funcionan',
    teclas_repetidas_o_fantasma:'teclas se repiten / tecleo fantasma',
    teclado_no_detectado:'no detecta el teclado',
    no_detecta_teclado:'no detecta el teclado',
    mouse_no_detectado:'no detecta el mouse',
    mouse_salta_o_corta:'el mouse salta o se corta',
    no_hay_video:'no hay imagen',
    pantalla_parpadea:'pantalla parpadea',
    artefactos_graficos:'artefactos gráficos',
    no_enciende:'no enciende',
    reinicios_aleatorios:'reinicios aleatorios',
    ruido_ventilador:'ruido en ventilador',
    ruido_disco:'ruido en disco',
    ruido_extraño:'ruido extraño',
    sobrecalentamiento:'sobrecalentamiento',
    lento_general:'funciona lento',
    sin_internet:'sin internet',
    wifi_se_corta:'Wi-Fi se corta',
    problema_red:'problema de red',
    impresora_fuera_linea:'impresora fuera de línea',
    atasco_papel:'atasco de papel',
    disco_lleno:'disco lleno',
    errores_disco:'errores de disco',
    camara_no_detectada:'cámara no detectada',
    microfono_bajo_o_mudo:'micrófono bajo o mudo',
    diagnostico_general:'diagnóstico general',
    problema_video:'problema de video',
  };
  return MAP[issueKey] || issueKey.replaceAll('_',' ');
}

// ============================================================================
// === FIN: Diagnóstico híbrido ===
// ============================================================================

// Helpers legacy de NLP (deprecated, se mantienen por compatibilidad)
function detectDevice(txt = '') {
  for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key;
  return null;
}
function detectIssue(txt = '') {
  for (const i of issueMatchers) if (i.rx.test(txt)) return i.key;
  return null;
}

// Template de respuesta por defecto (permite personalizar en JSON)
function tplDefault({ nombre = '', device = 'equipo', issueKey = null }) {
  const base = CHAT?.nlp?.response_templates?.default || 'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base.replace('{{nombre}}', nombre || '')
    .replace('{{device}}', device || 'equipo')
    .replace('{{issue_human}}', issueHuman(issueKey));
}

// ===== Store de sesiones (Redis u otro) =====
// getSession/saveSession/listActiveSessions están abstraídos en sessionStore.js
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== Estados del flujo conversacional =====
const STATES = {
  ASK_NAME: 'ASK_NAME',
  ASK_PROBLEM: 'ASK_PROBLEM',
  ASK_DEVICE: 'ASK_DEVICE',
  BASIC_TESTS: 'BASIC_TESTS',
  BASIC_TESTS_AI: 'BASIC_TESTS_AI',
  ADVANCED_TESTS: 'ADVANCED_TESTS',
  ESCALATE: 'ESCALATE'
};

// ===== Helpers de parseo de nombre =====
const nameRx = /(?:soy|llamo|nombre|me llaman?)\s+([a-záéíóúñ]{2,})/i;

// ===== Nombre: parser hiper-tolerante =====
const NAME_STOPWORDS = /^(omitir|hola|buenas|buenos|buenas\s*d[ií]as|buenas\s*tardes|buenas\s*noches|si|s[ií]|no|ok|dale|gracias|listo|ayuda|t[eé]cnico|quiero)$/i;

function capWord(w) {
  if (!w) return w;
  w = w.toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function extractName(txt = '') {
  let t = String(txt || '').trim();

  // Limpieza básica
  t = t.replace(/[“”«»]/g,'"').replace(/[’‘]/g,"'")
       .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]/g,' ')
       .replace(/\s+/g,' ').trim();

  if (!t) return null;

  // Frases típicas
  const m = t.match(/(?:\bsoy\b|\bme\s+llamo\b|\bmi\s+nombre\s+es\b|\bme\s+llaman\b)\s+([a-záéíóúñ'-]{2,})(?:\s+[a-záéíóúñ'-]{2,})?/i);
  if (m && m[1] && !NAME_STOPWORDS.test(m[1])) {
    return capWord(m[1]);
  }

  // Nombre “pelado” (1 palabra)
  const words = t.split(' ').filter(Boolean);
  if (words.length >= 1) {
    const w = words[0];
    if (!NAME_STOPWORDS.test(w) && /^[a-záéíóúñ'-]{2,20}$/i.test(w)) {
      return capWord(w);
    }
  }
  return null;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ===== Helpers de voseo y detección =====
const problemHint = /(no\s+(funciona|anda|detecta|reconoce|enciende|prende)|problema|error|falla|issue)/i;

function mapVoseoSafe(arr) {
  return arr.map(s => {
    let r = s.replace(/\bverifica\b/gi, 'verificá')
      .replace(/\bprueba\b/gi, 'probá')
      .replace(/\bintenta\b/gi, 'intentá')
      .replace(/\breinicia\b/gi, 'reiniciá')
      .replace(/\bconecta\b/gi, 'conectá')
      .replace(/\bdesconecta\b/gi, 'desconectá')
      .replace(/\bdesinstala\b/gi, 'desinstalá')
      .replace(/\binstala\b/gi, 'instalá')
      .replace(/\bactualiza\b/gi, 'actualizá')
      .replace(/\blimpia\b/gi, 'limpiá')
      .replace(/\bchequea\b/gi, 'chequeá')
      .replace(/\bcheca\b/gi, 'chequeá')
      .replace(/\bejec[uú]ta\b/gi, 'ejecutá')
      .replace(/\baplica\b/gi, 'aplicá')
      .replace(/\busá\b/gi, 'usá')
      .replace(/\busalo\b/gi, 'usalo')
      .replace(/\busalo\b/gi, 'usalo')
      .replace(/\bsigue\b/gi, 'seguí')
      .replace(/\bcontinua\b/gi, 'continuá')
      .replace(/\baseg[uú]rate\b/gi, 'asegurate')
      .replace(/\bcambia\b/gi, 'cambiá')
      .replace(/\bmant[eé]n\b/gi, 'mantené')
      .replace(/\bquita\b/gi, 'quitá')
      .replace(/\bretira\b/gi, 'retirá')
      .replace(/\brev[ií]sa\b/gi, 'revisá')
      .replace(/\brespondé\b/gi, 'respondé')
      .replace(/\bconf[ií]rma\b/gi, 'confirmá')
      .replace(/\babre\b/gi, 'abrí')
      .replace(/\bcierra\b/gi, 'cerrá')
      .replace(/\bguarda\b/gi, 'guardá')
      .replace(/\bsube\b/gi, 'subí')
      .replace(/\bbaja\b/gi, 'bajá')
      .replace(/\bdesactiva\b/gi, 'desactivá')
      .replace(/\bactiva\b/gi, 'activá')
      .replace(/\bentra\b/gi, 'entrá')
      .replace(/\bsal\b/gi, 'salí')
      .replace(/\bvac[ií]a\b/gi, 'vaciá')
      .replace(/\blibera\b/gi, 'liberá')
      .replace(/\bmov[eé]\b/gi, 'mové')
      .replace(/\bconsidera\b/gi, 'considerá')
      .replace(/\beval[uú]a\b/gi, 'evaluá')
      .replace(/\btestea\b/gi, 'testeá')
      .replace(/\bolv[ií]da\b/gi, 'olvidá')
      .replace(/\brenueva\b/gi, 'renová')
      .replace(/\bac[ée]rcate\b/gi, 'acercate')
      .replace(/\bpone\b/gi, 'poné')
      .replace(/\bhace\b/gi, 'hacé')
      .replace(/\bapag[aá]\b/gi, 'apagá')
      .replace(/\bencend[eé]\b/gi, 'encendé')
      .replace(/\blocaliza\b/gi, 'localizá')
      .replace(/\brespald[aá]\b/gi, 'respaldá')
      .replace(/\bresete[aá]\b/gi, 'reseteá')
      .replace(/\bmir[aá]\b/gi, 'mirá')
      .replace(/\bconectá\b/gi, 'conectá');
    return r;
  });
}

// ===== Helper de quick AI tests (legacy, puede reemplazarse por getBasicSteps) =====
async function aiQuickTests(problem, device) {
  if (!openai) return [];
  try {
    const prompt = `Dame 3-4 pasos rápidos en español para diagnosticar: ${problem} en ${device}. Solo los pasos, numerados, sin intro.`;
    const res = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const txt = res.choices[0]?.message?.content || '';
    return txt.split('\n').filter(x => /^\d+\./.test(x.trim())).map(x => x.replace(/^\d+\.\s*/, ''));
  } catch (e) {
    console.error('[aiQuickTests] error:', e.message);
    return [];
  }
}

// ===== Helpers de opciones y respuesta =====
function withOptions(obj) {
  const std = ['Sí, se solucionó ✅', 'No, sigue igual ❌', 'Avanzadas 🔧'];
  if (obj.options && obj.options.length) return obj;
  return { ...obj, options: std };
}

// ===== App =====
const app = express();

// ===== Middleware: extrae sessionId de header o genera uno nuevo =====
app.use((req, res, next) => {
  const sid = req.headers['x-session-id'] || req.headers['sid'] || `sess-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  req.sessionId = sid;
  next();
});
app.set('trust proxy', 1); // Confía en cabeceras de proxy (Render/NGINX) para IP real

// CORS fuerte + OPTIONS handler (preflight)
app.use(cors({
  origin: true, // Permite cualquier origen (o ajustá a tu dominio)
  credentials: true, // Permite cookies/headers de auth
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh'] // headers custom
}));
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh']
}));

// Body parsers (JSON + urlencoded)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// No cache global (evita que proxies sirvan saludos viejos)
app.use((req, res, next) => {
  res.set('Cache-Control','no-store');
  next();
});

// Landing amigable (útil para verificar deploy vivo)
app.get('/', (_req, res) => {
  res.type('html').send(`
<!doctype html>
<html><head><meta charset="utf-8"><title>STI Chat API</title></head>
<body style="font-family:system-ui;max-width:600px;margin:50px auto;padding:20px;">
<h1>🤖 STI Chat Backend V4.8.4</h1>
<p>Servicio en línea. Endpoints útiles:</p>
<ul>
  <li><code>GET  /api/health</code> → Health check</li>
  <li><code>POST /api/greeting</code> → Inicia conversación (resetea sesión)</li>
  <li><code>POST /api/chat</code> → Envía mensaje</li>
  <li><code>GET  /api/sessions</code> → Listar sesiones activas (debug)</li>
  <li><code>POST /api/reset</code> → Resetear sesión actual</li>
  <li><code>GET  /api/transcript/:sid</code> → Ver transcript de sesión</li>
  <li><code>POST /api/reload</code> → Recarga config (sti-chat.json)</li>
</ul>
</body></html>
  `);
});

// Health check (para monitoreo de Render, Docker, K8s, etc.)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sti-chat', version: '4.8.4', uptime: process.uptime() });
});

// Endpoint reload: recarga sti-chat.json en caliente (útil para cambios sin reiniciar)
app.all('/api/reload', (_req, res) => {
  loadChat();
  res.json({ ok: true, msg: 'Config reloaded', version: CHAT.version });
});

// Reset de sesión: útil para botón "Nueva conversación" en el front
app.post('/api/reset', async (req, res) => {
  const sid = req.sessionId;
  const empty = {
    id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null,
    tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[], fallbackCount:0, waEligible:false,
    transcript:[], pendingUtterance:null
  };
  await saveSession(sid, empty);
  res.json({ ok: true });
});

// ====== GREETING CON REINICIO FORZADO DE SESIÓN ======
// Siempre arranca "limpio": resetea sesión y devuelve el saludo con pedido de nombre
app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;
    // Crea SIEMPRE una sesión fresca (evita estados pegados)
    const fresh = {
      id: sid, userName: null, stage: STATES.ASK_NAME, device: null, problem: null, issueKey: null,
      tests: { basic: [], advanced: [], ai: [] }, stepsDone: [], fallbackCount: 0, waEligible: false,
      transcript: [], pendingUtterance: null
    };
    // Texto configurable desde JSON; fallback literal
    const text = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    fresh.transcript.push({ who: 'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  } catch (e) {
    console.error('[api/greeting RESET] error:', e);
    const text = '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  }
});

// Chat principal: corazón del flujo conversacional
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const t = String(text).trim();
    const sid = req.sessionId;

    // Carga o crea sesión si no existe (primer mensaje)
    let session = await getSession(sid);
    if (!session) {
      session = {
        id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null,
        tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[], fallbackCount:0, waEligible:false,
        transcript:[], pendingUtterance:null
      };
      console.log(`[api/chat] ✨ Nueva sesión: ${sid}`);
    }

    // Log del usuario en transcript (memoria de la conversación)
    session.transcript.push({ who: 'user', text: t, ts: nowIso() });

    // Detección inline de nombre en el mismo mensaje (e.g., "hola, me llamo X")
    const nmInline = extractName(t);
    if (nmInline && !session.userName) {
      session.userName = cap(nmInline);
      
if (session.stage === STATES.ASK_NAME) {
  try { console.log('[ASK_NAME] input:', t); } catch {}

  // Si describen problema antes del nombre, guardalo temporalmente
  if (!session.userName && problemHint.test(t) && !extractName(t)) {
    session.pendingUtterance = t;
  }

  if (!session.userName) {
    if (/^omitir$/i.test(t)) {
      session.userName = 'usuario';
    } else {
      const nm = extractName(t);
      if (nm) session.userName = nm;
    }
  }

  if (!session.userName) {
    reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas" o escribí tu nombre)';
  } else {
    session.stage = STATES.ASK_PROBLEM;

    if (session.pendingUtterance) {
      session.problem = session.pendingUtterance;
      session.pendingUtterance = null;
      session.stage = STATES.ASK_DEVICE;
      options = ['PC','Notebook','Teclado','Mouse','Monitor','Internet / Wi-Fi'];
      reply = `¡Genial, ${session.userName}! 👍\n\nAnoté: "${session.problem}".\n¿En qué equipo te pasa?`;
    } else {
      reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
    }
  }
}

    }

    let reply = '';
    let options = [];

    // ===== 1) Estado: pedir nombre =====
    if (session.stage === STATES.ASK_NAME) {
      // Si describe problema antes del nombre, guardamos para retomarlo
      if (problemHint.test(t) && !extractName(t)) session.pendingUtterance = t;

      // Detección de nombre u "omitir"
      const name = extractName(t);
      if (/^omitir$/i.test(t)) {
        session.userName = session.userName || 'usuario';
      } else if (!session.userName && name) {
        session.userName = cap(name);
      }

      // Si aún no tenemos nombre, re-preguntamos
      if (!session.userName) {
        reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")';
      } else {
        // Tenemos nombre → pasamos a pedir problema
        session.stage = STATES.ASK_PROBLEM;
        if (session.pendingUtterance) {
          // Si ya había contado el problema, lo retomamos y pedimos equipo
          session.problem = session.pendingUtterance;
          session.pendingUtterance = null;
          session.stage = STATES.ASK_DEVICE;
          options = ['PC','Notebook','Teclado','Mouse','Monitor','Internet / Wi-Fi'];
          reply = `Perfecto, ${session.userName}. Anoté: "${session.problem}".\n\n¿En qué equipo te pasa?`;
        } else {
          reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        }
      }
    }
    // ===== 2) Estado: pedir problema (USA DIAGNÓSTICO HÍBRIDO) =====
    else if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = t || session.problem;

      try {
        // Usa el diagnóstico híbrido (local + OpenAI opcional)
        const diag = await analyzeProblemHybrid(session.problem);
        
        // Si confianza >= 0.65 y tenemos issue/device → pasos básicos directo
        if (diag.confidence >= 0.65 && (diag.issueKey || diag.device)) {
          session.device = session.device || diag.device || 'equipo';
          session.issueKey = diag.issueKey || session.issueKey || null;
          session.stage = STATES.BASIC_TESTS;

          const steps = getBasicSteps(session.issueKey, session.device);
          const stepsAr = mapVoseoSafe(steps.slice(0, 4)); // primeros 4 pasos

          const intro = `Entiendo, ${session.userName}. Probemos esto primero:`;
          const footer = [
            '',
            '🧩 ¿Se solucionó?',
            'Si no, puedo ofrecerte algunas **pruebas más avanzadas**.',
            '',
            'Decime: **"sí"**, **"no"** o **"avanzadas"**.'
          ].join('\n');

          session.tests.basic = stepsAr;
          session.stepsDone.push('basic_tests_shown');
          session.waEligible = true;

          const fullMsg = intro + '\n\n• ' + stepsAr.join('\n• ') + '\n' + footer;
          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);

          // Guarda en transcript .txt
          try {
            const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
            fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${intro}\n`);
            stepsAr.forEach(s => fs.appendFileSync(tf, `  - ${s}\n`));
            fs.appendFileSync(tf, `\n${footer}\n`);
          } catch (e) {
            console.error('[transcript write] error:', e.message);
          }

          return res.json({
            ok: true,
            reply: fullMsg,
            steps: stepsAr,
            stepsType: 'basic',
            options: ['Sí, se solucionó ✅', 'No, sigue igual ❌', 'Avanzadas 🔧', 'WhatsApp'],
            stage: session.stage,
            allowWhatsapp: true
          });
        }

        // Si no hay confianza suficiente → pedimos equipo (sin perder el problema)
        session.stage = STATES.ASK_DEVICE;
        const msg = `Enseguida te ayudo con ese problema 🔍\n\n` +
          `Perfecto, ${session.userName}. Anoté: "${session.problem}".\n\n` +
          `¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        await saveSession(sid, session);
        return res.json({
          ok: true,
          reply: msg,
          options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi']
        });

      } catch (err) {
        console.error('diagnóstico ASK_PROBLEM híbrido:', err);
        return res.json({
          ok: true,
          reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo en un momento.'
        });
      }
    }
    // ===== 3) Estado: pedir equipo y derivar a tests =====
    else if (session.stage === STATES.ASK_DEVICE || !session.device) {
      // Usa detectDeviceHeuristics o limpia texto
      const dev = detectDeviceHeuristics(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      
      if (dev && dev.length >= 2) {
        session.device = dev;

        // Re-analiza con diagnóstico híbrido (ahora con device + problem)
        const fullText = `${session.problem || ''} ${t}`.trim();
        const diag = await analyzeProblemHybrid(fullText);

        if (diag.issueKey) {
          // Tenemos issue → pasos básicos
          session.issueKey = diag.issueKey;
          session.stage = STATES.BASIC_TESTS;

          const pasos = getBasicSteps(session.issueKey, session.device);
          const pasosAr = mapVoseoSafe(pasos.slice(0, 3));

          reply = `Entiendo, ${session.userName}. Tu **${session.device}** tiene el problema: ${issueHuman(session.issueKey)} 🔍\n\n`;
          reply += `🔧 **Probá estos pasos básicos:**\n\n`;
          pasosAr.forEach((p, i) => {
            reply += `${i + 1}. ${p}\n`;
          });

          // Pie unificado
          reply += `\n🧩 ¿Se solucionó?\n`;
          reply += `Si no, puedo ofrecerte algunas **pruebas más avanzadas**.\n\n`;
          reply += `Decime: **"sí"** o **"no"**.\n`;

          session.tests.basic = pasosAr;
          session.stepsDone.push('basic_tests_shown');
          options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
          session.waEligible = true;

        } else {
          // No hay issue claro → pasos genéricos
          session.stage = STATES.BASIC_TESTS_AI;
          const pasos = getBasicSteps('diagnostico_general', session.device);
          const pasosAr = mapVoseoSafe(pasos.slice(0, 3));

          reply = `Entiendo, ${session.userName}. Probemos esto rápido 🔍\n\n`;
          reply += `🔧 **Pasos iniciales:**\n\n`;
          pasosAr.forEach(s => reply += `• ${s}\n`);

          // Pie unificado
          reply += `\n🧩 ¿Se solucionó?\n`;
          reply += `Si no, puedo ofrecerte algunas **pruebas más avanzadas**.\n\n`;
          reply += `Decime: **"sí"**, **"no"** o **"avanzadas"**.\n`;

          session.tests.ai = pasosAr;
          session.stepsDone.push('ai_basic_shown');
          session.waEligible = true;
          options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
        }
      } else {
        // Si no reconoce el equipo, ofrece opciones clicables
        reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'];
      }
    }
    // ===== 4) Estados de pruebas y escalación =====
    else {
      // --- manejo explícito de "sí / no / avanzadas" luego del pie ---
      const rxYes = /\b(s[ií]|sí se solucion[oó]|se solucion[oó]|funcion[oó]|ya anda|listo funcion[oó])\b/i;
      const rxNo = /\b(no|todav[ií]a no|no funcion[oó]|sigue igual|no cambi[oó]|tampoco)\b/i;
      const rxAdv = /\b(avanzadas?|m[aá]s pruebas|pruebas t[eé]cnicas|continuar|seguir)\b/i;

      if (rxYes.test(t)) {
        // Cierre amable + CTA WhatsApp
        reply = `¡Excelente, ${session.userName}! 🙌\n`;
        reply += `Me alegra que se haya solucionado 💪\n`;
        reply += `Si vuelve a ocurrir o necesitás revisar otro equipo, podés contactarnos nuevamente cuando quieras.\n\n`;
        reply += `¡Gracias por confiar en STI! ⚡\n\n`;
        reply += `Si querés hacerle algún comentario al cuerpo técnico, pulsá el botón verde y se enviará un ticket por WhatsApp con esta conversación.\n`;
        reply += `Enviá el mensaje sin modificarlo, y luego podés hacer el comentario que quieras. 📨`;
        options = ['WhatsApp'];
        session.stage = STATES.ESCALATE;
        session.waEligible = true;

      } else if (rxNo.test(t)) {
        session.stepsDone.push('user_says_not_working');
        const triedAdv = (session.stage === STATES.ADVANCED_TESTS);
        const noCount = session.stepsDone.filter(x => x === 'user_says_not_working').length;
        
        const adv = getBasicSteps(session.issueKey, session.device).slice(3, 6);
        const advAr = mapVoseoSafe(adv);

        if (triedAdv || noCount >= 2 || advAr.length === 0) {
          session.stage = STATES.ESCALATE;
          session.waEligible = true;
          reply = 'Entiendo. Te paso con un técnico para ayudarte personalmente. Tocá el botón verde y se enviará un ticket con esta conversación para agilizar la atención.';
          options = ['WhatsApp'];
        } else {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = advAr;
          reply = `Entiendo, ${session.userName} 😔\nEntonces vamos a hacer unas **pruebas más avanzadas** para tratar de solucionarlo. 🔍\n\n`;
          advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','WhatsApp'];
        }

      } else if (rxAdv.test(t)) {
        // Ir directo a avanzadas
        const adv = getBasicSteps(session.issueKey, session.device).slice(3, 6);
        const advAr = mapVoseoSafe(adv);
        
        if (advAr.length > 0) {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = advAr;
          reply = `Perfecto 👍\n`;
          reply += `Te muestro las **pruebas más avanzadas** para este caso:\n\n`;
          advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','WhatsApp'];
        } else {
          reply = 'No tengo más pasos automáticos para este caso. Te paso con un técnico para seguimiento por WhatsApp.';
          session.waEligible = true;
          options = ['WhatsApp'];
          session.stage = STATES.ESCALATE;
        }

      // Petición directa de derivación a humano/WhatsApp (atajo)
      } else if (/\b(whatsapp|t[ée]cnico|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = '✅ Te preparo un ticket con el historial para WhatsApp.';
        options = ['Enviar a WhatsApp (con ticket)'];

      // Confirmación genérica "ok/dale/listo/probé" → intenta avanzar a avanzadas si corresponde
      } else if (/\b(dale|ok|bueno|joya|b[áa]rbaro|listo|perfecto|prob[ée]|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        if (session.stage === STATES.BASIC_TESTS && ((session.tests.basic || []).length >= 2 || (session.tests.ai || []).length >= 2)) {
          const adv = getBasicSteps(session.issueKey, session.device).slice(3, 6);
          const advAr = mapVoseoSafe(adv);
          
          if (advAr.length > 0) {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true;
            options = ['Volver a básicas','WhatsApp'];
          } else {
            reply = '👍 Perfecto. Si persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['WhatsApp'];
          }
        } else {
          reply = '👍 Perfecto. ¿Alguno de esos pasos ayudó?';
          options = ['Pasar a avanzadas','WhatsApp'];
        }

      // Mensaje genérico de loop cuando espera acción del usuario
      } else {
        reply = `Recordá que estamos revisando tu **${session.device || 'equipo'}** por ${issueHuman(session.issueKey)} 🔍\n\n` +
          `¿Probaste los pasos que te sugerí?\n\n` +
          'Decime:\n• **"sí"** si los probaste\n• **"no"** si no funcionaron\n• **"avanzadas"** para ver más pruebas\n• **"ayuda"** para hablar con un técnico';
        options = ['Avanzadas 🔧','WhatsApp'];
      }
    }

    // Persistencia del mensaje del bot
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);

    // Guarda en archivo .txt para auditoría
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`);
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`);
    } catch (e) {
      console.warn('[transcript] no pude escribir:', e.message);
    }

    // Arma respuesta HTTP
    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;

    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({
      ok: true,
      reply: '😅 Tuve un problema momentáneo. Probá de nuevo.'
    }));
  }
});

// Listar sesiones activas (debug/admin)
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// Endpoint de transcript (ver historial de una sesión)
app.get('/api/transcript/:sid', async (req, res) => {
  const { sid } = req.params;
  try {
    const filePath = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Transcript no encontrado' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    console.error('[api/transcript] error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});




// ====== WHATSAPP TICKET ======
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const sid = req.sessionId;
    const session = await getSession(sid);
    if (!session) return res.status(200).json({ ok:false, error:'No hay sesión activa.' });
    if (!session.transcript || session.transcript.length === 0) {
      return res.status(200).json({ ok:false, error:'No hay historial para adjuntar.' });
    }

    const d = new Date();
    const y = String(d.getFullYear());
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const shortSid = String(sid).slice(-4).toUpperCase();
    const ticketId = `TCK-${y}${m}${day}-${shortSid}`;

    const header = [
      `STI • Servicio Técnico Inteligente — Ticket ${ticketId}`,
      `Generado: ${nowIso()}`,
      `Session: ${sid}`,
      '',
      '=== RESUMEN ===',
      `Nombre: ${session.userName || '-'}`,
      `Equipo: ${session.device || '-'}`,
      `Problema: ${session.problem || '-'}`,
      `IssueKey: ${session.issueKey || '-'}`,
      '',
      '=== HISTORIAL DE CONVERSACIÓN ==='
    ].join('\n');

    const hist = session.transcript.map(t =>
      `[${t.ts}] ${t.who === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`
    ).join('\n');

    const body = header + '\n' + hist + '\n';
    try { fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), body, 'utf8'); } catch {}

    const baseUrl = (PUBLIC_BASE_URL || '').replace(/\/+$/,'');
    const ticketUrl = `${baseUrl}/ticket/${ticketId}`;

    const waText = 
      `Hola 👋 Quiero soporte técnico.\n` +
      `Ticket: ${ticketId}\n` +
      `${ticketUrl}\n\n` +
      `Mi nombre: ${session.userName || '-'}\n` +
      `Equipo: ${session.device || '-'}\n` +
      `Problema: ${session.problem || '-'}`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

    return res.json({ ok:true, ticketId, ticketUrl, url: waUrl });
  } catch (e) {
    console.error('[api/whatsapp-ticket] error:', e);
    return res.status(200).json({ ok:false, error:'No pude generar el ticket ahora.' });
  }
});

// ===== Vista pública del ticket =====
app.get('/ticket/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/[^A-Z0-9\-]/gi,'');
    const filePath = path.join(TICKETS_DIR, `${id}.txt`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).type('text/plain').send('Ticket no encontrado.');
    }
    const txt = fs.readFileSync(filePath, 'utf8');
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${id} • STI</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;max-width:900px;margin:32px auto;padding:16px">
<h1>📄 ${id}</h1>
<p><a href="/">Volver</a></p>
<pre style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #e5e7eb;padding:16px;border-radius:8px;">${
  (txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'))
}</pre>
</body></html>`);
  } catch (e) {
    console.error('[GET /ticket/:id] error:', e);
    res.status(500).type('text/plain').send('Error interno.');
  }
});




// ===== Server =====
const PORT = process.env.PORT || 3001; // Puerto (Render suele inyectar PORT)

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 [STI Chat V4.8.4-DiagnosticoHíbrido] Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log('='.repeat(60) + '\n');
});
