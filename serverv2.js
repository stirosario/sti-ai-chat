/**
 * serverv2.js — STI Chat (v2) — Configuración Inicial
 * 
 * Este archivo contiene SOLO la configuración inicial del servidor:
 * - Imports de librerías esenciales
 * - Variables de entorno y constantes
 * - Configuración de directorios
 * - Inicialización de Express
 * - Middlewares de seguridad y rendimiento
 * - Health check básico
 * - Graceful shutdown
 * 
 * ⚠️ IMPORTANTE: Este archivo NO contiene lógica del flujo conversacional.
 * NO incluye: handlers de stages, endpoints de chat, botones, textos, escalación, WhatsApp, etc.
 * 
 * El flujo conversacional se agregará posteriormente, función por función,
 * a medida que se valide que cada parte funciona correctamente.
 * 
 * Autor: STI AI Team
 * Fecha: 2025-01-XX
 */

// ========================================================
// 📦 IMPORTS - LIBRERÍAS EXTERNAS
// ========================================================

// dotenv/config: Carga las variables de entorno desde el archivo .env
// Esto permite usar process.env.VARIABLE_NAME para acceder a configuraciones
// Se debe crear un archivo .env en la raíz del proyecto con las variables necesarias
import 'dotenv/config';

// express: Framework web para Node.js que permite crear APIs y servidores HTTP
// Es la base de toda la aplicación, maneja rutas, middlewares y respuestas HTTP
import express from 'express';

// cors: Middleware para habilitar CORS (Cross-Origin Resource Sharing)
// Permite que el frontend (que corre en otro dominio/puerto) haga requests a este servidor
// Es esencial para aplicaciones web modernas donde frontend y backend están separados
import cors from 'cors';

// express-rate-limit: Middleware para limitar la cantidad de requests por IP
// Protege el servidor de abuso, ataques DDoS y sobrecarga de recursos
// Se configura con un límite de requests por ventana de tiempo (ej: 100 requests por 15 minutos)
import rateLimit from 'express-rate-limit';

// helmet: Middleware de seguridad que agrega headers HTTP de seguridad
// Protege contra XSS, clickjacking, MIME-type sniffing y otros ataques comunes
// Se debe usar SIEMPRE en producción para proteger la aplicación
import helmet from 'helmet';

// pino: Logger de alto rendimiento para Node.js
// Permite registrar eventos, errores y información de debugging
// Más rápido y eficiente que console.log en producción
import pino from 'pino';

// pino-http: Middleware para integrar pino con Express
// Registra automáticamente todas las requests HTTP con información útil
// (método, URL, status code, tiempo de respuesta, etc.)
import pinoHttp from 'pino-http';

// fs: Módulo nativo de Node.js para operaciones con el sistema de archivos
// Permite leer, escribir, crear y eliminar archivos y carpetas
// Se usa para guardar logs, transcripts, tickets y otros datos persistentes
import fs from 'fs';

// path: Módulo nativo de Node.js para trabajar con rutas de archivos
// Permite construir rutas de forma segura independientemente del sistema operativo
// Evita problemas con separadores de ruta (/ vs \) y rutas relativas/absolutas
import path from 'path';

// crypto: Módulo nativo de Node.js para funciones criptográficas
// Se usa para generar tokens seguros, hashes y valores aleatorios
// Esencial para seguridad: tokens de autenticación, IDs de sesión, etc.
import crypto from 'crypto';

// compression: Middleware de Express para comprimir respuestas HTTP
// Reduce el tamaño de las respuestas usando gzip o brotli
// Mejora significativamente el rendimiento al reducir el ancho de banda
import compression from 'compression';

// ========================================================
// 📁 CONFIGURACIÓN DE DIRECTORIOS
// ========================================================

// DATA_BASE: Directorio base donde se guardan todos los datos de la aplicación
// Se puede configurar con la variable de entorno DATA_BASE
// Si no está configurada, usa '/data' como valor por defecto
// En Windows, esto sería algo como 'C:\data' o puedes usar rutas relativas
const DATA_BASE = process.env.DATA_BASE || '/data';

// TRANSCRIPTS_DIR: Carpeta donde se guardan los transcripts (conversaciones)
// Los transcripts son archivos JSON y TXT que contienen el historial completo de cada chat
// Se usa para análisis, debugging y cumplimiento legal (historial de conversaciones)
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');

// TICKETS_DIR: Carpeta donde se guardan los tickets de soporte
// Un ticket se crea cuando el usuario necesita hablar con un técnico humano
// Cada ticket contiene información del problema, usuario, dispositivo, etc.
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');

// LOGS_DIR: Carpeta donde se guardan los archivos de log del servidor
// Los logs registran eventos importantes: errores, requests, operaciones críticas
// Se usa para debugging y monitoreo del servidor en producción
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');

// UPLOADS_DIR: Carpeta donde se guardan las imágenes subidas por los usuarios
// Los usuarios pueden adjuntar fotos de sus problemas técnicos
// Las imágenes se procesan, comprimen y almacenan aquí para análisis
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_BASE, 'uploads');

// LOG_FILE: Ruta completa al archivo de log principal
// Todos los logs del servidor se escriben aquí en formato texto
// Se puede rotar (log rotation) para evitar que el archivo crezca demasiado
const LOG_FILE = path.join(LOGS_DIR, 'server.log');

// Crear todos los directorios necesarios si no existen
// fs.mkdirSync crea las carpetas de forma recursiva (incluye las carpetas padre si faltan)
// El try/catch evita errores si las carpetas ya existen o si hay problemas de permisos
// Esta operación es síncrona porque es crítica: el servidor no puede funcionar sin estas carpetas
for (const dir of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR, UPLOADS_DIR]) {
  try {
    // recursive: true crea todas las carpetas padre necesarias
    // Si DATA_BASE no existe, la crea; luego crea transcripts, tickets, etc.
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[INIT] ✅ Directorio creado/verificado: ${dir}`);
  } catch (error) {
    // Si hay un error (permisos, disco lleno, etc.), lo registramos pero no detenemos el servidor
    // En producción, esto podría causar problemas, pero preferimos que el servidor arranque
    // y falle después con un error más claro cuando intente escribir archivos
    console.error(`[INIT] ❌ Error creando directorio ${dir}:`, error.message);
  }
}

// ========================================================
// 🔐 CONFIGURACIÓN DE SEGURIDAD
// ========================================================

// LOG_TOKEN: Token secreto para proteger endpoints administrativos (logs, métricas)
// Se usa para autenticar requests a endpoints sensibles como /api/logs
// Sin este token, cualquiera podría acceder a información confidencial del servidor
// Se puede configurar con LOG_TOKEN o SSE_TOKEN en el archivo .env
let LOG_TOKEN = process.env.LOG_TOKEN || process.env.SSE_TOKEN;

// Validación de LOG_TOKEN en producción
// En producción, el token es OBLIGATORIO por seguridad
// Si no está configurado, el servidor NO debe arrancar
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION) {
  // Si estamos en producción y no hay token, detener el servidor
  if (!LOG_TOKEN) {
    console.error('\n' + '='.repeat(80));
    console.error('[SECURITY CRITICAL] ❌ LOG_TOKEN REQUIRED IN PRODUCTION!');
    console.error('[SECURITY] El servidor no arrancará sin LOG_TOKEN configurado.');
    console.error('[SECURITY]');
    console.error('[SECURITY] Para solucionarlo: Agrega a tu archivo .env:');
    console.error('[SECURITY] LOG_TOKEN=<tu-token-seguro-aleatorio>');
    console.error('[SECURITY]');
    console.error('[SECURITY] Generar token: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('='.repeat(80) + '\n');
    // process.exit(1) detiene el proceso de Node.js inmediatamente
    // Código 1 indica error (código 0 sería éxito)
    process.exit(1);
  }
  console.log('[SECURITY] ✅ LOG_TOKEN configurado (producción)');
} else {
  // En desarrollo, generar un token aleatorio temporal si no está configurado
  // Esto permite que el servidor arranque sin configuración, pero es solo para desarrollo
  if (!LOG_TOKEN) {
    // crypto.randomBytes genera bytes aleatorios seguros
    // toString('hex') los convierte a una cadena hexadecimal legible
    // 32 bytes = 64 caracteres hexadecimales = token muy seguro
    LOG_TOKEN = crypto.randomBytes(32).toString('hex');
    console.warn('\n' + '='.repeat(80));
    console.warn('[SECURITY] ⚠️  LOG_TOKEN NO CONFIGURADO (MODO DESARROLLO)');
    console.warn('[SECURITY] Se generó un token ALEATORIO solo para esta sesión.');
    console.warn('[SECURITY] Este token cambiará en cada reinicio del servidor!');
    console.warn('[SECURITY]');
    console.warn('[SECURITY] Para solucionarlo: Agrega a tu archivo .env:');
    console.warn('[SECURITY] LOG_TOKEN=<token-generado-arriba>');
    console.warn('[SECURITY] (Token no mostrado por seguridad)');
    console.warn('='.repeat(80) + '\n');
  }
}

// Guardar el token en un archivo (solo en desarrollo, NUNCA en producción)
// Esto permite que herramientas administrativas lean el token sin exponerlo en logs
// El modo 0o600 significa: solo el dueño puede leer/escribir (sin permisos para otros)
if (process.env.NODE_ENV !== 'production') {
  try {
    const tokenPath = path.join(LOGS_DIR, 'log_token.txt');
    // Intentar escribir con permisos restrictivos primero (0o600)
    // Si falla (por ejemplo en Windows), intentar sin especificar permisos
    try {
      fs.writeFileSync(tokenPath, LOG_TOKEN, { mode: 0o600 });
    } catch (e) {
      fs.writeFileSync(tokenPath, LOG_TOKEN);
    }
    console.log(`[SECURITY] ✅ Token de log guardado en: ${tokenPath} (solo desarrollo)`);
  } catch (error) {
    console.error('[SECURITY] ⚠️  No se pudo guardar el token en archivo:', error.message);
  }
}

// ========================================================
// 🌐 CONFIGURACIÓN CORS (Cross-Origin Resource Sharing)
// ========================================================

// ALLOWED_ORIGINS: Lista de dominios permitidos para hacer requests a este servidor
// CORS es un mecanismo de seguridad del navegador que bloquea requests entre dominios diferentes
// Por ejemplo, si el frontend está en https://stia.com.ar y el backend en https://api.stia.com.ar,
// el navegador requiere que el backend autorice explícitamente las requests desde el frontend
// 
// IMPORTANTE: En producción, DEBES configurar ALLOWED_ORIGINS con tus dominios reales
// Si no lo haces, el navegador bloqueará todas las requests del frontend
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      // Valores por defecto para desarrollo y producción
      'https://stia.com.ar',
      'https://www.stia.com.ar',
      'http://localhost:3000',      // Desarrollo local con Live Server
      'http://localhost:5500',      // Desarrollo local con VS Code Live Server
      'http://127.0.0.1:3000',      // IP local (alternativa a localhost)
      'http://127.0.0.1:5500'       // IP local (alternativa a localhost)
    ];

// Si estamos en desarrollo, agregar más orígenes comunes de desarrollo
if (!IS_PRODUCTION) {
  // En desarrollo, es más permisivo para facilitar el testing
  // En producción, solo debe incluir los dominios reales de producción
  ALLOWED_ORIGINS.push('http://127.0.0.1:3000', 'http://127.0.0.1:5500');
}

// Configuración de CORS para Express
// origin: Función que decide si un origen está permitido
//   - callback(null, true) = permitir
//   - callback(new Error(...)) = denegar
// credentials: true permite enviar cookies/autenticación en requests CORS
// optionsSuccessStatus: Código HTTP para respuestas OPTIONS exitosas (algunos navegadores antiguos usan 200)
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (aplicaciones móviles, Postman, curl, etc.)
    // Las aplicaciones nativas o herramientas de testing no envían header Origin
    if (!origin) {
      return callback(null, true);
    }

    // Verificar si el origen está en la lista de permitidos
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      // Origen permitido: continuar con la request
      callback(null, true);
    } else {
      // Origen NO permitido: bloquear la request
      console.warn(`[SECURITY] 🚫 CORS bloqueó origen: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,        // Permite cookies y autenticación en requests CORS
  optionsSuccessStatus: 200 // Algunos navegadores antiguos requieren código 200 para OPTIONS
};

// ========================================================
// 📊 CONFIGURACIÓN DE LOGGING
// ========================================================

// Configurar logger principal usando pino
// pino es un logger de alto rendimiento que es mucho más rápido que console.log
// En producción, los logs se pueden enviar a archivos, servicios externos (Elasticsearch, etc.)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',  // Nivel de log: 'debug', 'info', 'warn', 'error'
  transport: IS_PRODUCTION
    ? undefined  // En producción, usar salida estándar (stdout) para captura por sistemas de log
    : {
        // En desarrollo, usar formato bonito y coloreado para leer en consola
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
});

// Stream para escribir logs a archivo
// createWriteStream crea un stream que escribe datos de forma eficiente
// flags: 'a' = append (agregar al final del archivo, no sobrescribir)
// encoding: 'utf8' = codificación de caracteres UTF-8 (soporta acentos, emojis, etc.)
let logStream = null;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
  logger.info(`[INIT] ✅ Stream de logs inicializado: ${LOG_FILE}`);
} catch (error) {
  // Si no se puede crear el stream de logs, usar solo consola
  logger.error(`[INIT] ❌ Error creando stream de logs: ${error.message}`);
}

// ========================================================
// 🚀 INICIALIZACIÓN DE EXPRESS
// ========================================================

// Crear aplicación Express
// Express es el framework que maneja todas las requests HTTP (GET, POST, etc.)
// app es el objeto principal que configura rutas, middlewares y respuestas
const app = express();

// ========================================================
// 🛡️ MIDDLEWARES DE SEGURIDAD Y RENDIMIENTO
// ========================================================

// Helmet: Agrega headers de seguridad HTTP
// Protege contra:
//   - XSS (Cross-Site Scripting): inyectar código JavaScript malicioso
//   - Clickjacking: hacer clic en botones ocultos
//   - MIME-type sniffing: el navegador adivina el tipo de archivo (riesgo de seguridad)
//   - Y muchos otros ataques comunes
// 
// IMPORTANTE: Helmet está activo por defecto y es esencial en producción
app.use(helmet({
  // Deshabilitar CSP (Content Security Policy) estricto si usas scripts inline
  // En producción, deberías configurar CSP correctamente según tu frontend
  contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
  // Permitir iframes (necesario si el chat está embebido en un iframe)
  crossOriginEmbedderPolicy: false
}));

// CORS: Habilitar Cross-Origin Resource Sharing
// Sin esto, el navegador bloqueará todas las requests desde el frontend
// Es crítico que funcione correctamente o la aplicación no funcionará
app.use(cors(corsOptions));

// Compression: Comprimir respuestas HTTP
// Reduce el tamaño de las respuestas (JSON, HTML, etc.) usando gzip o brotli
// Mejora significativamente la velocidad, especialmente en conexiones lentas
// El navegador descomprime automáticamente, es transparente para el cliente
app.use(compression({
  // Comprimir solo si el tamaño es mayor a 1KB (no vale la pena para respuestas pequeñas)
  threshold: 1024,
  // Nivel de compresión: 6 es un buen balance entre velocidad y tamaño
  level: 6
}));

// express.json(): Parsear el body de requests con Content-Type: application/json
// Convierte automáticamente el JSON del body en un objeto JavaScript (req.body)
// Sin esto, req.body sería undefined y no podrías leer los datos enviados
app.use(express.json({
  limit: '10mb',        // Límite máximo de tamaño del body: 10MB
                        // Esto permite subir imágenes en base64 sin problemas
  strict: true          // Solo aceptar arrays y objetos JSON válidos (no primitivos como "hello")
}));

// express.urlencoded(): Parsear el body de requests con Content-Type: application/x-www-form-urlencoded
// Esto es para formularios HTML tradicionales (name=value&name2=value2)
// Aunque usamos principalmente JSON, algunos formularios antiguos pueden usar este formato
app.use(express.urlencoded({
  extended: true,       // Usar la librería 'qs' para parsing avanzado (soporta objetos anidados)
  limit: '10mb'         // Mismo límite que JSON
}));

// Rate Limiting: Limitar cantidad de requests por IP
// Protege contra:
//   - Ataques DDoS: muchos requests simultáneos que sobrecargan el servidor
//   - Brute force: intentar adivinar passwords o tokens
//   - Abuso de API: usar demasiados recursos del servidor
//
// Configuración:
//   - windowMs: Ventana de tiempo en milisegundos (15 minutos)
//   - max: Máximo de requests permitidos en esa ventana
//   - message: Mensaje de error cuando se excede el límite
//   - standardHeaders: Agregar headers estándar HTTP con información del límite
//   - legacyHeaders: Headers antiguos para compatibilidad
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos = 15 * 60 * 1000 milisegundos
  max: 100,                   // Máximo 100 requests por IP cada 15 minutos
  message: {
    ok: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,      // Agregar header 'RateLimit-*' con información del límite
  legacyHeaders: false        // NO usar header 'X-RateLimit-*' (deprecado)
});

// Aplicar rate limiting a todas las rutas (excepto health check)
// IMPORTANTE: No aplicar a /api/health porque los monitores lo llaman frecuentemente
app.use((req, res, next) => {
  // Si la ruta es /api/health, saltar el rate limiting
  if (req.path === '/api/health') {
    return next();
  }
  // Para todas las demás rutas, aplicar el límite
  limiter(req, res, next);
});

// Logger HTTP: Registrar todas las requests automáticamente
// Esto crea logs de cada request HTTP con información útil:
//   - Método (GET, POST, etc.)
//   - URL
//   - Status code de respuesta
//   - Tiempo de respuesta
//   - IP del cliente
app.use(pinoHttp({
  logger: logger,       // Usar el logger de pino configurado arriba
  autoLogging: {
    ignore: (req) => {
      // NO registrar requests a /api/health (son muy frecuentes y ruidosos)
      return req.url === '/api/health';
    }
  }
}));

// ========================================================
// 🏥 HEALTH CHECK ENDPOINT
// ========================================================

// GET /api/health: Endpoint para verificar que el servidor está funcionando
// Se usa para:
//   - Monitoreo: sistemas externos verifican que el servidor está vivo
//   - Load balancers: verificar si el servidor puede recibir tráfico
//   - Debugging: verificar rápidamente el estado del servidor
//
// Este endpoint NO requiere autenticación y es público
// No devuelve información sensible, solo estado básico del servidor
app.get('/api/health', async (req, res) => {
  try {
    // Obtener información básica del sistema
    const uptime = process.uptime();           // Tiempo que el servidor lleva corriendo (segundos)
    const memory = process.memoryUsage();      // Uso de memoria (heap, RSS, etc.)

    // Construir respuesta de health check
    const health = {
      ok: true,                                 // El servidor está funcionando
      status: 'healthy',                        // Estado: healthy, degraded, error
      timestamp: new Date().toISOString(),      // Timestamp de la verificación
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,  // Uptime legible
      uptimeSeconds: Math.floor(uptime),       // Uptime en segundos (para monitoreo)
      memory: {
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,      // Memoria heap usada
        heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,    // Memoria heap total
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)}MB`                 // Resident Set Size (memoria física)
      },
      version: '2.0.0'                         // Versión de la API
    };

    // Responder con código 200 (OK) y el objeto de health
    res.status(200).json(health);
  } catch (error) {
    // Si hay un error al generar el health check, responder con error 500
    logger.error('[HEALTH] Error en health check:', error);
    res.status(500).json({
      ok: false,
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================================
// 🌐 SERVIDOR DE ARCHIVOS ESTÁTICOS
// ========================================================

// Servir archivos estáticos desde la carpeta 'public'
// Los archivos estáticos son: HTML, CSS, JavaScript, imágenes, etc. del frontend
// Cuando alguien accede a /index.html, Express busca en la carpeta public/index.html
//
// IMPORTANTE: Esta carpeta debe contener el frontend del chat
// Si no existe, el servidor arrancará pero no servirá archivos
app.use(express.static('public', {
  maxAge: IS_PRODUCTION ? '1d' : '0',  // Cache en producción: 1 día (mejora rendimiento)
                                        // En desarrollo: sin cache (para ver cambios inmediatamente)
  etag: true                            // Habilitar ETags para validación de cache
}));

// Ruta raíz: servir index.html cuando alguien accede a /
// Esto es para que cuando accedas a https://tudominio.com, veas el chat
app.get('/', (req, res) => {
  try {
    // Enviar el archivo index.html desde la carpeta public
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  } catch (error) {
    // Si el archivo no existe, responder con error 404
    logger.error('[ROOT] Error sirviendo index.html:', error);
    res.status(404).json({
      ok: false,
      error: 'Frontend not found. Please ensure public/index.html exists.'
    });
  }
});

// ========================================================
// 🚀 INICIAR EL SERVIDOR
// ========================================================

// PORT: Puerto donde el servidor escuchará requests HTTP
// Se puede configurar con la variable de entorno PORT
// Si no está configurada, usa 3001 como valor por defecto
// 
// IMPORTANTE: En producción, generalmente se usa el puerto 80 (HTTP) o 443 (HTTPS)
// Los servicios de hosting (Render, Heroku, etc.) suelen asignar el puerto automáticamente
const PORT = process.env.PORT || 3001;

// Iniciar el servidor HTTP
// app.listen inicia el servidor y lo pone a "escuchar" requests en el puerto especificado
// El segundo parámetro es un callback que se ejecuta cuando el servidor está listo
const server = app.listen(PORT, () => {
  // Mensajes de inicio
  console.log('\n' + '='.repeat(80));
  console.log(`🚀 STI Chat Server v2.0 iniciado en puerto ${PORT}`);
  console.log('='.repeat(80));
  console.log(`📁 Directorios:`);
  console.log(`   - Base: ${DATA_BASE}`);
  console.log(`   - Transcripts: ${TRANSCRIPTS_DIR}`);
  console.log(`   - Tickets: ${TICKETS_DIR}`);
  console.log(`   - Logs: ${LOGS_DIR}`);
  console.log(`   - Uploads: ${UPLOADS_DIR}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📝 Logs: ${LOG_FILE}`);
  console.log(`🔐 Modo: ${IS_PRODUCTION ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('='.repeat(80) + '\n');

  // Registrar en el logger también
  logger.info(`Servidor iniciado en puerto ${PORT}`);
  logger.info(`Modo: ${IS_PRODUCTION ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
});

// Configurar timeouts del servidor HTTP
// keepAliveTimeout: Tiempo que el servidor mantiene la conexión abierta esperando más requests
// 65 segundos es un buen valor: balance entre eficiencia y recursos
// headersTimeout: Tiempo máximo para recibir los headers HTTP del cliente
// Debe ser ligeramente mayor que keepAliveTimeout
server.keepAliveTimeout = 65000;   // 65 segundos
server.headersTimeout = 66000;     // 66 segundos

// ========================================================
// 🛑 GRACEFUL SHUTDOWN
// ========================================================

// Graceful shutdown: Apagar el servidor de forma ordenada
// Cuando el servidor recibe una señal de apagado (SIGTERM, SIGINT), debe:
//   1. Dejar de aceptar nuevas conexiones
//   2. Esperar a que las conexiones existentes terminen
//   3. Cerrar recursos (archivos, bases de datos, etc.)
//   4. Salir del proceso
//
// Esto es importante para:
//   - No perder datos (guardar todo antes de apagar)
//   - No cortar requests en progreso
//   - Cerrar recursos correctamente

function gracefulShutdown(signal) {
  // signal: 'SIGTERM' (terminación normal) o 'SIGINT' (Ctrl+C)
  logger.info(`\n[${signal}] Iniciando apagado graceful del servidor...`);

  // Cerrar el stream de logs si está abierto
  if (logStream && logStream.writable) {
    try {
      logStream.end();  // Cerrar el stream (escribe cualquier buffer pendiente)
      logger.info('[SHUTDOWN] ✅ Stream de logs cerrado');
    } catch (error) {
      logger.error('[SHUTDOWN] ❌ Error cerrando stream de logs:', error.message);
    }
  }

  // Cerrar el servidor HTTP
  // server.close() detiene el servidor de aceptar nuevas conexiones
  // El callback se ejecuta cuando todas las conexiones existentes terminan
  server.close(() => {
    logger.info('[SHUTDOWN] ✅ Servidor HTTP cerrado correctamente');
    // Cerrar el logger de pino antes de salir
    logger.info('[SHUTDOWN] ✅ Apagado completado');
    // Salir del proceso con código 0 (éxito)
    process.exit(0);
  });

  // Si después de 10 segundos el servidor no se cerró, forzar salida
  // Esto evita que el servidor quede "colgado" esperando conexiones que nunca terminan
  setTimeout(() => {
    logger.error('[SHUTDOWN] ⚠️  Forzando salida después de 10 segundos');
    // Código 1 indica error (el apagado no fue completamente graceful)
    process.exit(1);
  }, 10000);
}

// Registrar handlers para señales de apagado
// SIGTERM: Señal enviada por sistemas de gestión de procesos (systemd, PM2, etc.)
// SIGINT: Señal enviada cuando presionas Ctrl+C en la terminal
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========================================================
// ✅ INICIALIZACIÓN COMPLETA
// ========================================================

logger.info('✅ Configuración inicial completada');
logger.info('⚠️  Recordatorio: Este servidor NO tiene lógica de chat todavía');
logger.info('📝 Agregar endpoints y handlers de chat según sea necesario');

// Exportar la aplicación Express para testing o uso externo
export default app;

