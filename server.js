/**
 * server.js — STI Chat (v2) — Servidor Principal
 * 
 * Este archivo contiene el servidor completo del chat STI:
 * - Imports de librerías esenciales
 * - Variables de entorno y constantes
 * - Configuración de directorios
 * - Inicialización de Express
 * - Middlewares de seguridad y rendimiento
 * - Health check
 * - Graceful shutdown
 * - Flujo conversacional completo (6 etapas)
 * - Sistema de sesiones
 * - Sistema de tickets
 * - Upload de imágenes
 * 
 * ⚠️ IMPORTANTE: Este es el archivo principal del servidor.
 * Contiene toda la lógica del flujo conversacional, handlers de stages,
 * endpoints de chat, botones, textos, escalación, WhatsApp, etc.
 * 
 * Versión: 2.0.0
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

// multer: Middleware de Express para manejar multipart/form-data (subida de archivos)
// Permite que los usuarios suban imágenes adjuntándolas al chat
// Esencial para que el bot pueda analizar fotos de problemas técnicos
import multer from 'multer';

// sharp: Librería de alto rendimiento para procesamiento de imágenes
// Permite redimensionar, comprimir y validar imágenes subidas por los usuarios
// Reduce el tamaño de las imágenes para ahorrar espacio y ancho de banda
import sharp from 'sharp';

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
// 🎯 ETAPA 1: GDPR Y SELECCIÓN DE IDIOMA
// ========================================================
// 
// Esta sección implementa la primera etapa del flujo conversacional:
// 1. Mostrar política de privacidad (GDPR)
// 2. Obtener consentimiento del usuario
// 3. Permitir selección de idioma (Español/Inglés)
// 4. Avanzar a la siguiente etapa (ASK_NAME)
//
// ⚠️ IMPORTANTE: Esta es la base del flujo. Si se modifica incorrectamente,
// puede romper todo el sistema de conversación.
// ========================================================

// ========================================================
// 🔧 FUNCIONES AUXILIARES NECESARIAS
// ========================================================

/**
 * Genera un timestamp en formato ISO 8601
 * Formato: "2025-01-15T10:30:45.123Z"
 * Se usa para registrar cuándo ocurrieron eventos en la conversación
 * 
 * ✅ SE PUEDE MODIFICAR: El formato del timestamp (pero mantener ISO es recomendado)
 * ❌ NO MODIFICAR: La función debe retornar un string con fecha/hora
 * 
 * @returns {string} Timestamp en formato ISO
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Genera un ID único para cada sesión de chat
 * Cada usuario que abre el chat tiene su propia sesión con un ID único
 * 
 * ✅ SE PUEDE MODIFICAR: El formato del ID (pero mantenerlo único y seguro)
 * ❌ NO MODIFICAR: Debe retornar un string único cada vez que se llama
 * 
 * @returns {string} ID de sesión único (ej: "sess_abc123xyz")
 */
function generateSessionId() {
  // crypto.randomBytes genera bytes aleatorios seguros
  // toString('hex') los convierte a hexadecimal legible
  // Prefijo "sess_" para identificar fácilmente que es un ID de sesión
  return 'sess_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Obtiene el ID de sesión desde el request HTTP
 * Busca en múltiples lugares: header, cookie, body, o genera uno nuevo
 * 
 * ✅ SE PUEDE MODIFICAR: Los lugares donde busca el sessionId
 * ❌ NO MODIFICAR: Debe retornar siempre un string (nunca null/undefined)
 * 
 * @param {object} req - Request object de Express
 * @returns {string} ID de sesión
 */
function getSessionId(req) {
  // Buscar en header personalizado (más común en APIs REST)
  if (req.headers['x-session-id']) {
    return String(req.headers['x-session-id']);
  }
  
  // Buscar en cookie (si el frontend usa cookies)
  if (req.cookies && req.cookies.sessionId) {
    return String(req.cookies.sessionId);
  }
  
  // Buscar en body (si viene en el JSON del request)
  if (req.body && req.body.sessionId) {
    return String(req.body.sessionId);
  }
  
  // Si no se encuentra, generar uno nuevo
  // Esto crea una nueva sesión para el usuario
  return generateSessionId();
}

/**
 * Guarda una sesión en el sistema de archivos
 * Cada sesión se guarda como un archivo JSON en la carpeta de transcripts
 * 
 * ⚠️ CRÍTICO: Esta función es esencial para mantener el estado de la conversación
 * ✅ SE PUEDE MODIFICAR: El formato del archivo (JSON, pero podría ser otro)
 * ❌ NO MODIFICAR: Debe guardar la sesión de forma persistente
 * 
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión con toda la información
 * @returns {Promise<void>} Promise que se resuelve cuando se guarda
 */
/**
 * Guarda una sesión en el sistema de archivos (versión asíncrona)
 * 
 * ⚠️ CRÍTICO: Esta función es esencial para mantener el estado de la conversación
 * ✅ SE PUEDE MODIFICAR: El formato del archivo (JSON, pero podría ser otro)
 * ❌ NO MODIFICAR: Debe guardar la sesión de forma persistente y asíncrona
 * 
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión con toda la información
 * @returns {Promise<void>} Promise que se resuelve cuando se guarda
 */
async function saveSession(sessionId, session) {
  try {
    // Validar parámetros
    if (!sessionId || typeof sessionId !== 'string') {
      logger.error('[SESSION] ❌ sessionId inválido');
      return;
    }
    
    if (!session || typeof session !== 'object') {
      logger.error('[SESSION] ❌ session inválida');
      return;
    }
    
    // Construir ruta del archivo: /data/transcripts/sess_abc123.json
    const sessionFile = path.join(TRANSCRIPTS_DIR, `${sessionId}.json`);
    
    // Guardar como JSON con formato legible (2 espacios de indentación)
    // Usar fs.promises.writeFile() para operación asíncrona (no bloquea event loop)
    const jsonContent = JSON.stringify(session, null, 2);
    await fs.promises.writeFile(sessionFile, jsonContent, 'utf8');
    
    logger.debug(`[SESSION] ✅ Sesión guardada: ${sessionId}`);
  } catch (error) {
    // Si hay error al guardar, loguear pero no fallar
    // En producción, esto podría causar pérdida de datos, pero es mejor que crashear
    logger.error(`[SESSION] ❌ Error guardando sesión ${sessionId}:`, error.message);
  }
}

/**
 * Carga una sesión desde el sistema de archivos
 * Si la sesión no existe, retorna null (no crea una nueva)
 * 
 * ✅ SE PUEDE MODIFICAR: El formato del archivo o la ubicación
 * ❌ NO MODIFICAR: Debe retornar null si la sesión no existe
 * 
 * @param {string} sessionId - ID de la sesión a cargar
 * @returns {Promise<object|null>} Sesión cargada o null si no existe
 */
/**
 * Carga una sesión desde el sistema de archivos (versión asíncrona)
 * Si la sesión no existe, retorna null (no crea una nueva)
 * 
 * ✅ SE PUEDE MODIFICAR: El formato del archivo o la ubicación
 * ❌ NO MODIFICAR: Debe retornar null si la sesión no existe
 * 
 * @param {string} sessionId - ID de la sesión a cargar
 * @returns {Promise<object|null>} Sesión cargada o null si no existe
 */
async function getSession(sessionId) {
  try {
    // Validar sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      logger.warn('[SESSION] ⚠️  sessionId inválido');
      return null;
    }
    
    const sessionFile = path.join(TRANSCRIPTS_DIR, `${sessionId}.json`);
    
    // Verificar si el archivo existe (usar fs.promises.access para async)
    try {
      await fs.promises.access(sessionFile);
    } catch (accessError) {
      return null; // Sesión no existe
    }
    
    // Leer el archivo y parsear el JSON (usar fs.promises.readFile para async)
    const fileContent = await fs.promises.readFile(sessionFile, 'utf8');
    const session = JSON.parse(fileContent);
    
    return session;
  } catch (error) {
    logger.error(`[SESSION] ❌ Error cargando sesión ${sessionId}:`, error.message);
    return null; // Si hay error, retornar null (sesión no encontrada)
  }
}

/**
 * Límite máximo de mensajes en el transcript
 * Previene que el transcript crezca demasiado y cause problemas de memoria/rendimiento
 * 
 * ✅ SE PUEDE MODIFICAR: El valor (actualmente 1000 mensajes)
 * ❌ NO MODIFICAR: Debe ser un número positivo
 */
const MAX_TRANSCRIPT_MESSAGES = 1000;

/**
 * Guarda la sesión Y también guarda el transcript en formato texto plano
 * El transcript es útil para análisis y debugging
 * 
 * ✅ SE PUEDE MODIFICAR: El formato del transcript de texto
 * ❌ NO MODIFICAR: Debe guardar tanto la sesión como el transcript
 * 
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión
 * @returns {Promise<void>}
 */
async function saveSessionAndTranscript(sessionId, session) {
  // Validar parámetros
  if (!sessionId || typeof sessionId !== 'string') {
    logger.error('[SAVE_TRANSCRIPT] ❌ sessionId inválido');
    return;
  }
  
  if (!session || typeof session !== 'object') {
    logger.error('[SAVE_TRANSCRIPT] ❌ session inválida');
    return;
  }
  
  // Limitar tamaño del transcript si es necesario
  if (session.transcript && Array.isArray(session.transcript)) {
    if (session.transcript.length > MAX_TRANSCRIPT_MESSAGES) {
      // Mantener solo los últimos MAX_TRANSCRIPT_MESSAGES mensajes
      const removedCount = session.transcript.length - MAX_TRANSCRIPT_MESSAGES;
      session.transcript = session.transcript.slice(-MAX_TRANSCRIPT_MESSAGES);
      logger.warn(`[TRANSCRIPT] ⚠️  Transcript truncado: se eliminaron ${removedCount} mensajes antiguos`);
      
      // Agregar mensaje informativo al transcript
      session.transcript.unshift({
        who: 'system',
        text: `[Sistema] Se eliminaron ${removedCount} mensajes antiguos del transcript para mantener el rendimiento.`,
        ts: nowIso()
      });
    }
  }
  
  // Guardar sesión JSON
  await saveSession(sessionId, session);
  
  // Guardar transcript en texto plano (opcional, para debugging)
  try {
    const transcriptFile = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
    let transcriptText = '';
    
    // Convertir cada mensaje del transcript a texto legible
    if (session.transcript && Array.isArray(session.transcript)) {
      for (const msg of session.transcript) {
        const who = msg.who === 'user' ? 'USER' : msg.who === 'system' ? 'SYSTEM' : 'ASSISTANT';
        const time = msg.ts || nowIso();
        transcriptText += `[${time}] ${who}: ${msg.text}\n`;
      }
    }
    
    // Guardar el transcript (usar fs.promises.appendFile para async)
    if (transcriptText) {
      await fs.promises.appendFile(transcriptFile, transcriptText, 'utf8');
    }
  } catch (error) {
    // Si falla el transcript, no es crítico, solo loguear
    logger.debug(`[TRANSCRIPT] ⚠️  Error guardando transcript ${sessionId}:`, error.message);
  }
}

// ========================================================
// 📋 CONSTANTES DE ESTADOS (STATES)
// ========================================================
// 
// Los "states" (estados) representan en qué etapa está la conversación
// Cada estado tiene un propósito específico y define qué puede hacer el usuario
//
// ⚠️ CRÍTICO: Estos valores se usan en TODO el código para controlar el flujo
// ✅ SE PUEDE MODIFICAR: Los nombres de los estados (pero hay que actualizar TODO el código)
// ❌ NO MODIFICAR: Los valores sin actualizar todas las referencias
//
// Si cambias 'ASK_LANGUAGE' a 'LANGUAGE_SELECTION', debes buscar y reemplazar
// en TODO el código donde se use STATES.ASK_LANGUAGE
// ========================================================

const STATES = {
  // ASK_LANGUAGE: Primera etapa - Mostrar GDPR y seleccionar idioma
  // Este es el estado inicial cuando el usuario abre el chat por primera vez
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  
  // ASK_NAME: Segunda etapa - Pedir el nombre del usuario
  // Se activa después de que el usuario acepta GDPR y selecciona idioma
  ASK_NAME: 'ASK_NAME',
  
  // Estados futuros (aún no implementados en esta etapa)
  // Se definen aquí para que el código no falle cuando se avance a ellos
  ASK_NEED: 'ASK_NEED',
  ASK_PROBLEM: 'ASK_PROBLEM',
  ASK_DEVICE: 'ASK_DEVICE',
  ASK_OS: 'ASK_OS',
  BASIC_TESTS: 'BASIC_TESTS',
  ADVANCED_TESTS: 'ADVANCED_TESTS',
  ESCALATE: 'ESCALATE',
  CREATE_TICKET: 'CREATE_TICKET',
  TICKET_SENT: 'TICKET_SENT',
  ENDED: 'ENDED'
};

/**
 * Transiciones válidas entre estados
 * 
 * Define qué transiciones de estado son permitidas para prevenir
 * que el flujo conversacional se rompa con transiciones inválidas
 * 
 * ⚠️ CRÍTICO: Esta configuración controla el flujo completo del chat
 * ✅ SE PUEDE MODIFICAR: Agregar más transiciones permitidas
 * ❌ NO MODIFICAR: Debe incluir todas las transiciones válidas del flujo
 * 
 * Si agregas un nuevo estado:
 * 1. Agrégalo a STATES
 * 2. Agrega sus transiciones permitidas aquí
 * 3. Actualiza los handlers para usar las nuevas transiciones
 * 
 * @type {Object<string, string[]>}
 */
const VALID_TRANSITIONS = {
  // Desde ASK_LANGUAGE solo se puede ir a ASK_NAME (después de aceptar GDPR y seleccionar idioma)
  ASK_LANGUAGE: ['ASK_NAME'],
  
  // Desde ASK_NAME solo se puede ir a ASK_NEED (después de ingresar nombre)
  ASK_NAME: ['ASK_NEED'],
  
  // Desde ASK_NEED se puede ir a ASK_DEVICE (después de seleccionar problema)
  // O volver a ASK_NAME si hay error
  ASK_NEED: ['ASK_DEVICE', 'ASK_NAME'],
  
  // Desde ASK_PROBLEM se puede ir a ASK_DEVICE (si no se detectó problema en ASK_NEED)
  ASK_PROBLEM: ['ASK_DEVICE'],
  
  // Desde ASK_DEVICE se puede ir a BASIC_TESTS (después de seleccionar dispositivo)
  ASK_DEVICE: ['BASIC_TESTS'],
  
  // Desde ASK_OS se puede ir a BASIC_TESTS o ADVANCED_TESTS
  ASK_OS: ['BASIC_TESTS', 'ADVANCED_TESTS'],
  
  // Desde BASIC_TESTS se puede:
  // - Ir a ESCALATE si el problema persiste
  // - Ir a ENDED si se resolvió el problema
  // - Ir a ADVANCED_TESTS si se solicitan más pruebas
  BASIC_TESTS: ['ESCALATE', 'ENDED', 'ADVANCED_TESTS'],
  
  // Desde ADVANCED_TESTS se puede:
  // - Ir a ESCALATE si el problema persiste
  // - Ir a ENDED si se resolvió el problema
  ADVANCED_TESTS: ['ESCALATE', 'ENDED'],
  
  // Desde ESCALATE se puede:
  // - Ir a CREATE_TICKET para generar el ticket
  // - Volver a BASIC_TESTS si el usuario quiere seguir intentando
  ESCALATE: ['CREATE_TICKET', 'BASIC_TESTS'],
  
  // Desde CREATE_TICKET se puede ir a TICKET_SENT
  CREATE_TICKET: ['TICKET_SENT'],
  
  // Desde TICKET_SENT se puede ir a ENDED
  TICKET_SENT: ['ENDED'],
  
  // ENDED es un estado final, no se puede transicionar desde él
  ENDED: []
};

/**
 * Cambia el estado (stage) de una sesión
 * Valida que la transición sea válida antes de cambiar
 * 
 * ⚠️ CRÍTICO: Esta función controla el flujo de la conversación
 * ✅ SE PUEDE MODIFICAR: La lógica de validación de transiciones
 * ❌ NO MODIFICAR: Debe validar transiciones antes de cambiar
 * 
 * @param {object} session - Objeto de sesión
 * @param {string} newStage - Nuevo estado al que cambiar
 * @returns {boolean} true si la transición fue exitosa, false si fue rechazada
 */
function changeStage(session, newStage) {
  // Validar que session es un objeto válido
  if (!session || typeof session !== 'object') {
    logger.error('[STAGE] ❌ Session inválida');
    return false;
  }
  
  // Validar que el nuevo estado existe en STATES
  const validStages = Object.values(STATES);
  if (!validStages.includes(newStage)) {
    logger.warn(`[STAGE] ⚠️  Estado inválido: ${newStage}, manteniendo estado actual`);
    return false; // No cambiar si el estado es inválido
  }
  
  // Obtener el estado actual
  const currentStage = session.stage || STATES.ASK_LANGUAGE;
  
  // Validar que la transición es permitida
  const allowedTransitions = VALID_TRANSITIONS[currentStage] || [];
  if (!allowedTransitions.includes(newStage)) {
    logger.warn(`[STAGE] ⚠️  Transición inválida: ${currentStage} → ${newStage}. Transiciones permitidas: ${allowedTransitions.join(', ')}`);
    return false; // No cambiar si la transición no es permitida
  }
  
  // Cambiar el estado
  session.stage = newStage;
  
  logger.debug(`[STAGE] 🔄 Transición válida: ${currentStage} → ${newStage}`);
  return true; // Transición exitosa
}

// ========================================================
// 🌍 FUNCIÓN: buildLanguageSelectionGreeting
// ========================================================
// 
// Genera el mensaje inicial de política de privacidad (GDPR)
// Este es el PRIMER mensaje que ve el usuario al abrir el chat
//
// ⚠️ CRÍTICO: Este mensaje es la primera impresión del usuario
// ✅ SE PUEDE MODIFICAR:
//    - El texto del mensaje (pero mantener la información legal)
//    - Los emojis
//    - El formato (markdown, HTML, etc.)
//    - La URL de la política de privacidad
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ text, buttons })
//    - Los valores de los botones ('si' y 'no')
//    - Si cambias los valores, debes actualizar el handler que los procesa
//
// Si modificas el texto, asegúrate de:
// 1. Mantener la información legal requerida por GDPR
// 2. Actualizar también la versión en inglés si agregas soporte bilingüe
// 3. Actualizar el handler handleAskLanguageStage para reconocer las nuevas palabras
// ========================================================

/**
 * Construye el mensaje de bienvenida con política de privacidad
 * Soporta Español e Inglés según el locale detectado
 * 
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {object} Objeto con { text: string, buttons: Array }
 */
function buildLanguageSelectionGreeting(locale = 'es-AR') {
  // ========================================
  // VERSIÓN BILINGÜE (Español + Inglés)
  // ========================================
  // Siempre mostrar en ambos idiomas para que el usuario pueda elegir
  return {
    // Texto del mensaje de política de privacidad en ambos idiomas
    // Markdown es soportado por la mayoría de frontends de chat
    text: `📋 **Política de Privacidad y Consentimiento / Privacy Policy and Consent**

---

**🇦🇷 Español:**

Antes de continuar, quiero informarte:

✅ Guardaré tu nombre y nuestra conversación durante **48 horas**
✅ Los datos se usarán **solo para brindarte soporte técnico**
✅ Podés solicitar **eliminación de tus datos** en cualquier momento
✅ **No compartimos** tu información con terceros
✅ Cumplimos con **GDPR y normativas de privacidad**

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

**¿Aceptás estos términos?**

---

**🇺🇸 English:**

Before continuing, I want to inform you:

✅ I will store your name and our conversation for **48 hours**
✅ Data will be used **only to provide technical support**
✅ You can request **deletion of your data** at any time
✅ **We do not share** your information with third parties
✅ We comply with **GDPR and privacy regulations**

🔗 Full policy: https://stia.com.ar/politica-privacidad.html

**Do you accept these terms?**`,
    
    // Botones bilingües que el usuario puede presionar
    // IMPORTANTE: Los valores 'si' y 'no' se usan en el handler para detectar la respuesta
    // Si cambias estos valores, debes actualizar handleAskLanguageStage()
    buttons: [
      { text: 'Sí Acepto / Yes, I Accept ✔️', value: 'si' },
      { text: 'No Acepto / No, I Decline ❌', value: 'no' }
    ]
  };
}

// ========================================================
// 🎯 HANDLER: handleAskLanguageStage
// ========================================================
// 
// Esta función procesa las respuestas del usuario en la Etapa 1
// Maneja tres casos:
// 1. Usuario acepta GDPR → mostrar selección de idioma
// 2. Usuario rechaza GDPR → mostrar mensaje de despedida
// 3. Usuario selecciona idioma → avanzar a ASK_NAME
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 1
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - Los regex que detectan aceptación/rechazo (agregar más palabras)
//    - Los valores de userLocale ('es-AR', 'en-US', etc.)
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons, handled })
//    - La lógica de cambio de estado (debe avanzar a ASK_NAME después de seleccionar idioma)
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas los regex de detección:
// - Prueba con múltiples variaciones: "sí", "si", "acepto", "ok", "dale", etc.
// - Actualiza también las versiones en inglés: "yes", "accept", "agree", etc.
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa ASK_LANGUAGE
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleAskLanguageStage(session, userText, buttonToken, sessionId) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[ASK_LANGUAGE] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    logger.error('[ASK_LANGUAGE] ❌ userText inválido o vacío');
    return {
      ok: false,
      error: 'Texto de usuario inválido',
      handled: true
    };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[ASK_LANGUAGE] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  try {
    // Normalizar el texto del usuario a minúsculas para comparación
    // Esto permite que "Sí", "SI", "sí" sean tratados igual
    const lowerMsg = userText.toLowerCase().trim();
    
    logger.info(`[ASK_LANGUAGE] Procesando: "${lowerMsg}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: USUARIO ACEPTA GDPR
    // ========================================
    // Detecta si el usuario acepta los términos usando regex
    // Busca palabras como: "sí", "acepto", "ok", "dale", "de acuerdo", etc.
    // También detecta en inglés: "yes", "accept", "agree", etc.
    //
    // ✅ SE PUEDE MODIFICAR: Agregar más palabras al regex
    //    Ejemplo: /\b(si|sí|acepto|ok|dale|de acuerdo|claro|perfecto|agree|accept|yes|yep)\b/i
    // ❌ NO MODIFICAR: Debe establecer session.gdprConsent = true
    //
    // Verificar primero si el buttonToken es 'si' o 'yes' (detección directa del botón)
    // Esto asegura que los clics en botones se detecten correctamente
    const isAcceptButton = buttonToken && (
      String(buttonToken).toLowerCase() === 'si' || 
      String(buttonToken).toLowerCase() === 'yes' ||
      String(buttonToken).toLowerCase() === 'sí'
    );
    
    if (isAcceptButton || /\b(si|sí|acepto|aceptar|ok|dale|de acuerdo|claro|perfecto|agree|accept|yes|yep)\b/i.test(lowerMsg)) {
      // Marcar que el usuario aceptó GDPR
      session.gdprConsent = true;
      session.gdprConsentDate = nowIso(); // Guardar fecha/hora del consentimiento
      
      logger.info(`[GDPR] ✅ Consentimiento otorgado: ${session.gdprConsentDate}`);
      
      // Mostrar mensaje de agradecimiento y selección de idioma
      // El mensaje es bilingüe porque aún no sabemos qué idioma prefiere el usuario
      const reply = `🆔 **${sessionId}**\n\n✅ **Gracias por aceptar / Thank you for accepting**\n\n🌍 **Seleccioná tu idioma / Select your language:**`;
      
      // Agregar este mensaje al transcript (historial de la conversación)
      session.transcript.push({ 
        who: 'bot', 
        text: reply, 
        ts: nowIso(), 
        stage: session.stage 
      });
      
      // Guardar la sesión actualizada
      await saveSessionAndTranscript(sessionId, session);
      
      // Retornar respuesta con botones de selección de idioma
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Mantener ASK_LANGUAGE hasta que seleccione idioma
        buttons: [
          { text: '(🇦🇷) Español 🌎', value: 'español' },
          { text: '(🇺🇸) English 🌎', value: 'english' }
        ],
        handled: true // Indica que este handler procesó la request
      };
    }
    
    // ========================================
    // CASO 2: USUARIO RECHAZA GDPR
    // ========================================
    // Detecta si el usuario rechaza los términos
    // Busca palabras como: "no", "no acepto", "rechazo", "cancel", etc.
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de despedida o agregar más palabras al regex
    // ❌ NO MODIFICAR: No debe avanzar a otra etapa (la conversación termina aquí)
    //
    // Verificar primero si el buttonToken es 'no' (detección directa del botón)
    const isDeclineButton = buttonToken && String(buttonToken).toLowerCase() === 'no';
    
    if (isDeclineButton || /\b(no|no acepto|no quiero|rechazo|rechazar|cancel|cancelar|decline|nope)\b/i.test(lowerMsg)) {
      // Mensaje de despedida bilingüe
      const reply = `😔 **Entiendo / I understand**

**🇦🇷 Español:**
Sin tu consentimiento no puedo continuar.

Si cambiás de opinión, podés volver a iniciar el chat.

📧 Para consultas sin registro, escribinos a: web@stia.com.ar

---

**🇺🇸 English:**
I cannot continue without your consent.

If you change your mind, you can restart the chat.

📧 For inquiries without registration, write to us at: web@stia.com.ar`;
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Mantener ASK_LANGUAGE (no avanzar)
        handled: true
      };
    }
    
    // ========================================
    // CASO 3: USUARIO SELECCIONA IDIOMA
    // ========================================
    // Solo se procesa si el usuario ya aceptó GDPR (session.gdprConsent === true)
    // Detecta si el usuario seleccionó español o inglés
    //
    // ✅ SE PUEDE MODIFICAR:
    //    - Los regex que detectan el idioma (agregar más variaciones)
    //    - Los valores de userLocale ('es-AR', 'en-US', 'es-MX', etc.)
    //    - Los mensajes de confirmación
    // ❌ NO MODIFICAR:
    //    - Debe cambiar session.userLocale
    //    - Debe avanzar a ASK_NAME usando changeStage()
    //
    if (session.gdprConsent) {
      // Detectar selección de Español
      // Busca: "español", "spanish", "es-", "arg", "latino", etc.
      if (/español|spanish|es-|arg|latino|argentino/i.test(lowerMsg)) {
        session.userLocale = 'es-AR'; // Establecer locale a Español Argentina
        
        // Avanzar a la siguiente etapa: pedir el nombre
        changeStage(session, STATES.ASK_NAME);
        
        // Mensaje de confirmación en español
        const reply = `✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊`;
        
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sessionId, session);
        
        return {
          ok: true,
          reply: reply,
          stage: session.stage, // Ahora es ASK_NAME
          handled: true
        };
      }
      
      // Detectar selección de Inglés
      // Busca: "english", "inglés", "ingles", "en-", "usa", "uk", etc.
      if (/english|inglés|ingles|en-|usa|uk|united states|britain/i.test(lowerMsg)) {
        session.userLocale = 'en-US'; // Establecer locale a Inglés USA
        
        // Avanzar a la siguiente etapa: pedir el nombre
        changeStage(session, STATES.ASK_NAME);
        
        // Mensaje de confirmación en inglés
        const reply = `✅ Great! Let's continue in **English**.\n\nWhat's your name?`;
        
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sessionId, session);
        
        return {
          ok: true,
          reply: reply,
          stage: session.stage, // Ahora es ASK_NAME
          handled: true
        };
      }
    }
    
    // ========================================
    // CASO 4: RESPUESTA NO RECONOCIDA
    // ========================================
    // Si el usuario escribió algo que no se reconoce, mostrar las opciones nuevamente
    // Esto ayuda al usuario a entender qué puede hacer
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de error/ayuda
    // ❌ NO MODIFICAR: Debe retornar los botones apropiados según el estado
    //
    const retry = session.gdprConsent
      ? `Por favor, seleccioná una de las opciones usando los botones. / Please select one of the options using the buttons.`
      : `Por favor, seleccioná una de las opciones usando los botones. / Please select one of the options using the buttons.`;
    
    session.transcript.push({ who: 'bot', text: retry, ts: nowIso() });
    await saveSessionAndTranscript(sessionId, session);
    
    // Retornar botones según el estado actual
    // Si ya aceptó GDPR, mostrar botones de idioma
    // Si no, mostrar botones de aceptación/rechazo
    return {
      ok: true,
      reply: retry,
      stage: session.stage,
      buttons: session.gdprConsent
        ? [
            // Botones de idioma (si ya aceptó GDPR)
            { text: '(🇦🇷) Español 🌎', value: 'español' },
            { text: '(🇺🇸) English 🌎', value: 'english' }
          ]
        : [
            // Botones de aceptación/rechazo bilingües (si aún no aceptó GDPR)
            { text: 'Sí Acepto / Yes, I Accept ✔️', value: 'si' },
            { text: 'No Acepto / No, I Decline ❌', value: 'no' }
          ],
      handled: true
    };
    
  } catch (error) {
    // Manejo de errores robusto
    // Si algo falla, retornar un mensaje amigable al usuario
    logger.error('[ASK_LANGUAGE] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario (si está configurado)
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.ASK_LANGUAGE,
      handled: true,
      error: error.message
    };
  }
}

// ========================================================
// 🎯 DEFINICIONES DE CHAT Y BOTONES
// ========================================================
// 
// Esta sección define todos los botones que el sistema puede usar
// Los botones se mapean a tokens que luego se convierten en texto
// para procesar como si el usuario los hubiera escrito
//
// ⚠️ CRÍTICO: Estos tokens se usan en múltiples lugares del código
// ✅ SE PUEDE MODIFICAR:
//    - Agregar más botones (pero actualizar todos los lugares que los usan)
//    - Cambiar las etiquetas (label) y textos (text)
// ❌ NO MODIFICAR:
//    - Los tokens (value) sin actualizar TODOS los lugares que los usan
//    - La estructura del objeto (token, label, text)
//
// Si agregas un nuevo botón:
// 1. Agrégalo aquí con { token: 'BTN_XXX', label: '...', text: '...' }
// 2. Actualiza buildUiButtonsFromTokens() si es necesario
// 3. Actualiza el mapeo de botones en /api/chat
// 4. Actualiza los handlers que procesan esos botones
// ========================================================

/**
 * Configuración centralizada de botones y estados del chat
 * Esta configuración define todos los tokens de botones que el sistema puede usar
 * 
 * ⚠️ CRÍTICO: Esta estructura se usa en TODO el sistema
 * ✅ SE PUEDE MODIFICAR: Agregar más botones o cambiar labels/texts
 * ❌ NO MODIFICAR: Los tokens sin actualizar todas las referencias
 */
const EMBEDDED_CHAT = {
  version: 'v7',
  messages_v4: {
    greeting: { name_request: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?' }
  },
  settings: {
    OA_MIN_CONF: '0.6',
    whatsapp_ticket: { prefix: 'Hola STI. Vengo del chat web. Dejo mi consulta:' }
  },
  ui: {
    buttons: [
      // Botones del flujo según Flujo.csv
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español (Argentina)', text: 'Español (Argentina)' },
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', text: 'English' },
      
      // Botones de problemas frecuentes
      // Estos botones se muestran después de que el usuario ingresa su nombre
      // Permiten al usuario seleccionar rápidamente un problema común
      { token: 'BTN_NO_ENCIENDE', label: '🔌 El equipo no enciende', text: 'el equipo no enciende' },
      { token: 'BTN_NO_INTERNET', label: '📡 Problemas de conexión a Internet', text: 'problemas de conexión a internet' },
      { token: 'BTN_LENTITUD', label: '🐢 Lentitud del sistema operativo o del equipo', text: 'lentitud del sistema' },
      { token: 'BTN_BLOQUEO', label: '❄️ Bloqueo o cuelgue de programas', text: 'bloqueo de programas' },
      { token: 'BTN_PERIFERICOS', label: '🖨️ Problemas con periféricos externos', text: 'problemas con periféricos' },
      { token: 'BTN_VIRUS', label: '🛡️ Infecciones de malware o virus', text: 'infecciones de virus' },
      
      // Botones de dispositivos
      { token: 'BTN_DESKTOP', label: 'Desktop 💻', text: 'desktop' },
      { token: 'BTN_ALLINONE', label: 'All-in-One 🖥️', text: 'all in one' },
      { token: 'BTN_NOTEBOOK', label: 'Notebook 💼', text: 'notebook' },
      { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', text: 'pc de escritorio' },
      { token: 'BTN_DEV_PC_ALLINONE', label: 'PC All in One', text: 'pc all in one' },
      { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', text: 'notebook' },
      
      // Botones de sistema operativo
      { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', text: 'Windows' },
      { token: 'BTN_OS_MACOS', label: '🍏 macOS', text: 'macOS' },
      { token: 'BTN_OS_LINUX', label: '🐧 Linux', text: 'Linux' },
      
      // Botones de navegación
      { token: 'BTN_BACK_TO_STEPS', label: '⏪ Volver a los pasos', text: 'volver a los pasos' },
      { token: 'BTN_BACK', label: '⏪ Volver atrás', text: 'volver atrás' },
      { token: 'BTN_CHANGE_TOPIC', label: '🔄 Cambiar de tema', text: 'cambiar de tema' },
      { token: 'BTN_MORE_INFO', label: 'ℹ️ Más información', text: 'más información' },
      
      // Botones de estado
      { token: 'BTN_SOLVED', label: '👍 Ya lo solucioné', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', text: 'el problema persiste' },
      { token: 'BTN_ADVANCED_TESTS', label: '🔬 Pruebas Avanzadas', text: 'pruebas avanzadas' },
      { token: 'BTN_MORE_TESTS', label: '🔍 Más pruebas', text: 'más pruebas' },
      { token: 'BTN_TECH', label: '🧑‍💻 Técnico real', text: 'hablar con técnico' },
      
      // Botones de ayuda por paso
      { token: 'BTN_HELP_1', label: 'Ayuda paso 1', text: 'ayuda paso 1' },
      { token: 'BTN_HELP_2', label: 'Ayuda paso 2', text: 'ayuda paso 2' },
      { token: 'BTN_HELP_3', label: 'Ayuda paso 3', text: 'ayuda paso 3' },
      { token: 'BTN_HELP_4', label: 'Ayuda paso 4', text: 'ayuda paso 4' },
      
      // Botones de acción
      { token: 'BTN_REPHRASE', label: 'Cambiar problema', text: 'cambiar problema' },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'enviar por whatsapp' },
      { token: 'BTN_CONNECT_TECH', label: '👨‍🏭 Conectar con Técnico', text: 'conectar con técnico' },
      { token: 'BTN_WHATSAPP_TECNICO', label: '💚 Hablar con un Técnico', text: 'hablar con un técnico' },
      { token: 'BTN_CONFIRM_TICKET', label: 'Sí, generar ticket ✅', text: 'sí, generar ticket' },
      { token: 'BTN_CANCEL', label: 'Cancelar ❌', text: 'cancelar' },
      
      // Botones para instalaciones y guías
      { token: 'BTN_SUCCESS', label: '✅ Funcionó', text: 'funcionó' },
      { token: 'BTN_NEED_HELP', label: '❓ Necesito ayuda', text: 'necesito ayuda' },
      { token: 'BTN_YES', label: '✅ Sí', text: 'sí' },
      { token: 'BTN_NO', label: '❌ No', text: 'no' },
      
      // Botones básicos
      { token: 'BTN_BASIC_YES', label: 'Sí', text: 'sí' },
      { token: 'BTN_BASIC_NO', label: 'No', text: 'no' },
      { token: 'BTN_ADVANCED', label: 'Avanzadas', text: 'avanzadas' },
      { token: 'BTN_DEVICE_PC', label: 'PC', text: 'pc' },
      { token: 'BTN_DEVICE_NOTEBOOK', label: 'Notebook', text: 'notebook' },
      { token: 'BTN_DEVICE_MONITOR', label: 'Monitor', text: 'monitor' },
      { token: 'BTN_OTHER', label: 'Otro', text: '' }
    ],
    states: {}
  }
};

/**
 * Referencia a EMBEDDED_CHAT para compatibilidad
 * Se usa en funciones que buscan definiciones de botones
 */
const CHAT = EMBEDDED_CHAT || {};

/**
 * Obtiene la definición de un botón por su token
 * 
 * Esta función busca en CHAT.ui.buttons un botón que coincida con el token dado
 * Retorna la definición completa del botón (token, label, text) o null si no existe
 * 
 * ✅ SE PUEDE MODIFICAR: La estructura de búsqueda (pero mantener la funcionalidad)
 * ❌ NO MODIFICAR: Debe retornar null si no encuentra el botón
 * 
 * @param {string} token - Token del botón (ej: 'BTN_YES')
 * @returns {object|null} - Definición del botón o null si no existe
 */
function getButtonDefinition(token) {
  if (!token || !CHAT?.ui?.buttons) return null;
  return CHAT.ui.buttons.find(b => String(b.token) === String(token)) || null;
}

/**
 * Construye un array de botones desde tokens
 * 
 * Esta función toma un array de tokens de botones (ej: ['BTN_YES', 'BTN_NO'])
 * y retorna un array de objetos con la información completa de cada botón
 * 
 * ⚠️ CRÍTICO: Esta función se usa en TODO el sistema para generar botones
 * ✅ SE PUEDE MODIFICAR:
 *    - El formato del objeto retornado (pero mantener token, label, text)
 *    - Agregar más campos al objeto (description, example, etc.)
 * ❌ NO MODIFICAR:
 *    - Debe retornar un array de objetos
 *    - Cada objeto debe tener al menos { token, label, text }
 * 
 * Si modificas el formato:
// - Actualiza TODOS los lugares donde se usan los botones
// - Actualiza el frontend que renderiza los botones
 * 
 * @param {string[]} tokens - Array de tokens de botones (ej: ['BTN_YES', 'BTN_NO'])
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {Array} Array de objetos { token, label, text }
 */
function buildUiButtonsFromTokens(tokens = [], locale = 'es-AR') {
  // Validar que tokens sea un array
  if (!Array.isArray(tokens)) return [];
  
  // Mapear cada token a su definición completa
  return tokens.map(t => {
    // Si el token es null/undefined, retornar null (se filtrará después)
    if (!t) return null;
    
    // Buscar la definición del botón
    const def = getButtonDefinition(t);
    
    // Si no se encuentra la definición, crear una básica desde el token
    // Esto permite que el sistema funcione incluso si falta una definición
    const label = def?.label || def?.text || (typeof t === 'string' ? t : String(t));
    const text = def?.text || label;
    
    // Retornar objeto con token, label y text
    return { 
      token: String(t),  // Asegurar que sea string
      label: label,      // Etiqueta visible para el usuario
      text: text         // Texto que se envía cuando se hace clic
    };
  }).filter(Boolean); // Filtrar nulls/undefineds
}

// ========================================================
// 🎯 ETAPA 2: PEDIR NOMBRE DEL USUARIO
// ========================================================
// 
// Esta sección implementa la segunda etapa del flujo conversacional:
// 1. Pedir el nombre del usuario después de seleccionar idioma
// 2. Validar que el nombre sea válido
// 3. Guardar el nombre en la sesión
// 4. Avanzar a la siguiente etapa (ASK_NEED)
//
// ⚠️ IMPORTANTE: Esta etapa es crítica para personalizar la conversación
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta
//    - Las reglas de validación de nombres (pero mantener seguridad)
//    - El límite de intentos
// ❌ NO MODIFICAR:
//    - Debe guardar session.userName cuando el nombre es válido
//    - Debe avanzar a ASK_NEED después de obtener nombre válido
//    - Debe validar que el nombre no sea vacío o inválido
// ========================================================

// ========================================================
// 🔧 FUNCIONES AUXILIARES PARA VALIDACIÓN DE NOMBRES
// ========================================================

/**
 * Capitaliza un token de nombre (maneja guiones y apóstrofes)
 * Ejemplo: "maría-josé" → "María-José"
 * 
 * ✅ SE PUEDE MODIFICAR: La lógica de capitalización
 * ❌ NO MODIFICAR: Debe retornar un string capitalizado
 * 
 * @param {string} token - Token a capitalizar
 * @returns {string} Token capitalizado
 */
function capitalizeToken(token) {
  if (!token) return token;
  
  // Dividir por guiones y apóstrofes para capitalizar cada parte
  return token.split(/[-''\u2019]/).map(part => {
    if (!part) return part;
    // Primera letra mayúscula, resto minúsculas
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('-');
}

/**
 * Palabras técnicas que NO son nombres válidos
 * Si el usuario escribe una de estas palabras, se rechaza como nombre
 * 
 * ✅ SE PUEDE MODIFICAR: Agregar más palabras técnicas
 * ❌ NO MODIFICAR: Debe ser un regex que detecte palabras técnicas
 */
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;

/**
 * Palabras comunes que NO son nombres válidos
 * Stopwords que indican que el usuario no está dando su nombre
 * 
 * ✅ SE PUEDE MODIFICAR: Agregar más stopwords
 * ❌ NO MODIFICAR: Debe ser un Set para búsqueda rápida
 */
const NAME_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'por', 'para', 'sobre',
  'mi', 'tu', 'su', 'nuestro', 'vuestro', 'sus', 'mis', 'tus', 'nuestros', 'vuestros',
  'tengo', 'tiene', 'tienen', 'tenemos', 'tenéis', 'tienen', 'hay', 'está', 'están', 'estamos', 'estáis',
  'problema', 'problemas', 'error', 'errores', 'falla', 'fallas', 'no funciona', 'no anda', 'no prende'
]);

/**
 * Regex para validar un token de nombre individual
 * Permite letras, acentos, guiones y apóstrofes
 * Longitud: 2-20 caracteres
 * 
 * ✅ SE PUEDE MODIFICAR: El rango de longitud o caracteres permitidos
 * ❌ NO MODIFICAR: Debe validar que sea un token de nombre válido
 */
const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,20}$/u;

/**
 * Límites para validación de nombres
 * MIN_NAME_TOKENS: Mínimo de palabras en el nombre (ej: "Ana" = 1)
 * MAX_NAME_TOKENS: Máximo de palabras en el nombre (ej: "Juan Carlos" = 2, "María José" = 2)
 * 
 * ✅ SE PUEDE MODIFICAR: Los límites (pero mantener razonables)
 * ❌ NO MODIFICAR: Debe haber límites mínimos y máximos
 */
const MIN_NAME_TOKENS = 1;
const MAX_NAME_TOKENS = 3;

/**
 * Lista negra de nombres inválidos
 * Nombres comunes que NO son nombres reales (trolls, apodos, palabras comunes)
 * 
 * ✅ SE PUEDE MODIFICAR: Agregar más nombres a la lista negra
 * ❌ NO MODIFICAR: Debe rechazar nombres obviamente falsos
 */
const NAME_BLACKLIST = [
  'pepelito', 'papelito', 'pepito', 'probando', 'aaaa', 'jjjj', 'zzzz', 'asdasd', 'qwerty', 'basurita', 'basura', 'tuerquita', 'chuchuki',
  'corcho', 'coco', 'pepe', 'toto', 'nene', 'nena', 'pibe', 'piba', 'guacho', 'wacho', 'bobo', 'boludo', 'pelotudo',
  'chicle', 'goma', 'lapiz', 'papel', 'mesa', 'silla', 'puerta', 'ventana', 'techo', 'piso', 'pared',
  'amigo', 'amiga', 'hermano', 'hermana', 'primo', 'prima', 'tio', 'tia', 'abuelo', 'abuela',
  'test', 'testing', 'prueba', 'ejemplo', 'admin', 'usuario', 'user', 'cliente', 'persona',
  'hola', 'chau', 'gracias', 'perdon', 'disculpa', 'sorry', 'hello', 'bye'
];

/**
 * Valida si un texto es un nombre válido
 * 
 * Esta función realiza múltiples validaciones:
 * 1. Rechaza números y símbolos especiales
 * 2. Rechaza palabras técnicas (PC, notebook, etc.)
 * 3. Rechaza stopwords comunes
 * 4. Valida formato de tokens (letras, acentos, guiones)
 * 5. Valida cantidad de tokens (1-3 palabras)
 * 6. Rechaza nombres en lista negra
 * 
 * ⚠️ CRÍTICO: Esta función determina si aceptamos o rechazamos un nombre
 * ✅ SE PUEDE MODIFICAR:
 *    - Las reglas de validación (agregar más checks)
 *    - La lista negra
 *    - Los límites de longitud
 * ❌ NO MODIFICAR:
 *    - Debe retornar true/false
 *    - Debe validar seguridad básica (no números, no símbolos peligrosos)
 * 
 * @param {string} text - Texto a validar como nombre
 * @returns {boolean} true si es un nombre válido, false si no
 */
function isValidName(text) {
  if (!text || typeof text !== 'string') return false;
  const s = String(text).trim();
  if (!s) return false;

  // 1. Rechazar si contiene números o símbolos especiales peligrosos
  // Permite letras, espacios, acentos, guiones y apóstrofes
  if (/[0-9@#\$%\^&\*\(\)_=\+\[\]\{\}\\\/<>]/.test(s)) return false;

  // 2. Rechazar si es una palabra técnica
  if (TECH_WORDS.test(s)) return false;

  // 3. Rechazar si contiene solo stopwords
  const lower = s.toLowerCase();
  const words = lower.split(/\s+/);
  for (const w of words) {
    if (NAME_STOPWORDS.has(w)) return false;
  }

  // 4. Validar cantidad de tokens (palabras)
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < MIN_NAME_TOKENS || tokens.length > MAX_NAME_TOKENS) return false;

  // 5. Rechazar si tiene demasiadas palabras (probablemente no es un nombre)
  if (s.split(/\s+/).filter(Boolean).length > 6) return false;

  // 6. Rechazar si está en la lista negra
  if (NAME_BLACKLIST.includes(s.toLowerCase())) return false;

  // 7. Validar cada token individual
  for (const tok of tokens) {
    // Cada token debe coincidir con el regex de nombre
    if (!NAME_TOKEN_RX.test(tok)) return false;
    // El token sin puntuación debe tener al menos 2 caracteres
    if (tok.replace(/[''\-]/g, '').length < 2) return false;
  }

  // 8. Si pasó todas las validaciones, es un nombre válido
  return true;
}

/**
 * Preprocesa el texto para extracción de nombre
 * - Convierte a minúsculas
 * - Elimina espacios múltiples
 * - Elimina emojis y símbolos no alfabéticos
 * - Conserva letras, espacios, acentos y signos simples
 * 
 * ✅ SE PUEDE MODIFICAR: La lógica de limpieza
 * ❌ NO MODIFICAR: Debe retornar un string limpio
 * 
 * @param {string} text - Texto a preprocesar
 * @returns {string} Texto preprocesado
 */
function preprocessNameText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Convertir a minúsculas y trim
  let processed = text.toLowerCase().trim();
  
  // Reemplazar múltiples espacios por uno solo
  processed = processed.replace(/\s+/g, ' ');
  
  // Eliminar emojis y símbolos no alfabéticos
  // Conservar: letras, espacios, acentos, y signos simples (.,!?;:)
  processed = processed.replace(/[^\w\s\u00C0-\u017F.,!?;:]/g, '');
  
  // Limpiar signos de puntuación al inicio y final (pero conservarlos internos)
  processed = processed.replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');
  
  // Volver a trim
  processed = processed.trim();
  
  return processed;
}

/**
 * Elimina saludos y frases de relleno del inicio del texto
 * Ejemplo: "Hola, me llamo Juan" → "Juan"
 * 
 * ✅ SE PUEDE MODIFICAR: Agregar más patrones de saludos
 * ❌ NO MODIFICAR: Debe retornar el texto sin saludos
 * 
 * @param {string} text - Texto con posible saludo
 * @returns {string} Texto sin saludos
 */
function removeGreetingsAndFiller(text) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.toLowerCase().trim();
  
  // Lista de patrones de saludos y expresiones a eliminar
  const greetingsAndFillers = [
    // Saludos simples
    /^hola+\s*,?\s*/i,
    /^holis+\s*,?\s*/i,
    /^oli+\s*,?\s*/i,
    /^buenas+\s*,?\s*/i,
    /^buenas\s+tardes\s*,?\s*/i,
    /^buenas\s+noches\s*,?\s*/i,
    /^buen\s+d[ií]a\s*,?\s*/i,
    /^buenos\s+d[ií]as\s*,?\s*/i,
    /^qu[ée]\s+tal\s*,?\s*/i,
    /^como\s+va\s*,?\s*/i,
    /^c[óo]mo\s+va\s*,?\s*/i,
    /^todo\s+bien\s*,?\s*/i,
    /^hi\s*,?\s*/i,
    /^hello\s*,?\s*/i,
    /^hey\s*,?\s*/i,
    
    // Expresiones de presentación
    /^soy\s+/i,
    /^yo\s+soy\s+/i,
    /^mi\s+nombre\s+es\s+/i,
    /^me\s+llamo\s+/i,
    /^me\s+dicen\s+/i,
    /^me\s+llaman\s+/i,
    /^puedes\s+llamarme\s+/i,
    /^llamame\s+/i,
    /^ll[áa]mame\s+/i,
    /^con\s+/i, // "con juan" → "juan"
    /^es\s+/i, // "es juan" → "juan"
  ];
  
  // Aplicar cada patrón de eliminación
  for (const pattern of greetingsAndFillers) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Limpiar comas y espacios sobrantes al inicio
  cleaned = cleaned.replace(/^[,\s]+/, '').trim();
  
  return cleaned;
}

/**
 * Extrae y valida un nombre del texto del usuario
 * 
 * Esta función:
 * 1. Preprocesa el texto (limpia emojis, espacios, etc.)
 * 2. Elimina saludos y frases de relleno
 * 3. Extrae el candidato a nombre
 * 4. Valida que sea un nombre válido
 * 5. Capitaliza correctamente
 * 
 * ⚠️ CRÍTICO: Esta función determina qué nombre se guarda en la sesión
 * ✅ SE PUEDE MODIFICAR:
 *    - La lógica de extracción (agregar más patrones)
 *    - La lógica de validación
 * ❌ NO MODIFICAR:
 *    - Debe retornar { name: string, valid: boolean, reason: string }
 *    - Debe validar usando isValidName()
 * 
 * @param {string} text - Texto del usuario
 * @returns {Object} { name: string, valid: boolean, reason: string }
 */
function extractName(text) {
  // Inicializar resultado
  const result = {
    name: '',
    valid: false,
    reason: ''
  };
  
  if (!text || typeof text !== 'string') {
    result.reason = 'vacío';
    return result;
  }
  
  // 1. PREPROCESAMIENTO
  let processed = preprocessNameText(text);
  
  if (!processed) {
    result.reason = 'vacío';
    return result;
  }
  
  // 2. ELIMINACIÓN DE SALUDOS Y RELLENO
  processed = removeGreetingsAndFiller(processed);
  
  if (!processed) {
    result.reason = 'solo saludos';
    return result;
  }
  
  // 3. LIMPIAR SIGNOS DE PUNTUACIÓN AL FINAL
  processed = processed.replace(/[.,!?;:]+$/, '').trim();
  
  if (!processed) {
    result.reason = 'solo signos';
    return result;
  }
  
  // 4. EXTRAER CANDIDATO A NOMBRE
  // Buscar patrones: "me llamo X", "soy X", "mi nombre es X", o simplemente "X"
  const patterns = [
    // Patrones con expresiones de presentación
    /\b(?:me\s+llamo|soy|yo\s+soy|mi\s+nombre\s+es|me\s+dicen|me\s+llaman|puedes\s+llamarme|llamame|ll[áa]mame)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    // Patrón simple: solo el nombre
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    // Patrón con "es" o "con" al inicio
    /^(?:es|con)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
  ];
  
  let candidate = null;
  
  for (const rx of patterns) {
    const m = processed.match(rx);
    if (m && m[1]) {
      candidate = m[1].trim().replace(/\s+/g, ' ');
      break;
    }
  }
  
  // Si no se encontró con patrones, usar todo el texto procesado
  if (!candidate) {
    candidate = processed;
  }
  
  // 5. VALIDAR Y NORMALIZAR
  // Limitar tokens
  const tokens = candidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
  const normalized = tokens.map(t => capitalizeToken(t)).join(' ');
  
  if (isValidName(normalized)) {
    result.name = normalized;
    result.valid = true;
    result.reason = 'ok';
    return result;
  }
  
  // 6. NO SE PUDO EXTRAER NOMBRE VÁLIDO
  result.reason = 'no parece un nombre';
  return result;
}

/**
 * Detecta si un texto claramente NO es un nombre
 * 
 * Esta función detecta casos obvios donde el usuario NO está dando su nombre:
 * - Saludos cortos
 * - Palabras técnicas
 * - Descripciones de problemas
 * 
 * ✅ SE PUEDE MODIFICAR: Agregar más indicadores
 * ❌ NO MODIFICAR: Debe retornar true si claramente NO es un nombre
 * 
 * @param {string} text - Texto a analizar
 * @returns {boolean} true si claramente NO es un nombre
 */
function looksClearlyNotName(text) {
  if (!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if (!s) return true;

  // Saludos cortos obvios
  if (s.length <= 6 && ['hola', 'hola!', 'buenas', 'buenos', 'buen día', 'buen dia'].includes(s)) return true;

  // Stopwords
  if (NAME_STOPWORDS.has(s)) return true;

  // Palabras técnicas
  if (TECH_WORDS.test(s)) return true;

  // Demasiadas palabras (probablemente es una frase, no un nombre)
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return true;

  // Indicadores de que es un problema, no un nombre
  const indicators = ['mi', 'no', 'enciende', 'tengo', 'problema', 'problemas', 'se', 'me', 'con', 'esta', 'está', 'tiene'];
  for (const w of words) { 
    if (indicators.includes(w)) return true; 
  }

  return false;
}

// ========================================================
// 🎯 HANDLER: handleAskNameStage
// ========================================================
// 
// Esta función procesa las respuestas del usuario en la Etapa 2
// Maneja varios casos:
// 1. Usuario escribe un nombre válido → guardar y avanzar a ASK_NEED
// 2. Usuario escribe algo inválido → pedir nombre de nuevo
// 3. Usuario escribe solo saludos → pedir nombre de nuevo
// 4. Después de varios intentos → continuar sin nombre
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 2
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - El límite de intentos (MAX_NAME_ATTEMPTS)
//    - Las reglas de validación (pero mantener seguridad)
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons?, handled })
//    - Debe guardar session.userName cuando el nombre es válido
//    - Debe avanzar a ASK_NEED después de obtener nombre válido
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas las reglas de validación:
// - Prueba con múltiples variaciones: "Juan", "María José", "Juan Carlos", etc.
// - Asegúrate de rechazar nombres obviamente falsos: "PC", "notebook", "hola", etc.
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa ASK_NAME
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleAskNameStage(session, userText, buttonToken, sessionId) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[ASK_NAME] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    logger.error('[ASK_NAME] ❌ userText inválido o vacío');
    return {
      ok: false,
      error: 'Texto de usuario inválido',
      handled: true
    };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[ASK_NAME] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  try {
    // Obtener locale del usuario para mensajes en el idioma correcto
    const locale = session.userLocale || 'es-AR';
    const isEnglish = String(locale).toLowerCase().startsWith('en');
    
    logger.info(`[ASK_NAME] Procesando: "${userText}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: MENSAJE VACÍO
    // ========================================
    // Si el usuario no escribió nada, pedir que escriba su nombre
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de error
    // ❌ NO MODIFICAR: Debe retornar un mensaje pidiendo el nombre
    //
    if (!userText || userText.length === 0) {
      const reply = isEnglish
        ? "I didn't receive your message. Please try typing your name again."
        : "No recibí tu mensaje. Por favor, escribí tu nombre de nuevo.";
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage,
        handled: true
      };
    }
    
    // ========================================
    // CASO 2: EXTRAER Y VALIDAR NOMBRE
    // ========================================
    // Intentar extraer un nombre válido del texto del usuario
    // La función extractName() hace todo el trabajo pesado:
    // - Limpia el texto
    // - Elimina saludos
    // - Extrae el nombre
    // - Valida que sea un nombre válido
    //
    // ✅ SE PUEDE MODIFICAR: Las reglas de validación en extractName()
    // ❌ NO MODIFICAR: Debe usar extractName() y isValidName()
    //
    const nameResult = extractName(userText);
    
    if (nameResult.valid && nameResult.name) {
      // ✅ NOMBRE VÁLIDO DETECTADO
      // Guardar el nombre en la sesión
      session.userName = nameResult.name;
      
      // Reiniciar contador de intentos (éxito)
      session.nameAttempts = 0;
      
      // Avanzar a la siguiente etapa: preguntar qué necesita
      changeStage(session, STATES.ASK_NEED);
      
      logger.info(`[ASK_NAME] ✅ Nombre extraído: ${nameResult.name} (Motivo: ${nameResult.reason})`);
      
      // ========================================
      // GENERAR MENSAJE DE BIENVENIDA CON BOTONES DE PROBLEMAS FRECUENTES
      // ========================================
      // Este mensaje se muestra después de que el usuario ingresa su nombre
      // Incluye el nombre del usuario para personalización
      // Muestra botones de problemas frecuentes para facilitar la selección
      //
      // ⚠️ CRÍTICO: Este es el mensaje que ve el usuario después de ingresar su nombre
      // ✅ SE PUEDE MODIFICAR:
      //    - El texto del mensaje (pero mantener la estructura)
      //    - Los emojis (🔘, 🚩)
      //    - El formato (markdown, HTML, etc.)
      // ❌ NO MODIFICAR:
      //    - Debe incluir el nombre del usuario (session.userName)
      //    - Debe incluir los botones de problemas frecuentes
      //    - Debe avanzar a ASK_NEED (ya se hizo arriba con changeStage)
      //
      // Si modificas el mensaje:
      // - Mantén la personalización con el nombre del usuario
      // - Mantén la opción de seleccionar problemas frecuentes
      // - Actualiza también la versión en inglés
      //
      const locale = session.userLocale || 'es-AR';
      const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
      
      // Generar mensaje según el idioma
      // El mensaje incluye instrucciones para usar los botones
      const reply = isEnglish
        ? `Perfect, ${session.userName} 😊 What can I help you with today? Or if you prefer, you can select 🔘 one of the following common problems 🚩:`
        : (isEsLatam
          ? `Perfecto, ${session.userName} 😊 ¿En qué puedo ayudarte hoy? O si prefieres puedes seleccionar 🔘 uno de los siguientes problemas 🚩:`
          : `Perfecto, ${session.userName} 😊 ¿En qué puedo ayudarte hoy? O si preferís podés seleccionar 🔘 uno de los siguientes problemas 🚩:`);
      
      // Agregar mensaje al transcript
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      
      // ========================================
      // GENERAR BOTONES DE PROBLEMAS FRECUENTES
      // ========================================
      // Estos botones permiten al usuario seleccionar rápidamente un problema común
      // Los 6 problemas más frecuentes según estadísticas de soporte técnico
      //
      // ⚠️ CRÍTICO: Estos botones se muestran después de ingresar el nombre
      // ✅ SE PUEDE MODIFICAR:
      //    - Agregar o quitar botones (pero actualizar el mapeo en /api/chat)
      //    - Cambiar el orden de los botones
      //    - Cambiar las etiquetas (labels) de los botones
      // ❌ NO MODIFICAR:
      //    - Los tokens de los botones sin actualizar el mapeo
      //    - La estructura del array retornado
      //
      // Si agregas un nuevo botón de problema:
      // 1. Agrégalo a EMBEDDED_CHAT.ui.buttons arriba
      // 2. Agrégalo a este array
      // 3. Agrega el mapeo en /api/chat (línea ~1400)
      // 4. Crea el handler que procese ese problema
      //
      const problemButtons = buildUiButtonsFromTokens([
        'BTN_NO_ENCIENDE',      // 🔌 El equipo no enciende
        'BTN_NO_INTERNET',      // 📡 Problemas de conexión a Internet
        'BTN_LENTITUD',         // 🐢 Lentitud del sistema operativo o del equipo
        'BTN_BLOQUEO',          // ❄️ Bloqueo o cuelgue de programas
        'BTN_PERIFERICOS',      // 🖨️ Problemas con periféricos externos
        'BTN_VIRUS'             // 🛡️ Infecciones de malware o virus
      ], locale);
      
      // Guardar la sesión actualizada
      await saveSessionAndTranscript(sessionId, session);
      
      // Retornar respuesta exitosa con botones
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Ahora es ASK_NEED
        buttons: problemButtons, // ⚠️ CRÍTICO: Incluir los botones de problemas frecuentes
        handled: true
      };
    }
    
    // ========================================
    // CASO 3: RESPUESTA VACÍA O SOLO SALUDOS
    // ========================================
    // Si el usuario solo escribió saludos o el texto quedó vacío después de limpiar
    // Pedir que escriba solo su nombre
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de ayuda
    // ❌ NO MODIFICAR: Debe incrementar nameAttempts
    //
    if (nameResult.reason === 'vacío' || nameResult.reason === 'solo saludos' || nameResult.reason === 'solo signos') {
      // Incrementar contador de intentos
      session.nameAttempts = (session.nameAttempts || 0) + 1;
      
      const reply = isEnglish
        ? "I didn't detect a name. Could you tell me just your name? For example: \"Ana\" or \"John Paul\"."
        : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\".";
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      logger.info(`[ASK_NAME] ⚠️ No se detectó nombre. Motivo: ${nameResult.reason}, Intentos: ${session.nameAttempts}`);
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage,
        handled: true
      };
    }
    
    // ========================================
    // CASO 4: LÍMITE DE INTENTOS ALCANZADO
    // ========================================
    // Si el usuario intentó muchas veces y no dio un nombre válido
    // Continuar sin nombre (usar nombre genérico)
    //
    // ⚠️ CRÍTICO: Este límite evita que el usuario quede atascado
    // ✅ SE PUEDE MODIFICAR: El límite (MAX_NAME_ATTEMPTS) o el nombre genérico
    // ❌ NO MODIFICAR: Debe avanzar a ASK_NEED después del límite
    //
    const MAX_NAME_ATTEMPTS = 5; // Máximo de intentos antes de continuar sin nombre
    
    if ((session.nameAttempts || 0) >= MAX_NAME_ATTEMPTS) {
      // Usar nombre genérico
      session.userName = isEnglish ? 'User' : 'Usuario';
      
      // Avanzar a la siguiente etapa
      changeStage(session, STATES.ASK_NEED);
      
      const reply = isEnglish
        ? "Let's continue without your name. Now, what do you need today? Technical help 🛠️ or assistance 🤝?"
        : "Sigamos sin tu nombre. Ahora, ¿qué necesitás hoy? ¿Ayuda técnica 🛠️ o asistencia 🤝?";
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      logger.info(`[ASK_NAME] ⚠️ Límite de intentos alcanzado, continuando sin nombre`);
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Ahora es ASK_NEED
        handled: true
      };
    }
    
    // ========================================
    // CASO 5: TEXTO CLARAMENTE NO ES UN NOMBRE
    // ========================================
    // Si el texto parece ser un problema técnico o frase genérica
    // Pedir que escriba solo su nombre
    //
    // ✅ SE PUEDE MODIFICAR: Las reglas de detección en looksClearlyNotName()
    // ❌ NO MODIFICAR: Debe incrementar nameAttempts
    //
    if (looksClearlyNotName(userText)) {
      session.nameAttempts = (session.nameAttempts || 0) + 1;
      
      const reply = isEnglish
        ? "I didn't detect a name. Could you tell me just your name? For example: \"Ana\" or \"John Paul\"."
        : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\".";
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return {
        ok: true,
        reply: reply,
        stage: session.stage,
        handled: true
      };
    }
    
    // ========================================
    // CASO 6: FALLBACK FINAL
    // ========================================
    // Si no se pudo extraer un nombre válido por cualquier razón
    // Pedir que escriba solo su nombre
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de error
    // ❌ NO MODIFICAR: Debe incrementar nameAttempts
    //
    logger.info(`[ASK_NAME] ⚠️ Fallback final alcanzado. Motivo: ${nameResult.reason || 'no parece un nombre'}`);
    session.nameAttempts = (session.nameAttempts || 0) + 1;
    
    const fallbackReply = isEnglish
      ? "I didn't detect a valid name. Please tell me only your name, for example: \"Ana\" or \"John Paul\"."
      : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: \"Ana\" o \"Juan Pablo\".";
    
    session.transcript.push({ who: 'bot', text: fallbackReply, ts: nowIso() });
    await saveSessionAndTranscript(sessionId, session);
    
    return {
      ok: true,
      reply: fallbackReply,
      stage: session.stage,
      handled: true
    };
    
  } catch (error) {
    // Manejo de errores robusto
    logger.error('[ASK_NAME] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your name. Please try again."
      : "Lo siento, hubo un error procesando tu nombre. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.ASK_NAME,
      handled: true,
      error: error.message
    };
  }
}

// ========================================================
// 🎯 ETAPA 3: PREGUNTAR QUÉ NECESITA EL USUARIO (ASK_NEED)
// ========================================================
// 
// Esta sección implementa la tercera etapa del flujo conversacional:
// 1. El usuario ve los botones de problemas frecuentes (desde Etapa 2)
// 2. El usuario selecciona un problema (ej: "El equipo no enciende")
// 3. El sistema guarda el problema y pregunta por el tipo de dispositivo
// 4. Se muestran botones para seleccionar el dispositivo
//
// ⚠️ IMPORTANTE: Esta etapa conecta la selección de problemas con la selección de dispositivos
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta
//    - El mapeo de botones de problemas a texto
//    - Los botones de dispositivos mostrados
// ❌ NO MODIFICAR:
//    - Debe guardar session.problem cuando se selecciona un problema
//    - Debe cambiar a ASK_DEVICE después de seleccionar problema
//    - Debe mostrar los botones de dispositivos
// ========================================================

/**
 * Genera los botones de selección de dispositivo
 * 
 * Esta función crea un array de botones para que el usuario seleccione
 * el tipo de dispositivo que tiene el problema
 * 
 * ⚠️ CRÍTICO: Estos botones se muestran después de seleccionar un problema
 * ✅ SE PUEDE MODIFICAR:
 *    - Las etiquetas (text) y descripciones (description)
 *    - Agregar más tipos de dispositivos
 *    - Cambiar el formato de los botones
 * ❌ NO MODIFICAR:
 *    - Los tokens (value) sin actualizar el mapeo en handleAskDeviceStage
 *    - Debe retornar un array de objetos con { text, value, description }
 * 
 * Si agregas un nuevo tipo de dispositivo:
 * 1. Agrégalo aquí con su token, text y description
 * 2. Agrega el mapeo en handleAskDeviceStage
 * 3. Actualiza EMBEDDED_CHAT.ui.buttons si es necesario
 * 
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {Array} Array de objetos { text, value, description }
 */
function getDeviceSelectionButtons(locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // Retornar botones según el idioma
  // Cada botón tiene:
  // - text: Texto visible para el usuario
  // - value: Token que se envía cuando se hace clic (debe coincidir con EMBEDDED_CHAT)
  // - description: Descripción adicional (opcional, para accesibilidad)
  // ⚠️ CRÍTICO: Los tokens deben coincidir exactamente con EMBEDDED_CHAT.ui.buttons
  // Usar buildUiButtonsFromTokens para generar los botones desde los tokens definidos
  const deviceButtonTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_NOTEBOOK', 'BTN_DEV_PC_ALLINONE'];
  const buttons = buildUiButtonsFromTokens(deviceButtonTokens, locale);
  
  // Agregar descripciones a los botones generados
  // Las descripciones ayudan con accesibilidad y UX
  return buttons.map(btn => {
    // Buscar la descripción según el token
    let description = '';
    if (btn.token === 'BTN_DEV_PC_DESKTOP') {
      description = isEn ? 'Desktop computer' : 'Computadora de escritorio';
    } else if (btn.token === 'BTN_DEV_NOTEBOOK') {
      description = isEn ? 'Laptop computer' : 'Computadora portátil';
    } else if (btn.token === 'BTN_DEV_PC_ALLINONE') {
      description = isEn ? 'All-in-one computer' : 'Computadora todo en uno';
    }
    
    // Retornar botón con descripción agregada
    return {
      text: btn.label || btn.text, // Usar label si existe, sino text
      value: btn.token, // Token del botón
      description: description // Descripción para accesibilidad
    };
  });
}

/**
 * Mapea tokens de botones de problemas a texto del problema
 * 
 * Esta función convierte el token de un botón de problema (ej: 'BTN_NO_ENCIENDE')
 * en el texto descriptivo del problema (ej: 'el equipo no enciende')
 * 
 * ⚠️ CRÍTICO: Este mapeo se usa para guardar el problema en session.problem
 * ✅ SE PUEDE MODIFICAR:
 *    - Agregar más problemas al mapeo
 *    - Cambiar los textos descriptivos
 * ❌ NO MODIFICAR:
 *    - Los tokens de los botones sin actualizar EMBEDDED_CHAT.ui.buttons
 *    - Debe retornar un objeto con 'problem' y 'problemEn'
 * 
 * Si agregas un nuevo botón de problema:
 * 1. Agrégalo a EMBEDDED_CHAT.ui.buttons
 * 2. Agrégalo aquí con su mapeo
 * 3. Agrégalo al array de problemButtons en handleAskNameStage
 * 
 * @param {string} buttonToken - Token del botón de problema (ej: 'BTN_NO_ENCIENDE')
 * @returns {object|null} Objeto con { problem, problemEn } o null si no existe
 */
function getProblemFromButton(buttonToken) {
  // Mapeo de tokens de botones a problemas
  // Cada entrada tiene:
  // - problem: Texto en español del problema
  // - problemEn: Texto en inglés del problema
  const problemButtonMap = {
    'BTN_NO_ENCIENDE': {
      problem: 'el equipo no enciende',
      problemEn: 'the device does not turn on'
    },
    'BTN_NO_INTERNET': {
      problem: 'problemas de conexión a internet',
      problemEn: 'internet connection problems'
    },
    'BTN_LENTITUD': {
      problem: 'lentitud del sistema',
      problemEn: 'system slowness'
    },
    'BTN_BLOQUEO': {
      problem: 'bloqueo o cuelgue de programas',
      problemEn: 'program freezing or crashing'
    },
    'BTN_PERIFERICOS': {
      problem: 'problemas con periféricos externos',
      problemEn: 'external peripheral problems'
    },
    'BTN_VIRUS': {
      problem: 'infecciones de malware o virus',
      problemEn: 'malware or virus infections'
    }
  };
  
  // Retornar el mapeo si existe, o null si no
  return problemButtonMap[buttonToken] || null;
}

// ========================================================
// 🎯 HANDLER: handleAskNeedStage
// ========================================================
// 
// Esta función procesa las interacciones del usuario en la etapa ASK_NEED
// Maneja varios casos:
// 1. Usuario selecciona un botón de problema → guardar problema y preguntar por dispositivo
// 2. Usuario escribe un problema → procesar texto y preguntar por dispositivo
// 3. Usuario escribe algo no relacionado → pedir que seleccione un problema
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 3
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - Las reglas de detección de problemas en texto
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons?, handled })
//    - Debe guardar session.problem cuando se detecta un problema
//    - Debe cambiar a ASK_DEVICE después de detectar problema
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas las reglas de detección:
// - Prueba con múltiples variaciones: "mi PC no enciende", "no prende", etc.
// - Asegúrate de guardar el problema correctamente en session.problem
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa ASK_NEED
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleAskNeedStage(session, userText, buttonToken, sessionId) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[ASK_NEED] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    logger.error('[ASK_NEED] ❌ userText inválido o vacío');
    return {
      ok: false,
      error: 'Texto de usuario inválido',
      handled: true
    };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[ASK_NEED] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  try {
    // Obtener locale del usuario para mensajes en el idioma correcto
    const locale = session.userLocale || 'es-AR';
    const isEnglish = String(locale).toLowerCase().startsWith('en');
    const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
    
    logger.info(`[ASK_NEED] Procesando: "${userText}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: USUARIO SELECCIONÓ UN BOTÓN DE PROBLEMA
    // ========================================
    // Si el usuario hizo clic en un botón de problema frecuente
    // (ej: "El equipo no enciende"), guardar el problema y preguntar por el dispositivo
    //
    // ⚠️ CRÍTICO: Este es el flujo principal cuando el usuario usa los botones
    // ✅ SE PUEDE MODIFICAR:
    //    - El mensaje de confirmación
    //    - Los emojis en el mensaje
    // ❌ NO MODIFICAR:
    //    - Debe guardar session.problem con el texto del problema
    //    - Debe cambiar a ASK_DEVICE después de guardar el problema
    //    - Debe mostrar los botones de dispositivos
    //
    if (buttonToken) {
      // Buscar si el botón es un botón de problema
      const problemInfo = getProblemFromButton(buttonToken);
      
      if (problemInfo) {
        // ✅ BOTÓN DE PROBLEMA DETECTADO
        // Guardar el problema en la sesión según el idioma del usuario
        session.problem = isEnglish ? problemInfo.problemEn : problemInfo.problem;
        session.needType = 'problema'; // Marcar que es un problema (no una consulta)
        
        logger.info(`[ASK_NEED] ✅ Problema seleccionado desde botón: ${session.problem}`);
        
        // Cambiar el stage a ASK_DEVICE para preguntar por el dispositivo
        changeStage(session, STATES.ASK_DEVICE);
        
        // Generar mensaje confirmando el problema y pidiendo el tipo de dispositivo
        // El mensaje incluye el problema detectado para confirmación
        const reply = isEnglish
          ? `✅ Got it! I understand the problem: ${session.problem}. What type of device is it? A desktop PC, a notebook, or an all-in-one? This will help me guide you better. 💻🖥️`
          : (isEsLatam
            ? `✅ Perfecto! Entiendo el problema: ${session.problem}. ¿Qué tipo de dispositivo es? ¿Una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️`
            : `✅ Perfecto! Entiendo el problema: ${session.problem}. ¿Qué tipo de dispositivo es? ¿Una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️`);
        
        // Generar botones de selección de dispositivo
        const deviceButtons = getDeviceSelectionButtons(locale);
        
        // Agregar mensajes al transcript
        session.transcript.push({
          who: 'user',
          text: buttonToken, // Guardar el token del botón para referencia
          ts: nowIso()
        });
        session.transcript.push({
          who: 'bot',
          text: reply,
          ts: nowIso(),
          problemSelected: session.problem // Metadata: problema seleccionado
        });
        
        // Guardar la sesión actualizada
        await saveSessionAndTranscript(sessionId, session);
        
        // Retornar respuesta exitosa con botones de dispositivos
        return {
          ok: true,
          reply: reply,
          stage: session.stage, // Ahora es ASK_DEVICE
          buttons: deviceButtons, // ⚠️ CRÍTICO: Incluir los botones de dispositivos
          handled: true
        };
      }
    }
    
    // ========================================
    // CASO 2: USUARIO ESCRIBIÓ UN PROBLEMA
    // ========================================
    // Si el usuario escribió texto (no hizo clic en botón)
    // Intentar detectar si mencionó un problema
    //
    // ⚠️ CRÍTICO: Este caso permite que el usuario escriba libremente
    // ✅ SE PUEDE MODIFICAR:
    //    - Las reglas de detección de problemas
    //    - Los mensajes de respuesta
    // ❌ NO MODIFICAR:
    //    - Debe guardar session.problem si detecta un problema
    //    - Debe cambiar a ASK_DEVICE después de detectar problema
    //
    // NOTA: Por ahora, si el usuario escribe, pedimos que use los botones
    // En el futuro, aquí se puede agregar detección inteligente de problemas
    //
    const lowerText = userText.toLowerCase().trim();
    
    // Detectar si el usuario mencionó un problema común
    // Patrones simples para detectar problemas mencionados en los botones
    const problemPatterns = {
      'el equipo no enciende': { problem: 'el equipo no enciende', problemEn: 'the device does not turn on' },
      'no enciende': { problem: 'el equipo no enciende', problemEn: 'the device does not turn on' },
      'no prende': { problem: 'el equipo no enciende', problemEn: 'the device does not turn on' },
      'problemas de conexión': { problem: 'problemas de conexión a internet', problemEn: 'internet connection problems' },
      'no hay internet': { problem: 'problemas de conexión a internet', problemEn: 'internet connection problems' },
      'lentitud': { problem: 'lentitud del sistema', problemEn: 'system slowness' },
      'lento': { problem: 'lentitud del sistema', problemEn: 'system slowness' },
      'bloqueo': { problem: 'bloqueo o cuelgue de programas', problemEn: 'program freezing or crashing' },
      'se cuelga': { problem: 'bloqueo o cuelgue de programas', problemEn: 'program freezing or crashing' },
      'periféricos': { problem: 'problemas con periféricos externos', problemEn: 'external peripheral problems' },
      'virus': { problem: 'infecciones de malware o virus', problemEn: 'malware or virus infections' },
      'malware': { problem: 'infecciones de malware o virus', problemEn: 'malware or virus infections' }
    };
    
    // Buscar si el texto del usuario coincide con algún patrón
    for (const [pattern, problemInfo] of Object.entries(problemPatterns)) {
      if (lowerText.includes(pattern)) {
        // ✅ PROBLEMA DETECTADO EN TEXTO
        // Guardar el problema en la sesión según el idioma del usuario
        session.problem = isEnglish ? problemInfo.problemEn : problemInfo.problem;
        session.needType = 'problema';
        
        logger.info(`[ASK_NEED] ✅ Problema detectado en texto: ${session.problem}`);
        
        // Cambiar el stage a ASK_DEVICE
        changeStage(session, STATES.ASK_DEVICE);
        
        // Generar mensaje confirmando el problema y pidiendo el tipo de dispositivo
        const reply = isEnglish
          ? `✅ Got it! I understand the problem: ${session.problem}. What type of device is it? A desktop PC, a notebook, or an all-in-one? This will help me guide you better. 💻🖥️`
          : (isEsLatam
            ? `✅ Perfecto! Entiendo el problema: ${session.problem}. ¿Qué tipo de dispositivo es? ¿Una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️`
            : `✅ Perfecto! Entiendo el problema: ${session.problem}. ¿Qué tipo de dispositivo es? ¿Una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️`);
        
        // Generar botones de selección de dispositivo
        const deviceButtons = getDeviceSelectionButtons(locale);
        
        // Agregar mensajes al transcript
        session.transcript.push({
          who: 'user',
          text: userText,
          ts: nowIso()
        });
        session.transcript.push({
          who: 'bot',
          text: reply,
          ts: nowIso(),
          problemDetected: session.problem // Metadata: problema detectado
        });
        
        // Guardar la sesión actualizada
        await saveSessionAndTranscript(sessionId, session);
        
        // Retornar respuesta exitosa con botones de dispositivos
        return {
          ok: true,
          reply: reply,
          stage: session.stage, // Ahora es ASK_DEVICE
          buttons: deviceButtons,
          handled: true
        };
      }
    }
    
    // ========================================
    // CASO 3: FALLBACK - NO SE DETECTÓ PROBLEMA
    // ========================================
    // Si el usuario escribió algo que no coincide con ningún problema conocido
    // Pedir que seleccione uno de los botones de problemas frecuentes
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de ayuda
    // ❌ NO MODIFICAR: Debe mostrar los botones de problemas frecuentes
    //
    const fallbackReply = isEnglish
      ? "I didn't quite understand. Could you please select one of the common problems using the buttons above? Or describe your problem in more detail."
      : (isEsLatam
        ? "No entendí bien. ¿Podrías seleccionar uno de los problemas comunes usando los botones de arriba? O describe tu problema con más detalle."
        : "No entendí bien. ¿Podrías seleccionar uno de los problemas comunes usando los botones de arriba? O describí tu problema con más detalle.");
    
    // Generar botones de problemas frecuentes para que el usuario pueda seleccionar
    const problemButtons = buildUiButtonsFromTokens([
      'BTN_NO_ENCIENDE',
      'BTN_NO_INTERNET',
      'BTN_LENTITUD',
      'BTN_BLOQUEO',
      'BTN_PERIFERICOS',
      'BTN_VIRUS'
    ], locale);
    
    // Agregar mensajes al transcript
    session.transcript.push({
      who: 'user',
      text: userText,
      ts: nowIso()
    });
    session.transcript.push({
      who: 'bot',
      text: fallbackReply,
      ts: nowIso()
    });
    
    // Guardar la sesión actualizada
    await saveSessionAndTranscript(sessionId, session);
    
    // Retornar respuesta con botones de problemas frecuentes
    return {
      ok: true,
      reply: fallbackReply,
      stage: session.stage, // Sigue siendo ASK_NEED
      buttons: problemButtons, // Mostrar botones de problemas frecuentes
      handled: true
    };
    
  } catch (error) {
    // Manejo de errores robusto
    logger.error('[ASK_NEED] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.ASK_NEED,
      handled: true,
      error: error.message
    };
  }
}

// ========================================================
// 🎯 FUNCIONES AUXILIARES PARA GENERACIÓN DE PASOS
// ========================================================
// 
// Estas funciones se usan para formatear y mostrar los pasos de diagnóstico
// Incluyen emojis, niveles de dificultad, tiempo estimado, etc.
//
// ⚠️ CRÍTICO: Estas funciones determinan cómo se ven los pasos para el usuario
// ✅ SE PUEDE MODIFICAR:
//    - Los emojis usados
//    - Los niveles de dificultad
//    - Los tiempos estimados
//    - Los mensajes de confirmación
// ❌ NO MODIFICAR:
//    - Debe retornar valores consistentes (mismo formato siempre)
//    - Los índices deben ser 0-based para los arrays
// ========================================================

/**
 * Array de emojis numéricos para mostrar números de pasos
 * Soporta hasta 15 pasos (1-15)
 * 
 * ✅ SE PUEDE MODIFICAR: Los emojis usados
 * ❌ NO MODIFICAR: Debe tener al menos 11 elementos (0-10)
 */
const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Obtiene el emoji para un índice dado (0-based)
 * Soporta hasta 15 pasos (1-15)
 * 
 * Ejemplos:
 * - emojiForIndex(0) → "1️⃣"
 * - emojiForIndex(9) → "🔟"
 * - emojiForIndex(10) → "1️⃣1️⃣"
 * 
 * ✅ SE PUEDE MODIFICAR: La lógica de combinación de emojis
 * ❌ NO MODIFICAR: Debe retornar un string con emojis
 * 
 * @param {number} i - Índice del paso (0-based)
 * @returns {string} Emoji del número del paso
 */
function emojiForIndex(i) {
  const n = i + 1; // Convertir a 1-based
  if (n <= 10) {
    return NUM_EMOJIS[n] || `${n}.`;
  }
  // Para números mayores a 10, combinar emojis
  // Ejemplo: 11 = 1️⃣1️⃣, 12 = 1️⃣2️⃣, etc.
  const digits = String(n).split('');
  return digits.map(d => NUM_EMOJIS[parseInt(d)] || d).join('');
}

/**
 * Obtiene el nivel de dificultad para un índice de paso (0-14)
 * 
 * Distribución de dificultad:
 * - Pasos 0-2 (1-3): Muy fácil (⭐)
 * - Pasos 3-5 (4-6): Fácil (⭐⭐)
 * - Pasos 6-8 (7-9): Intermedio (⭐⭐⭐)
 * - Pasos 9-11 (10-12): Difícil (⭐⭐⭐⭐)
 * - Pasos 12-14 (13-15): Muy difícil (⭐⭐⭐⭐⭐)
 * 
 * ⚠️ CRÍTICO: Esta función determina la dificultad mostrada al usuario
 * ✅ SE PUEDE MODIFICAR:
 *    - Los rangos de índices para cada nivel
 *    - Las etiquetas de dificultad
 *    - Los emojis de estrellas
 * ❌ NO MODIFICAR:
 *    - Debe retornar un objeto con { level, stars, label }
 *    - Los niveles deben ir de 1 a 5
 * 
 * @param {number} stepIndex - Índice del paso (0-based, 0-14)
 * @returns {object} { level: 1-5, stars: string, label: string }
 */
function getDifficultyForStep(stepIndex) {
  if (stepIndex < 3) {
    return { level: 1, stars: '⭐', label: 'Muy fácil' };
  } else if (stepIndex < 6) {
    return { level: 2, stars: '⭐⭐', label: 'Fácil' };
  } else if (stepIndex < 9) {
    return { level: 3, stars: '⭐⭐⭐', label: 'Intermedio' };
  } else if (stepIndex < 12) {
    return { level: 4, stars: '⭐⭐⭐⭐', label: 'Difícil' };
  } else {
    return { level: 5, stars: '⭐⭐⭐⭐⭐', label: 'Muy difícil' };
  }
}

/**
 * Estima el tiempo por paso individual
 * 
 * Distribución de tiempo estimado:
 * - Pasos 0-2 (1-3): 2-5 minutos
 * - Pasos 3-5 (4-6): 3-6 minutos
 * - Pasos 6-8 (7-9): 5-10 minutos
 * - Pasos 9-11 (10-12): 10-20 minutos
 * - Pasos 12-14 (13-15): 15-30 minutos
 * 
 * ⚠️ CRÍTICO: Esta función determina el tiempo mostrado al usuario
 * ✅ SE PUEDE MODIFICAR:
 *    - Los rangos de tiempo para cada nivel
 *    - El formato del mensaje
 * ❌ NO MODIFICAR:
 *    - Debe retornar un string con el tiempo estimado
 *    - Debe ser consistente con getDifficultyForStep()
 * 
 * @param {string} stepText - Texto del paso (no usado actualmente, pero puede usarse en el futuro)
 * @param {number} stepIndex - Índice del paso (0-based, 0-14)
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {string} Mensaje con tiempo estimado (ej: "2-5 minutos")
 */
function estimateStepTime(stepText = '', stepIndex = 0, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (stepIndex < 3) {
    return isEn ? '2-5 minutes' : '2-5 minutos';
  } else if (stepIndex < 6) {
    return isEn ? '3-6 minutes' : '3-6 minutos';
  } else if (stepIndex < 9) {
    return isEn ? '5-10 minutes' : '5-10 minutos';
  } else if (stepIndex < 12) {
    return isEn ? '10-20 minutes' : '10-20 minutos';
  } else {
    return isEn ? '15-30 minutes' : '15-30 minutos';
  }
}

/**
 * Obtiene un saludo personalizado usando el nombre del usuario
 * 
 * Esta función genera variaciones de saludos para hacer la conversación más natural
 * Ejemplos: "Dale, Hugo", "Perfecto, Hugo", "Entendido, Hugo"
 * 
 * ✅ SE PUEDE MODIFICAR:
 *    - Los saludos disponibles
 *    - La lógica de selección de variación
 * ❌ NO MODIFICAR:
 *    - Debe retornar un string con el nombre del usuario
 *    - Debe soportar ambos idiomas
 * 
 * @param {string} name - Nombre del usuario
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @param {number} variation - Variación del saludo (0-4)
 * @returns {string} Saludo personalizado
 */
function getPersonalizedGreeting(name, locale = 'es-AR', variation = 0) {
  if (!name) return '';
  
  const isEn = String(locale).toLowerCase().startsWith('en');
  // Capitalizar nombre correctamente (primera letra de cada palabra)
  const capitalizedName = name.split(' ').map(n => 
    n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
  ).join(' ');
  
  const greetings = isEn
    ? [
        `${capitalizedName}`,
        `Perfect, ${capitalizedName}`,
        `Got it, ${capitalizedName}`,
        `Alright, ${capitalizedName}`,
        `Understood, ${capitalizedName}`
      ]
    : [
        `${capitalizedName}`,
        `Perfecto, ${capitalizedName}`,
        `Entendido, ${capitalizedName}`,
        `Dale, ${capitalizedName}`,
        `Bien, ${capitalizedName}`
      ];
  
  return greetings[variation % greetings.length];
}

/**
 * Genera un mensaje de confirmación para acciones del usuario
 * 
 * Esta función genera mensajes de confirmación según el tipo de acción
 * Ejemplos: "✅ Perfecto! Anoté tu problema: 'el equipo no enciende'"
 * 
 * ✅ SE PUEDE MODIFICAR:
 *    - Los mensajes de confirmación
 *    - Agregar más tipos de acciones
 * ❌ NO MODIFICAR:
 *    - Debe retornar un string con el mensaje
 *    - Debe soportar ambos idiomas
 * 
 * @param {string} action - Tipo de acción ('problem', 'device', etc.)
 * @param {object} data - Datos relacionados (ej: { problem: '...' })
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {string} Mensaje de confirmación
 */
function getConfirmationMessage(action, data = {}, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  const confirmations = {
    problem: isEn
      ? `✅ Got it! I've noted your problem: "${data.problem}"`
      : `✅ Perfecto! Anoté tu problema: "${data.problem}"`,
    
    device: isEn
      ? `✅ Perfect! I've set your device as: ${data.device}`
      : `✅ Perfecto! Configuré tu dispositivo como: ${data.device}`,
    
    default: isEn
      ? `✅ Done!`
      : `✅ ¡Listo!`
  };
  
  return confirmations[action] || confirmations.default;
}

/**
 * Genera un tip proactivo relacionado con el problema
 * 
 * Esta función genera tips útiles según el tipo de problema detectado
 * Ejemplo: "💡 Tip: Si tu equipo no enciende, revisá el cable de alimentación..."
 * 
 * ✅ SE PUEDE MODIFICAR:
 *    - Los tips disponibles
 *    - La lógica de detección de problemas
 * ❌ NO MODIFICAR:
 *    - Debe retornar un string con el tip o null si no hay tip
 *    - Debe soportar ambos idiomas
 * 
 * @param {string} problem - Descripción del problema
 * @param {string} deviceLabel - Etiqueta del dispositivo (ej: "PC de escritorio")
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {string|null} Tip proactivo o null si no hay tip
 */
function getProactiveTip(problem = '', deviceLabel = '', locale = 'es-AR') {
  if (!problem) return null;
  
  const isEn = String(locale).toLowerCase().startsWith('en');
  const normalizedProblem = problem.toLowerCase();
  
  const tips = {
    'no enciende': isEn
      ? "💡 Tip: If your device doesn't turn on, check the power cable and try a different outlet."
      : "💡 Tip: Si tu equipo no enciende, revisá el cable de alimentación y probá en otro enchufe.",
    
    'lento': isEn
      ? "💡 Tip: A slow computer can be caused by too many programs running. Try closing unnecessary apps."
      : "💡 Tip: Una computadora lenta puede ser por muchos programas abiertos. Probá cerrando aplicaciones innecesarias.",
    
    'default': isEn
      ? "💡 Tip: Make sure all cables are properly connected before trying advanced solutions."
      : "💡 Tip: Asegurate de que todos los cables estén bien conectados antes de probar soluciones avanzadas."
  };
  
  // Detectar tipo de problema
  if (normalizedProblem.includes('no enciende') || normalizedProblem.includes('no prende') || normalizedProblem.includes('no arranca')) {
    return tips['no enciende'];
  } else if (normalizedProblem.includes('lento') || normalizedProblem.includes('lenta') || normalizedProblem.includes('slow')) {
    return tips['lento'];
  }
  
  return tips.default;
}

/**
 * Normaliza el texto de un paso para comparación
 * 
 * Esta función limpia y normaliza el texto de un paso para evitar duplicados
 * Elimina espacios múltiples y convierte a minúsculas
 * 
 * ✅ SE PUEDE MODIFICAR: La lógica de normalización
 * ❌ NO MODIFICAR: Debe retornar un string normalizado
 * 
 * @param {string} s - Texto del paso
 * @returns {string} Texto normalizado
 */
function normalizeStepText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ========================================================
// 🎯 ETAPA 4: PREGUNTAR TIPO DE DISPOSITIVO (ASK_DEVICE)
// ========================================================
// 
// Esta sección implementa la cuarta etapa del flujo conversacional:
// 1. El usuario seleccionó un problema (desde Etapa 3)
// 2. El usuario selecciona un tipo de dispositivo (PC de escritorio, Notebook, All in one)
// 3. El sistema guarda el dispositivo y genera los pasos de diagnóstico
// 4. Se muestran 15 pasos con dificultad, tiempo estimado y botones de ayuda
//
// ⚠️ IMPORTANTE: Esta etapa conecta la selección de dispositivo con la generación de pasos
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de confirmación
//    - El mapeo de botones de dispositivos a valores
//    - La lógica de generación de pasos
// ❌ NO MODIFICAR:
//    - Debe guardar session.device cuando se selecciona un dispositivo
//    - Debe cambiar a BASIC_TESTS después de seleccionar dispositivo
//    - Debe generar y mostrar los pasos de diagnóstico
// ========================================================

/**
 * Mapea tokens de botones de dispositivos a configuración del dispositivo
 * 
 * Esta función convierte el token de un botón de dispositivo (ej: 'BTN_DEV_PC_DESKTOP')
 * en la configuración del dispositivo (device, pcType, label)
 * 
 * ⚠️ CRÍTICO: Este mapeo se usa para guardar el dispositivo en session.device
 * ✅ SE PUEDE MODIFICAR:
//    - Agregar más tipos de dispositivos
//    - Cambiar las etiquetas (labels)
// ❌ NO MODIFICAR:
//    - Los tokens de los botones sin actualizar EMBEDDED_CHAT.ui.buttons
//    - Debe retornar un objeto con { device, pcType?, label }
// 
 * @param {string} buttonToken - Token del botón de dispositivo (ej: 'BTN_DEV_PC_DESKTOP')
 * @returns {object|null} Objeto con { device, pcType?, label } o null si no existe
 */
function getDeviceFromButton(buttonToken) {
  const deviceMap = {
    'BTN_DEV_PC_DESKTOP': { 
      device: 'pc', 
      pcType: 'desktop', 
      label: 'PC de escritorio' 
    },
    'BTN_DEV_PC_ALLINONE': { 
      device: 'pc', 
      pcType: 'all_in_one', 
      label: 'PC All in One' 
    },
    'BTN_DEV_NOTEBOOK': { 
      device: 'notebook', 
      pcType: null, 
      label: 'Notebook' 
    }
  };
  
  return deviceMap[buttonToken] || null;
}

/**
 * Genera pasos de diagnóstico básicos para un problema
 * 
 * Esta función genera 15 pasos de diagnóstico según el problema y dispositivo
 * Por ahora, genera pasos genéricos. En el futuro, puede usar IA o playbooks
 * 
 * ⚠️ CRÍTICO: Esta función determina qué pasos ve el usuario
 * ✅ SE PUEDE MODIFICAR:
//    - Agregar más pasos específicos según problema/dispositivo
//    - Integrar con IA para generar pasos personalizados
//    - Usar playbooks predefinidos
// ❌ NO MODIFICAR:
//    - Debe retornar un array de exactamente 15 pasos
//    - Cada paso debe ser un string descriptivo
// 
 * @param {string} problem - Descripción del problema
 * @param {string} device - Tipo de dispositivo ('pc', 'notebook', etc.)
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {Array<string>} Array de 15 pasos de diagnóstico
 */
function generateDiagnosticSteps(problem = '', device = '', locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const problemLower = problem.toLowerCase();
  
  // Pasos específicos para "el equipo no enciende"
  if (problemLower.includes('no enciende') || problemLower.includes('no prende') || problemLower.includes('no arranca')) {
    return isEn ? [
      'Make sure the device is connected to power.',
      'Verify that the outlet works by testing with another device.',
      'Check that the power supply switch is turned on.',
      'Check that all cables are properly connected at the back of the device.',
      'Try pressing the power button for a few seconds.',
      'Listen for any sounds when turning on, such as fans or beeps.',
      'Check that there are no lights on the device when trying to turn it on.',
      'If the device has a battery, try removing it and putting it back.',
      'Connect the device to another monitor to rule out display problems.',
      'Access the BIOS by pressing the corresponding key when turning on the device.',
      'Check the boot configuration in the BIOS to make sure the hard drive is detected.',
      'Update the motherboard firmware if necessary from the manufacturer\'s website.',
      'Use a hardware diagnostic tool to check the status of components.',
      'Review system event logs to identify critical errors.',
      'If everything fails, consider taking the device to a specialized technical service.'
    ] : [
      'Asegurarte de que el equipo esté conectado a la corriente.',
      'Verificar que el enchufe funcione probando con otro dispositivo.',
      'Comprobar que el interruptor de la fuente de alimentación esté encendido.',
      'Revisar que todos los cables estén bien conectados en la parte trasera del equipo.',
      'Probar presionar el botón de encendido durante unos segundos.',
      'Escuchar si hay algún sonido al encender, como ventiladores o pitidos.',
      'Verificar que no haya luces encendidas en el equipo al intentar encenderlo.',
      'Si el equipo tiene una batería, intentar quitarla y volver a colocarla.',
      'Conectar el equipo a otro monitor para descartar problemas de visualización.',
      'Acceder a la BIOS presionando la tecla correspondiente al encender el equipo.',
      'Revisar la configuración de arranque en la BIOS para asegurarte de que el disco duro esté detectado.',
      'Actualizar el firmware de la placa madre si es necesario desde el sitio del fabricante.',
      'Utilizar una herramienta de diagnóstico de hardware para verificar el estado de los componentes.',
      'Revisar los registros de eventos del sistema para identificar errores críticos.',
      'Si todo falla, considerar llevar el equipo a un servicio técnico especializado.'
    ];
  }
  
  // Pasos genéricos para otros problemas
  return isEn ? [
    'Complete shutdown: Unplug the device from the wall, wait 30 seconds and plug it back in.',
    'Check connections: Power cable firmly connected. Monitor connected (HDMI / VGA / DP). Try turning it on again.',
    'Check for software updates and install any pending updates.',
    'Review system logs for errors or warnings.',
    'Test the device in safe mode to isolate software issues.',
    'Perform a system restore to a previous working state.',
    'Check device manager for hardware conflicts or driver issues.',
    'Run system diagnostics tools provided by the manufacturer.',
    'Verify BIOS/UEFI settings are correct for your hardware.',
    'Test individual components (RAM, hard drive, etc.) using diagnostic tools.',
    'Review and modify advanced system settings if necessary.',
    'Contact technical support with detailed information about the problem and steps already tried.',
    'Additional diagnostic step 13: Review and document any error messages or unusual behavior.',
    'Additional diagnostic step 14: Review and document any error messages or unusual behavior.',
    'Additional diagnostic step 15: Review and document any error messages or unusual behavior.'
  ] : [
    'Apagado completo: Desenchufá el equipo de la pared, esperá 30 segundos y volvé a conectarlo.',
    'Revisá las conexiones: Cable de corriente bien firme. Monitor conectado (HDMI / VGA / DP). Probá encender nuevamente.',
    'Verificá actualizaciones de software e instalá las pendientes.',
    'Revisá los registros del sistema en busca de errores o advertencias.',
    'Probá el equipo en modo seguro para aislar problemas de software.',
    'Realizá una restauración del sistema a un estado anterior que funcionaba.',
    'Revisá el administrador de dispositivos en busca de conflictos de hardware o problemas de drivers.',
    'Ejecutá herramientas de diagnóstico del sistema proporcionadas por el fabricante.',
    'Verificá que la configuración del BIOS/UEFI sea correcta para tu hardware.',
    'Probá componentes individuales (RAM, disco duro, etc.) usando herramientas de diagnóstico.',
    'Revisá y modificá configuraciones avanzadas del sistema si es necesario.',
    'Contactá soporte técnico con información detallada sobre el problema y los pasos que ya probaste.',
    'Paso de diagnóstico adicional 13: Revisá y documentá cualquier mensaje de error o comportamiento inusual.',
    'Paso de diagnóstico adicional 14: Revisá y documentá cualquier mensaje de error o comportamiento inusual.',
    'Paso de diagnóstico adicional 15: Revisá y documentá cualquier mensaje de error o comportamiento inusual.'
  ];
}

// ========================================================
// 🎯 HANDLER: handleAskDeviceStage
// ========================================================
// 
// Esta función procesa las interacciones del usuario en la etapa ASK_DEVICE
// Maneja varios casos:
// 1. Usuario selecciona un botón de dispositivo → guardar dispositivo y generar pasos
// 2. Usuario escribe un dispositivo → detectar en texto y generar pasos
// 3. Fallback → pedir que seleccione un dispositivo usando los botones
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 4
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - Las reglas de detección de dispositivos en texto
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons?, handled })
//    - Debe guardar session.device cuando se detecta un dispositivo
//    - Debe cambiar a BASIC_TESTS después de detectar dispositivo
//    - Debe generar y mostrar los pasos de diagnóstico
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas las reglas de detección:
// - Prueba con múltiples variaciones: "PC de escritorio", "desktop", "computadora", etc.
// - Asegúrate de guardar el dispositivo correctamente en session.device
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa ASK_DEVICE
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleAskDeviceStage(session, userText, buttonToken, sessionId) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[ASK_DEVICE] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  // userText puede ser opcional si se usa buttonToken
  if (userText && (typeof userText !== 'string' || userText.trim().length === 0)) {
    logger.warn('[ASK_DEVICE] ⚠️  userText inválido, pero puede continuar con buttonToken');
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[ASK_DEVICE] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  try {
    // Obtener locale del usuario para mensajes en el idioma correcto
    const locale = session.userLocale || 'es-AR';
    const isEnglish = String(locale).toLowerCase().startsWith('en');
    const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
    
    logger.info(`[ASK_DEVICE] Procesando: "${userText}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: USUARIO SELECCIONÓ UN BOTÓN DE DISPOSITIVO
    // ========================================
    // Si el usuario hizo clic en un botón de dispositivo
    // (ej: "PC de escritorio"), guardar el dispositivo y generar pasos
    //
    // ⚠️ CRÍTICO: Este es el flujo principal cuando el usuario usa los botones
    // ✅ SE PUEDE MODIFICAR:
    //    - El mensaje de confirmación
    //    - La lógica de generación de pasos
    // ❌ NO MODIFICAR:
    //    - Debe guardar session.device con el tipo de dispositivo
    //    - Debe guardar session.pcType si es PC (desktop o all_in_one)
    //    - Debe cambiar a BASIC_TESTS después de guardar dispositivo
    //    - Debe generar y mostrar los pasos de diagnóstico
    //
    if (buttonToken) {
      // Buscar si el botón es un botón de dispositivo
      const deviceCfg = getDeviceFromButton(buttonToken);
      
      if (deviceCfg) {
        // ✅ BOTÓN DE DISPOSITIVO DETECTADO
        // Guardar el dispositivo en la sesión
        session.device = deviceCfg.device;
        if (deviceCfg.pcType) {
          session.pcType = deviceCfg.pcType;
        }
        session.pendingDeviceGroup = null;
        
        logger.info(`[ASK_DEVICE] ✅ Dispositivo seleccionado: ${deviceCfg.label} (${deviceCfg.device})`);
        
        // Verificar que haya un problema guardado
        // Si no hay problema, preguntar por él
        if (!session.problem || String(session.problem || '').trim() === '') {
          // No hay problema guardado, preguntar por él
          changeStage(session, STATES.ASK_PROBLEM);
          
          const whoLabel = session.userName ? session.userName.split(' ').map(n => 
            n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
          ).join(' ') : (isEnglish ? 'User' : 'Usuari@');
          
          const reply = isEnglish
            ? `Perfect, ${whoLabel}. I understand you're referring to ${deviceCfg.label}. Tell me, what problem does it have?`
            : (isEsLatam
              ? `Perfecto, ${whoLabel}. Entiendo que te refieres a ${deviceCfg.label}. Cuéntame, ¿qué problema presenta?`
              : `Perfecto, ${whoLabel}. Tomo que te referís a ${deviceCfg.label}. Contame, ¿qué problema presenta?`);
          
          session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
          await saveSessionAndTranscript(sessionId, session);
          
          return {
            ok: true,
            reply: reply,
            stage: session.stage,
            handled: true
          };
        }
        
        // Hay problema guardado, generar y mostrar pasos
        // Cambiar el stage a BASIC_TESTS
        changeStage(session, STATES.BASIC_TESTS);
        
        // Generar pasos de diagnóstico
        const steps = generateDiagnosticSteps(session.problem, session.device, locale);
        
        // Guardar los pasos en la sesión
        session.basicTests = steps;
        session.tests = session.tests || {};
        session.tests.basic = Array.isArray(steps) ? steps : [];
        session.currentTestIndex = 0;
        
        // Generar mensaje de introducción con confirmación
        const who = session.userName ? getPersonalizedGreeting(
          session.userName, 
          locale, 
          Math.floor(Math.random() * 5)
        ) : null;
        
        const deviceLabel = deviceCfg.label;
        const problemSummary = (session.problem || '').trim().slice(0, 200);
        
        // Mensaje de confirmación del problema
        const problemConfirmation = getConfirmationMessage('problem', { problem: problemSummary }, locale);
        
        // Tip proactivo relacionado con el problema
        const proactiveTip = getProactiveTip(problemSummary, deviceLabel, locale);
        
        // Generar mensaje de introducción
        let intro;
        if (isEnglish) {
          intro = who
            ? `${who}.\n\n${problemConfirmation}\n\nSo, with your ${deviceLabel}, let's try a few quick steps together 🔧⚡:`
            : `${problemConfirmation}\n\nSo, with your ${deviceLabel}, let's try a few quick steps together 🔧⚡:`;
        } else if (isEsLatam) {
          intro = who
            ? `${who}.\n\n${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`
            : `${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`;
        } else {
          intro = who
            ? `${who}.\n\n${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`
            : `${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`;
        }
        
        // Agregar tip proactivo si existe
        if (proactiveTip) {
          intro += `\n\n${proactiveTip}`;
        }
        
        // Formatear pasos con emojis, niveles de dificultad, tiempo estimado y botones de ayuda
        const stepsWithHelp = steps.map((step, idx) => {
          const emoji = emojiForIndex(idx);
          const difficulty = getDifficultyForStep(idx);
          const estimatedTime = estimateStepTime(step, idx, locale);
          const timeLabel = isEnglish ? '⏱️ Estimated time:' : '⏱️ Tiempo estimado:';
          const helpButtonText = isEnglish ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`;
          return `Paso ${emoji} Dificultad: ${difficulty.stars}\n\n${timeLabel} ${estimatedTime}\n\n${step}\n\n${helpButtonText}`;
        });
        const stepsText = stepsWithHelp.join('\n\n');
        
        // Generar mensaje final
        const footer = isEnglish
          ? '\n\nWhen you finish trying these steps, let me know the result by selecting one of the options below:'
          : '\n\nCuando termines de probar estos pasos, avisame el resultado seleccionando una de las opciones abajo:';
        
        const reply = `${intro}\n\n${stepsText}${footer}`;
        
        // Generar botones: ayuda para cada paso + botones finales
        const buttons = [];
        
        // Botones de ayuda para cada paso (debajo de cada paso)
        steps.forEach((step, idx) => {
          const emoji = emojiForIndex(idx);
          buttons.push({
            text: isEnglish ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`,
            value: `BTN_HELP_STEP_${idx}`,
            description: isEnglish ? `Get detailed help for step ${idx + 1}` : `Obtener ayuda detallada para el paso ${idx + 1}`
          });
        });
        
        // Botones finales (3 botones principales)
        // 1. Botón El Problema Persiste
        buttons.push({
          text: isEnglish ? '❌ The Problem Persists' : '❌ El Problema Persiste',
          value: 'BTN_PERSIST',
          description: isEnglish ? 'I still have the issue' : 'Sigo con el inconveniente'
        });
        
        // 2. Botón Lo pude Solucionar
        buttons.push({
          text: isEnglish ? '✔️ I Solved It' : '✔️ Lo pude Solucionar',
          value: 'BTN_SOLVED',
          description: isEnglish ? 'The problem is gone' : 'El problema desapareció'
        });
        
        // 3. Botón Hablar con un Técnico
        buttons.push({
          text: isEnglish ? '🧑‍🔧 Talk to a Technician' : '🧑‍🔧 Hablar con un Técnico',
          value: 'BTN_WHATSAPP_TECNICO',
          description: isEnglish ? 'Connect with a human technician' : 'Conectar con un técnico humano'
        });
        
        // Agregar mensajes al transcript
        session.transcript.push({
          who: 'user',
          text: buttonToken, // Guardar el token del botón para referencia
          ts: nowIso()
        });
        session.transcript.push({
          who: 'bot',
          text: reply,
          ts: nowIso(),
          deviceSelected: session.device, // Metadata: dispositivo seleccionado
          stepsGenerated: steps.length // Metadata: cantidad de pasos generados
        });
        
        // Guardar la sesión actualizada
        await saveSessionAndTranscript(sessionId, session);
        
        // Retornar respuesta exitosa con pasos y botones
        return {
          ok: true,
          reply: reply,
          stage: session.stage, // Ahora es BASIC_TESTS
          buttons: buttons, // ⚠️ CRÍTICO: Incluir los botones de ayuda y resultado
          handled: true
        };
      }
    }
    
    // ========================================
    // CASO 2: FALLBACK - NO SE DETECTÓ DISPOSITIVO
    // ========================================
    // Si el usuario escribió algo que no coincide con ningún dispositivo conocido
    // Pedir que seleccione uno de los botones de dispositivos
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de ayuda
    // ❌ NO MODIFICAR: Debe mostrar los botones de dispositivos
    //
    const fallbackReply = isEnglish
      ? "I didn't quite understand. Could you please select one of the device options using the buttons above?"
      : (isEsLatam
        ? "No entendí bien. ¿Podrías seleccionar una de las opciones de dispositivo usando los botones de arriba?"
        : "No entendí bien. ¿Podrías seleccionar una de las opciones de dispositivo usando los botones de arriba?");
    
    // Generar botones de dispositivos para que el usuario pueda seleccionar
    const deviceButtons = getDeviceSelectionButtons(locale);
    
    // Agregar mensajes al transcript
    session.transcript.push({
      who: 'user',
      text: userText,
      ts: nowIso()
    });
    session.transcript.push({
      who: 'bot',
      text: fallbackReply,
      ts: nowIso()
    });
    
    // Guardar la sesión actualizada
    await saveSessionAndTranscript(sessionId, session);
    
    // Retornar respuesta con botones de dispositivos
    return {
      ok: true,
      reply: fallbackReply,
      stage: session.stage, // Sigue siendo ASK_DEVICE
      buttons: deviceButtons, // Mostrar botones de dispositivos
      handled: true
    };
    
  } catch (error) {
    // Manejo de errores robusto
    logger.error('[ASK_DEVICE] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.ASK_DEVICE,
      handled: true,
      error: error.message
    };
  }
}

// ========================================================
// 🎯 ETAPA 5: AYUDAR CON PASOS DE DIAGNÓSTICO (BASIC_TESTS)
// ========================================================
// 
// Esta sección implementa la quinta etapa del flujo conversacional:
// 1. El usuario ve los 15 pasos de diagnóstico (desde Etapa 4)
// 2. El usuario hace clic en "🆘 Ayuda Paso X" para obtener ayuda detallada
// 3. El sistema genera una explicación detallada del paso con subpasos
// 4. Se muestran botones para continuar (Lo pude solucionar, Volver a los pasos, Conectar con técnico)
//
// ⚠️ IMPORTANTE: Esta etapa permite al usuario obtener ayuda específica para cada paso
// ✅ SE PUEDE MODIFICAR:
//    - Las explicaciones detalladas de cada paso
//    - El formato de la ayuda
//    - Los botones mostrados después de la ayuda
// ❌ NO MODIFICAR:
//    - Debe procesar los botones BTN_HELP_STEP_* correctamente
//    - Debe mantener el contexto del paso actual
//    - Debe permitir volver a los pasos principales
// ========================================================

/**
 * Genera una explicación detallada para un paso específico
 * 
 * Esta función genera una explicación paso a paso para ayudar al usuario
 * a completar un paso de diagnóstico específico
 * 
 * ⚠️ CRÍTICO: Esta función determina qué ayuda ve el usuario
 * ✅ SE PUEDE MODIFICAR:
 *    - Agregar más explicaciones específicas según problema/dispositivo
 *    - Mejorar las explicaciones existentes
 *    - Integrar con IA para generar explicaciones dinámicas
 * ❌ NO MODIFICAR:
 *    - Debe retornar un string con la explicación
 *    - Debe soportar ambos idiomas
 *    - Debe ser clara y empática
 * 
 * Si agregas explicaciones específicas:
 * - Puedes crear un objeto con explicaciones predefinidas por paso/problema
 * - Puedes integrar con OpenAI para generar explicaciones dinámicas
 * - Mantén el formato: título, subpasos numerados, mensaje de cierre
 * 
 * @param {string} stepText - Texto del paso a explicar
 * @param {number} stepIndex - Índice del paso (0-based, 0-14)
 * @param {string} device - Tipo de dispositivo ('pc', 'notebook', etc.)
 * @param {string} problem - Descripción del problema
 * @param {string} locale - Idioma del usuario ('es-AR' o 'en-US')
 * @returns {Promise<string>} Explicación detallada del paso
 */
async function explainStepWithAI(stepText = '', stepIndex = 1, device = '', problem = '', locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const stepNumber = stepIndex + 1; // Convertir a 1-based para mostrar al usuario
  
  // Normalizar el texto del paso para buscar explicaciones específicas
  const stepLower = stepText.toLowerCase();
  const problemLower = (problem || '').toLowerCase();
  
  // ========================================
  // EXPLICACIONES ESPECÍFICAS POR PASO
  // ========================================
  // Estas explicaciones son para pasos comunes del problema "el equipo no enciende"
  // En el futuro, puedes expandir esto con más explicaciones o usar IA
  //
  // ✅ SE PUEDE MODIFICAR: Agregar más explicaciones específicas
  // ❌ NO MODIFICAR: El formato de retorno debe ser consistente
  //
  
  // Paso 1: Asegurarse de que el equipo esté conectado a la corriente
  if (stepLower.includes('conectado') && stepLower.includes('corriente') || 
      stepLower.includes('connected') && stepLower.includes('power')) {
    return isEn
      ? `**Help for Step ${stepNumber}:** ⏱️ 2-5 minutes\n\n**Of course!** Let's make sure your device is properly connected to power. Follow these steps:\n\n1. **Check the power cable:** Make sure the cable that goes from the wall to the computer is properly plugged in at both ends.\n\n2. **Verify the outlet:** Try plugging another device (like a lamp or charger) into the same outlet to make sure it's working.\n\n3. **Check the power supply switch:** If your computer has a switch on the back (near the power cable), make sure it's in the "on" position.\n\n4. **Look for lights:** Check if there are any lights on the computer or power supply. If there are lights, that's a good sign.\n\nIf everything is properly connected and it still doesn't turn on, let me know and we'll continue with the next step. Don't worry, we're in this together!`
      : `**🛠️ Ayuda — Paso ${stepNumber}**\n\n**¡Claro!** Vamos a asegurarnos de que tu equipo esté bien conectado a la corriente. Seguí estos pasos:\n\n1. **Revisá el cable de alimentación:** Asegurate de que el cable que va desde la pared hasta la computadora esté bien enchufado en ambos extremos.\n\n2. **Verificá la toma de corriente:** Probá enchufar otro dispositivo (como una lámpara o un cargador) en la misma toma para asegurarte de que esté funcionando.\n\n3. **Controlá el interruptor de la fuente:** Si tu computadora tiene un interruptor en la parte trasera (cerca del cable de alimentación), asegurate de que esté en la posición de "on" (encendido).\n\n4. **Mirar las luces:** Fijate si hay alguna luz encendida en la computadora o en la fuente de alimentación. Si hay luces, eso es una buena señal.\n\nSi todo está bien conectado y no enciende, avísame y seguimos con el siguiente paso. ¡No te preocupes, estamos juntos en esto!`;
  }
  
  // Paso 2: Verificar que el enchufe funcione
  if (stepLower.includes('enchufe') && stepLower.includes('funcione') || 
      stepLower.includes('outlet') && stepLower.includes('work')) {
    return isEn
      ? `**Help for Step ${stepNumber}:** ⏱️ 2-5 minutes\n\n**Perfect!** Let's verify that the outlet is working properly. Here's how:\n\n1. **Unplug your computer** from the current outlet.\n\n2. **Plug in another device** that you know works (like a phone charger, lamp, or another electronic device).\n\n3. **Check if the other device works** in that outlet. If it does, the outlet is fine and the problem might be with your computer's power supply.\n\n4. **If the other device doesn't work either**, try a different outlet in another room.\n\n5. **If it works in another outlet**, the original outlet might have a problem. In that case, you may need to call an electrician.\n\nLet me know what you find and we'll continue!`
      : `**🛠️ Ayuda — Paso ${stepNumber}**\n\n**¡Perfecto!** Vamos a verificar que el enchufe funcione correctamente. Acá te explico:\n\n1. **Desenchufá tu computadora** del enchufe actual.\n\n2. **Enchufá otro dispositivo** que sepas que funciona (como un cargador de celular, una lámpara u otro dispositivo electrónico).\n\n3. **Verificá si el otro dispositivo funciona** en ese enchufe. Si funciona, el enchufe está bien y el problema podría ser con la fuente de alimentación de tu computadora.\n\n4. **Si el otro dispositivo tampoco funciona**, probá otro enchufe en otra habitación.\n\n5. **Si funciona en otro enchufe**, el enchufe original podría tener un problema. En ese caso, podrías necesitar llamar a un electricista.\n\nContame qué encontraste y seguimos!`;
  }
  
  // Paso 3: Comprobar el interruptor de la fuente
  if (stepLower.includes('interruptor') && stepLower.includes('fuente') || 
      stepLower.includes('switch') && stepLower.includes('power supply')) {
    return isEn
      ? `**Help for Step ${stepNumber}:** ⏱️ 2-5 minutes\n\n**Great!** Let's check the power supply switch. This is important:\n\n1. **Locate the power supply switch** - It's usually on the back of the computer, near where the power cable connects.\n\n2. **Check the position** - The switch should be in the "I" (on) position, not "O" (off).\n\n3. **If it's off, turn it on** - Gently flip the switch to the "on" position.\n\n4. **Try turning on the computer** - Press the power button and see if it starts.\n\n5. **If it still doesn't work**, the switch might be broken, or there could be another issue. Let me know and we'll continue troubleshooting!`
      : `**🛠️ Ayuda — Paso ${stepNumber}**\n\n**¡Genial!** Vamos a comprobar el interruptor de la fuente de alimentación. Esto es importante:\n\n1. **Ubicá el interruptor de la fuente** - Generalmente está en la parte trasera de la computadora, cerca de donde se conecta el cable de alimentación.\n\n2. **Verificá la posición** - El interruptor debería estar en la posición "I" (encendido), no "O" (apagado).\n\n3. **Si está apagado, encendelo** - Cambiá suavemente el interruptor a la posición "encendido".\n\n4. **Probá encender la computadora** - Presioná el botón de encendido y fijate si arranca.\n\n5. **Si todavía no funciona**, el interruptor podría estar roto, o podría haber otro problema. Avísame y seguimos diagnosticando!`;
  }
  
  // Explicación genérica para otros pasos
  // Esta se usa cuando no hay una explicación específica para el paso
  return isEn
    ? `**Help for Step ${stepNumber}:** ⏱️ ${estimateStepTime(stepText, stepIndex, locale)}\n\n**Of course!** Let me explain this step in detail:\n\n${stepText}\n\nTry to follow it calmly. If something is not clear, tell me which part you didn't understand and I'll explain it in another way.\n\nIf you get stuck, don't worry - we're here to help! Let me know how it goes.`
    : `**🛠️ Ayuda — Paso ${stepNumber}**\n\n**¡Claro!** Dejame explicarte este paso con más detalle:\n\n${stepText}\n\nTratá de seguirlo con calma. Si hay algo que no se entiende, decime qué parte no te quedó clara y te la explico de otra forma.\n\nSi te trabás en alguna parte, no te preocupes - estamos acá para ayudarte! Contame cómo te fue.`;
}

// ========================================================
// 🎯 HANDLER: handleBasicTestsStage
// ========================================================
// 
// Esta función procesa las interacciones del usuario en la etapa BASIC_TESTS
// Maneja varios casos:
// 1. Usuario hace clic en "🆘 Ayuda Paso X" → mostrar ayuda detallada
// 2. Usuario hace clic en "Lo pude solucionar" → celebrar y terminar
// 3. Usuario hace clic en "El problema persiste" → ofrecer conectar con técnico
// 4. Usuario hace clic en "Volver a los pasos" → mostrar pasos nuevamente
// 5. Usuario hace clic en "Hablar con un Técnico" → conectar con técnico
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 5
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - Las acciones cuando el usuario resuelve el problema
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons?, handled })
//    - Debe procesar los botones BTN_HELP_STEP_* correctamente
//    - Debe mantener el contexto del paso actual
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas las acciones:
// - Asegúrate de actualizar el stage correctamente
// - Mantén los botones apropiados para cada situación
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa BASIC_TESTS
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleBasicTestsStage(session, userText, buttonToken, sessionId) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[BASIC_TESTS] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[BASIC_TESTS] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  // userText es opcional en este handler (puede ser null si solo se hace clic en botón)
  // buttonToken también es opcional
  
  try {
    // Obtener locale del usuario para mensajes en el idioma correcto
    const locale = session.userLocale || 'es-AR';
    const isEnglish = String(locale).toLowerCase().startsWith('en');
    const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
    
    logger.info(`[BASIC_TESTS] Procesando: "${userText || 'button'}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: USUARIO HACE CLIC EN "VOLVER A LOS PASOS"
    // ========================================
    // Si el usuario quiere ver los pasos nuevamente, regenerarlos
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de confirmación
    // ❌ NO MODIFICAR: Debe regenerar los pasos usando handleAskDeviceStage
    //
    if (buttonToken === 'BTN_BACK_TO_STEPS' || buttonToken === 'BTN_BACK') {
      // Regenerar los pasos llamando a handleAskDeviceStage con el dispositivo ya guardado
      // Pero primero necesitamos verificar que haya dispositivo y problema guardados
      if (session.device && session.problem) {
        // Simular la selección del dispositivo para regenerar los pasos
        const deviceCfg = getDeviceFromButton(
          session.device === 'pc' && session.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
          session.device === 'pc' && session.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
          session.device === 'notebook' ? 'BTN_DEV_NOTEBOOK' : 'BTN_DEV_PC_DESKTOP'
        );
        
        if (deviceCfg) {
          // Llamar a handleAskDeviceStage para regenerar los pasos
          return await handleAskDeviceStage(session, '', deviceCfg.device === 'pc' && deviceCfg.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
            deviceCfg.device === 'pc' && deviceCfg.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
            'BTN_DEV_NOTEBOOK', sessionId);
        }
      }
      
      // Si no hay dispositivo o problema, mostrar mensaje de error
      const errorReply = isEnglish
        ? "I couldn't regenerate the steps. Please start over by describing your problem."
        : "No pude regenerar los pasos. Por favor, empezá de nuevo describiendo tu problema.";
      
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return {
        ok: false,
        reply: errorReply,
        stage: session.stage,
        handled: true
      };
    }
    
    // ========================================
    // CASO 2: USUARIO HACE CLIC EN "AYUDA PASO X"
    // ========================================
    // Si el usuario hace clic en un botón de ayuda para un paso específico
    // Generar una explicación detallada de ese paso
    //
    // ⚠️ CRÍTICO: Este es el flujo principal de ayuda por paso
    // ✅ SE PUEDE MODIFICAR:
    //    - El formato de la ayuda
    //    - Los botones mostrados después de la ayuda
    // ❌ NO MODIFICAR:
    //    - Debe extraer el índice del paso del token BTN_HELP_STEP_X
    //    - Debe generar la explicación usando explainStepWithAI
    //    - Debe mostrar botones para continuar
    //
    if (buttonToken && buttonToken.startsWith('BTN_HELP_STEP_')) {
      // Extraer el índice del paso del token (ej: "BTN_HELP_STEP_0" → 0)
      const stepIdx = parseInt(buttonToken.replace('BTN_HELP_STEP_', ''), 10);
      
      // Validar que el índice sea válido
      if (isNaN(stepIdx) || stepIdx < 0) {
        const errorReply = isEnglish
          ? "Invalid step number. Please select a valid step."
          : "Número de paso inválido. Por favor, seleccioná un paso válido.";
        
        session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
        await saveSessionAndTranscript(sessionId, session);
        
        return {
          ok: false,
          reply: errorReply,
          stage: session.stage,
          handled: true
        };
      }
      
      // Obtener los pasos desde la sesión
      const steps = Array.isArray(session.tests?.basic) ? session.tests.basic : 
                    Array.isArray(session.basicTests) ? session.basicTests : [];
      
      // Validar que el índice esté dentro del rango
      if (stepIdx >= steps.length) {
        const errorReply = isEnglish
          ? `Invalid step number. Please select a step between 1 and ${steps.length}.`
          : `Paso inválido. Elegí un paso entre 1 y ${steps.length}.`;
        
        session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
        await saveSessionAndTranscript(sessionId, session);
        
        return {
          ok: false,
          reply: errorReply,
          stage: session.stage,
          handled: true
        };
      }
      
      // Obtener el texto del paso
      const stepText = steps[stepIdx];
      const stepNumber = stepIdx + 1; // Convertir a 1-based para mostrar
      
      // Generar explicación detallada del paso
      let explanation = '';
      try {
        explanation = await explainStepWithAI(
          stepText,
          stepIdx,
          session.device || '',
          session.problem || '',
          locale
        );
      } catch (err) {
        logger.error('[BASIC_TESTS] Error generando ayuda:', err);
        explanation = isEnglish
          ? `**Help for Step ${stepNumber}:**\n\nI couldn't generate a detailed explanation, but try to follow the step as best as you can. If you get stuck, let me know which part you didn't understand.`
          : `**🛠️ Ayuda — Paso ${stepNumber}**\n\nNo pude generar una explicación detallada, pero tratá de seguir el paso lo mejor que puedas. Si te trabás, decime qué parte no entendiste.`;
      }
      
      // Formatear el mensaje final con la pregunta de seguimiento
      const followUp = isEnglish
        ? "\n\nAfter trying this, how did it go?"
        : "\n\nDespués de probar esto, ¿cómo te fue?";
      
      const reply = `${explanation}${followUp}`;
      
      // Generar botones para continuar
      const buttons = [];
      
      // Botón "Lo pude solucionar"
      buttons.push({
        text: isEnglish ? '✔️ I Solved It' : '✔️ Lo pude Solucionar',
        value: 'BTN_SOLVED',
        description: isEnglish ? 'The problem is gone' : 'El problema desapareció'
      });
      
      // Botón "Volver a los pasos"
      buttons.push({
        text: isEnglish ? '⏪ Back to Steps' : '⏪ Volver a los pasos',
        value: 'BTN_BACK_TO_STEPS',
        description: isEnglish ? 'Go back to see all steps' : 'Volver a ver todos los pasos'
      });
      
      // Botón "Conectar con Técnico"
      buttons.push({
        text: isEnglish ? '👨‍🏭 Connect with Technician' : '👨‍🏭 Conectar con Técnico',
        value: 'BTN_WHATSAPP_TECNICO',
        description: isEnglish ? 'Connect with a human technician' : 'Conectar con un técnico humano'
      });
      
      // Guardar el paso de ayuda actual en la sesión para referencia
      session.lastHelpStep = stepNumber;
      session.stepProgress = session.stepProgress || {};
      session.stepProgress[`basic_${stepNumber}`] = 'in_progress';
      
      // Agregar mensajes al transcript
      session.transcript.push({
        who: 'user',
        text: buttonToken, // Guardar el token del botón para referencia
        ts: nowIso()
      });
      session.transcript.push({
        who: 'bot',
        text: reply,
        ts: nowIso(),
        helpStep: stepNumber // Metadata: paso de ayuda mostrado
      });
      
      // Guardar la sesión actualizada
      await saveSessionAndTranscript(sessionId, session);
      
      // Retornar respuesta exitosa con ayuda y botones
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Sigue siendo BASIC_TESTS
        buttons: buttons, // ⚠️ CRÍTICO: Incluir los botones de continuación
        handled: true
      };
    }
    
    // ========================================
    // CASO 3: USUARIO HACE CLIC EN "LO PUDE SOLUCIONAR"
    // ========================================
    // Si el usuario indica que resolvió el problema, celebrar y terminar
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de celebración
    // ❌ NO MODIFICAR: Debe cambiar a ENDED y desactivar waEligible
    //
    if (buttonToken === 'BTN_SOLVED' || /^\s*(s|si|sí|lo pude|lo pude solucionar|resuelto|solucionado)\b/i.test(userText || '')) {
      const whoLabel = session.userName ? session.userName.split(' ').map(n => 
        n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
      ).join(' ') : null;
      
      const firstLine = whoLabel
        ? (isEnglish ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
        : (isEnglish ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);
      
      const reply = isEnglish
        ? `${firstLine}\n\nI'm glad you solved it. Your equipment should work perfectly now. 💻✨\n\nIf another problem appears later, or you want help installing/configuring something, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
        : `${firstLine}\n\nMe alegra un montón que lo hayas solucionado. Tu equipo debería andar joya ahora. 💻✨\n\nSi más adelante aparece otro problema, o querés ayuda para instalar/configurar algo, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;
      
      // Cambiar a estado ENDED
      changeStage(session, STATES.ENDED);
      session.waEligible = false;
      
      // Agregar mensajes al transcript
      session.transcript.push({
        who: 'user',
        text: buttonToken || userText,
        ts: nowIso()
      });
      session.transcript.push({
        who: 'bot',
        text: reply,
        ts: nowIso()
      });
      
      // Guardar la sesión actualizada
      await saveSessionAndTranscript(sessionId, session);
      
      // Retornar respuesta exitosa
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Ahora es ENDED
        buttons: [], // Sin botones, la conversación terminó
        handled: true
      };
    }
    
    // ========================================
    // CASO 4: USUARIO HACE CLIC EN "EL PROBLEMA PERSISTE"
    // ========================================
    // Si el usuario indica que el problema persiste, ofrecer conectar con técnico
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de escalación
    // ❌ NO MODIFICAR: Debe cambiar a ESCALATE
    //
    if (buttonToken === 'BTN_PERSIST' || /^\s*(no|n|el problema persiste|persiste|todavía no|aún no)\b/i.test(userText || '')) {
      const reply = isEnglish
        ? `💡 I understand. Don't worry, we're here to help. Let me connect you with a technician who can help you further.`
        : `💡 Entiendo. No te preocupes, estamos acá para ayudarte. Dejame conectarte con un técnico que te pueda ayudar mejor.`;
      
      // Cambiar a estado ESCALATE
      changeStage(session, STATES.ESCALATE);
      
      // Generar botones para conectar con técnico
      // ⚠️ CRÍTICO: Solo mostrar BTN_WHATSAPP_TECNICO y BTN_BACK según lo solicitado
      const buttons = [
        {
          text: isEnglish ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
          value: 'BTN_WHATSAPP_TECNICO',
          description: isEnglish ? 'Continue on WhatsApp with a technician' : 'Continuar por WhatsApp con un técnico'
        },
        {
          text: isEnglish ? '⏪ Go Back' : '⏪ Volver atrás',
          value: 'BTN_BACK',
          description: isEnglish ? 'Go back to previous steps' : 'Volver a los pasos anteriores'
        }
      ];
      
      // Agregar mensajes al transcript
      session.transcript.push({
        who: 'user',
        text: buttonToken || userText,
        ts: nowIso()
      });
      session.transcript.push({
        who: 'bot',
        text: reply,
        ts: nowIso()
      });
      
      // Guardar la sesión actualizada
      await saveSessionAndTranscript(sessionId, session);
      
      // Retornar respuesta exitosa
      return {
        ok: true,
        reply: reply,
        stage: session.stage, // Ahora es ESCALATE
        buttons: buttons,
        handled: true
      };
    }
    
    // ========================================
    // CASO 5: FALLBACK - NO SE RECONOCIÓ LA ACCIÓN
    // ========================================
    // Si el usuario escribió algo que no se reconoce, pedir que use los botones
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de ayuda
    // ❌ NO MODIFICAR: Debe mostrar los pasos nuevamente
    //
    const fallbackReply = isEnglish
      ? "I didn't understand. Please choose an option from the buttons above, or select a step to get help with."
      : "No te entendí. Por favor elegí una opción de los botones de arriba, o seleccioná un paso para obtener ayuda.";
    
    // Regenerar los pasos para mostrar las opciones nuevamente
    // (Esto se puede optimizar en el futuro para no regenerar todo)
    if (session.device && session.problem) {
      const deviceCfg = getDeviceFromButton(
        session.device === 'pc' && session.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
        session.device === 'pc' && session.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
        session.device === 'notebook' ? 'BTN_DEV_NOTEBOOK' : 'BTN_DEV_PC_DESKTOP'
      );
      
      if (deviceCfg) {
        return await handleAskDeviceStage(session, '', 
          deviceCfg.device === 'pc' && deviceCfg.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
          deviceCfg.device === 'pc' && deviceCfg.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
          'BTN_DEV_NOTEBOOK', sessionId);
      }
    }
    
    // Si no se puede regenerar, mostrar mensaje de error
    session.transcript.push({
      who: 'user',
      text: userText || '',
      ts: nowIso()
    });
    session.transcript.push({
      who: 'bot',
      text: fallbackReply,
      ts: nowIso()
    });
    
    await saveSessionAndTranscript(sessionId, session);
    
    return {
      ok: true,
      reply: fallbackReply,
      stage: session.stage,
      handled: true
    };
    
  } catch (error) {
    // Manejo de errores robusto
    logger.error('[BASIC_TESTS] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.BASIC_TESTS,
      handled: true,
      error: error.message
    };
  }
}

// ========================================================
// 🎯 FUNCIONES AUXILIARES PARA TICKETS Y WHATSAPP
// ========================================================
// 
// Estas funciones se usan para generar tickets de soporte y enlaces de WhatsApp
// Incluyen enmascaramiento de información sensible (PII) y construcción de URLs
//
// ⚠️ CRÍTICO: Estas funciones manejan información sensible del usuario
// ✅ SE PUEDE MODIFICAR:
//    - Los patrones de enmascaramiento
//    - El formato de los tickets
//    - El formato de los mensajes de WhatsApp
// ❌ NO MODIFICAR:
//    - Debe enmascarar información sensible (emails, teléfonos, DNI, etc.)
//    - Debe generar URLs de WhatsApp válidas
//    - Debe crear tickets con información estructurada
// ========================================================

/**
 * Enmascara información personal identificable (PII) en texto
 * 
 * Esta función protege la privacidad del usuario eliminando o reemplazando
 * información sensible como emails, teléfonos, DNI, tarjetas de crédito, etc.
 * 
 * ⚠️ CRÍTICO: Esta función es esencial para cumplir con GDPR y proteger privacidad
 * ✅ SE PUEDE MODIFICAR:
 *    - Agregar más patrones de enmascaramiento
 *    - Cambiar los textos de reemplazo
 * ❌ NO MODIFICAR:
 *    - Debe enmascarar emails, teléfonos, DNI, tarjetas, etc.
 *    - Debe retornar un string (nunca null/undefined)
 * 
 * Si agregas más patrones:
 * - Prueba con datos reales (pero no los guardes en el código)
 * - Asegúrate de que no rompa el texto legible
 * - Mantén el orden: primero patrones más específicos, luego genéricos
 * 
 * @param {string} text - Texto que puede contener información sensible
 * @returns {string} Texto con información sensible enmascarada
 */
function maskPII(text) {
  if (!text) return text || '';
  let s = String(text);
  
  // Emails: reemplazar con [EMAIL_REDACTED]
  // Patrón: texto@dominio.extension
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, '[EMAIL_REDACTED]');
  
  // Tarjetas de crédito: reemplazar con [CARD_REDACTED]
  // Patrón: 16 dígitos con o sin guiones/espacios
  s = s.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[CARD_REDACTED]');
  
  // CBU/CVU: reemplazar con [CBU_REDACTED]
  // Patrón: 22 dígitos consecutivos
  s = s.replace(/\b\d{22}\b/g, '[CBU_REDACTED]');
  
  // CUIT/CUIL: reemplazar con [CUIT_REDACTED]
  // Patrón: XX-XXXXXXXX-X (con o sin guiones/espacios)
  s = s.replace(/\b\d{2}[-\s]?\d{8}[-\s]?\d{1}\b/g, '[CUIT_REDACTED]');
  
  // DNI: reemplazar con [DNI_REDACTED]
  // Patrón: 7-8 dígitos aislados (antes de teléfonos para evitar conflictos)
  s = s.replace(/\b\d{7,8}\b/g, '[DNI_REDACTED]');
  
  // Teléfonos internacionales: reemplazar con [PHONE_REDACTED]
  // Patrón: números con prefijos internacionales, guiones, espacios, paréntesis
  s = s.replace(/\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}/g, '[PHONE_REDACTED]');
  
  // IPs: reemplazar con [IP_REDACTED]
  // Patrón: IPv4 (xxx.xxx.xxx.xxx)
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]');
  
  // Contraseñas comunes: reemplazar con [PASSWORD_REDACTED]
  // Patrón: palabras comunes usadas como contraseñas
  const passwordPatterns = /\b(password|contraseña|pass|pwd|clave|secret|token)\s*[:=]\s*\S+/gi;
  s = s.replace(passwordPatterns, '[PASSWORD_REDACTED]');
  
  return s;
}

/**
 * Construye una URL de WhatsApp con un número y mensaje
 * 
 * Esta función genera un enlace de WhatsApp que abre la app/web con
 * un número de teléfono y un mensaje pre-llenado
 * 
 * ⚠️ CRÍTICO: Esta función genera los enlaces que el usuario hace clic
 * ✅ SE PUEDE MODIFICAR:
 *    - El formato de la URL (pero debe ser compatible con WhatsApp)
 *    - Agregar más parámetros (ej: app_absent, etc.)
 * ❌ NO MODIFICAR:
 *    - Debe usar el formato https://wa.me/ para compatibilidad universal
 *    - Debe codificar el texto con encodeURIComponent
 *    - Debe limpiar el número de teléfono (solo dígitos)
 * 
 * Si cambias el formato:
 * - Verifica que funcione en WhatsApp Web, WhatsApp Desktop y WhatsApp Mobile
 * - Prueba con números internacionales (con y sin +)
 * 
 * @param {string} phoneNumber - Número de teléfono (puede tener +, espacios, guiones)
 * @param {string} text - Mensaje a enviar
 * @returns {string} URL de WhatsApp lista para usar
 */
function buildWhatsAppUrl(phoneNumber, text) {
  // Limpiar el número: solo dejar dígitos
  // Ejemplo: "+54 9 341 742-2422" → "5493417422422"
  const cleanNumber = String(phoneNumber || '').replace(/\D+/g, '');
  
  // Codificar el texto para URL (reemplaza espacios, caracteres especiales, etc.)
  // Ejemplo: "Hola mundo" → "Hola%20mundo"
  const encodedText = encodeURIComponent(text || '');
  
  // Construir URL de WhatsApp
  // Formato: https://wa.me/NUMERO?text=MENSAJE
  // Este formato funciona en WhatsApp Web, Desktop y Mobile
  return `https://wa.me/${cleanNumber}?text=${encodedText}`;
}

/**
 * Constantes para configuración de tickets y WhatsApp
 * 
 * Estas constantes definen valores por defecto para:
 * - Número de WhatsApp de soporte
 * - URL base pública para tickets
 * - Locks para prevenir creación simultánea de tickets
 * 
 * ✅ SE PUEDE MODIFICAR:
 *    - Los valores por defecto
 *    - Agregar más constantes
 * ❌ NO MODIFICAR:
 *    - Debe usar variables de entorno cuando estén disponibles
 *    - Debe tener valores por defecto razonables
 */
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422'; // STI Support
const WHATSAPP_SUPPORT_NUMBER = process.env.WHATSAPP_SUPPORT_NUMBER || WHATSAPP_NUMBER;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://stia.com.ar').replace(/\/$/, '');

/**
 * Map para prevenir creación simultánea de tickets (race condition)
 * 
 * Este Map almacena timestamps de cuando se está creando un ticket
 * para evitar que se creen múltiples tickets al mismo tiempo para la misma sesión
 * 
 * ⚠️ CRÍTICO: Previene duplicación de tickets y problemas de concurrencia
 * ✅ SE PUEDE MODIFICAR:
 *    - El tiempo de espera (actualmente 5 segundos)
 *    - La lógica de limpieza
 * ❌ NO MODIFICAR:
 *    - Debe ser un Map (no un objeto) para mejor rendimiento
 *    - Debe limpiarse periódicamente para evitar memory leaks
 * 
 * Estructura: Map<sessionId, timestamp>
 * Ejemplo: { "abc123": 1704067200000 }
 */
const ticketCreationLocks = new Map();

// Limpiar locks antiguos cada 5 minutos para evitar memory leaks
// Los locks más antiguos de 10 minutos se eliminan automáticamente
setInterval(() => {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  for (const [sid, lockTime] of ticketCreationLocks.entries()) {
    if (lockTime < tenMinutesAgo) {
      ticketCreationLocks.delete(sid);
    }
  }
}, 5 * 60 * 1000); // Ejecutar cada 5 minutos

// ========================================================
// 🎯 ETAPA 6: ESCALAR A TÉCNICO HUMANO (ESCALATE)
// ========================================================
// 
// Esta sección implementa la sexta etapa del flujo conversacional:
// 1. El usuario indica que el problema persiste o quiere hablar con un técnico
// 2. El sistema genera un ticket con el resumen de la conversación
// 3. Se muestra un mensaje explicando que se generó el ticket
// 4. Se muestra el botón "Hablar con un Técnico" para continuar por WhatsApp
// 5. El usuario puede hacer clic para abrir WhatsApp con el mensaje pre-llenado
//
// ⚠️ IMPORTANTE: Esta etapa es el punto de escalación a soporte humano
// ✅ SE PUEDE MODIFICAR:
//    - El formato del ticket
//    - El mensaje de WhatsApp
//    - Los botones mostrados
// ❌ NO MODIFICAR:
//    - Debe generar un ticket con ID único
//    - Debe incluir el historial de conversación
//    - Debe mostrar el botón de WhatsApp
//    - Debe enmascarar información sensible
// ========================================================

/**
 * Genera un ticket de soporte y prepara la respuesta con enlace de WhatsApp
 * 
 * Esta función:
 * 1. Genera un ID único para el ticket (formato: TCK-YYYYMMDD-XXXXXX)
 * 2. Crea un archivo de ticket con toda la información de la sesión
 * 3. Prepara un mensaje de WhatsApp con el resumen
 * 4. Retorna la respuesta con el botón de WhatsApp
 * 
 * ⚠️ CRÍTICO: Esta función es el punto de conexión con soporte humano
 * ✅ SE PUEDE MODIFICAR:
 *    - El formato del ticket (pero mantener la información esencial)
 *    - El formato del mensaje de WhatsApp
 *    - Los campos incluidos en el ticket
 * ❌ NO MODIFICAR:
 *    - Debe generar un ID único de ticket
 *    - Debe guardar el ticket en TICKETS_DIR
 *    - Debe incluir el historial de conversación
 *    - Debe enmascarar información sensible
 *    - Debe retornar el botón BTN_WHATSAPP_TECNICO
 * 
 * Si modificas el formato del ticket:
 * - Asegúrate de que sea legible para los técnicos
 * - Mantén la estructura: título, información del cliente, problema, pasos, historial
 * - No elimines campos críticos sin actualizar el sistema de tickets
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} sessionId - ID de la sesión
 * @param {object} res - Objeto de respuesta de Express
 * @returns {Promise<object>} Respuesta JSON con ticket y botón de WhatsApp
 */
async function createTicketAndRespond(session, sessionId, res) {
  // ========================================
  // PREVENIR RACE CONDITION
  // ========================================
  // Si ya se está creando un ticket para esta sesión, esperar
  // Esto previene que se creen múltiples tickets si el usuario hace clic varias veces
  //
  // ✅ SE PUEDE MODIFICAR: El tiempo de espera (actualmente 5 segundos)
  // ❌ NO MODIFICAR: Debe prevenir creación simultánea
  //
  if (ticketCreationLocks.has(sessionId)) {
    const waitTime = Date.now() - ticketCreationLocks.get(sessionId);
    if (waitTime < 5000) { // Si hace menos de 5 segundos que se está creando
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      return res.json({
        ok: false,
        reply: isEn 
          ? '⏳ I\'m already generating your ticket. Please wait a few seconds...'
          : '⏳ Ya estoy generando tu ticket. Esperá unos segundos...',
        stage: session.stage,
        buttons: []
      });
    }
  }
  
  // Marcar que se está creando un ticket para esta sesión
  ticketCreationLocks.set(sessionId, Date.now());
  
  const ts = nowIso();
  const locale = session.userLocale || 'es-AR';
  const isEn = String(locale).toLowerCase().startsWith('en');
  const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
  
  try {
    // ========================================
    // GENERAR ID ÚNICO DE TICKET
    // ========================================
    // Formato: TCK-YYYYMMDD-XXXXXX
    // Ejemplo: TCK-20250115-A3F2B1
    // 
    // ✅ SE PUEDE MODIFICAR: El formato del ID (pero mantener único)
    // ❌ NO MODIFICAR: Debe ser único y no repetible
    //
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 caracteres hexadecimales
    const ticketId = `TCK-${ymd}-${rand}`;
    
    // Token de acceso público para el ticket (usado en URLs públicas)
    const accessToken = crypto.randomBytes(16).toString('hex');
    
    // ========================================
    // FORMATEAR FECHA Y HORA
    // ========================================
    // Generar etiqueta legible con fecha y hora en zona horaria de Argentina
    //
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const datePart = dateFormatter.format(now).replace(/\//g, '-');
    const timePart = timeFormatter.format(now);
    const generatedLabel = `${datePart} ${timePart} (ART)`;
    
    // ========================================
    // PREPARAR INFORMACIÓN DEL CLIENTE
    // ========================================
    // Limpiar y formatear el nombre del usuario para usar en el ticket
    //
    let safeName = '';
    if (session.userName) {
      // Eliminar caracteres especiales y normalizar espacios
      safeName = String(session.userName)
        .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    
    // Título del ticket
    const titleLine = safeName
      ? `STI • Ticket ${ticketId}-${safeName}`
      : `STI • Ticket ${ticketId}`;
    
    // ========================================
    // CONSTRUIR CONTENIDO DEL TICKET
    // ========================================
    // El ticket se guarda como archivo de texto (.txt) para fácil lectura
    // También se guarda como JSON (.json) para integraciones futuras
    //
    const lines = [];
    
    // Encabezado del ticket
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if (session.userName) lines.push(`Cliente: ${session.userName}`);
    if (session.device) lines.push(`Equipo: ${session.device}`);
    if (sessionId) lines.push(`Sesión: ${sessionId}`);
    if (session.userLocale) lines.push(`Idioma: ${session.userLocale}`);
    lines.push('');
    
    // Resumen del problema
    lines.push('=== RESUMEN DEL PROBLEMA ===');
    if (session.problem) {
      lines.push(String(session.problem));
    } else {
      lines.push('(sin descripción explícita de problema)');
    }
    lines.push('');
    
    // Pasos probados
    lines.push('=== PASOS PROBADOS / ESTADO ===');
    try {
      const steps = session.stepsDone || [];
      if (steps.length) {
        for (const st of steps) {
          lines.push(`- Paso ${st.step || '?'}: ${st.label || st.id || ''}`);
        }
      } else {
        // Si no hay pasos en stepsDone, intentar obtener de tests.basic
        const basicSteps = session.tests?.basic || session.basicTests || [];
        if (basicSteps.length > 0) {
          lines.push('Pasos de diagnóstico generados:');
          basicSteps.forEach((step, idx) => {
            lines.push(`- Paso ${idx + 1}: ${step}`);
          });
        } else {
          lines.push('(aún sin pasos registrados)');
        }
      }
    } catch (e) {
      lines.push('(no se pudieron enumerar los pasos)');
    }
    lines.push('');
    
    // Historial de conversación (con PII enmascarado)
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    const transcriptData = [];
    for (const m of session.transcript || []) {
      const rawText = (m.text || '').toString();
      const safeText = maskPII(rawText); // ⚠️ CRÍTICO: Enmascarar información sensible
      const line = `[${m.ts || ts}] ${m.who || 'user'}: ${safeText}`;
      lines.push(line);
      transcriptData.push({
        ts: m.ts || ts,
        who: m.who || 'user',
        text: safeText
      });
    }
    
    // ========================================
    // GUARDAR TICKET EN ARCHIVO
    // ========================================
    // Crear directorio de tickets si no existe
    // Guardar ticket en formato .txt (legible) y .json (estructurado)
    //
    try {
      await fs.promises.mkdir(TICKETS_DIR, { recursive: true });
    } catch (e) {
      // Si falla, continuar de todas formas (el error se mostrará al escribir)
    }
    
    // Guardar ticket como archivo de texto (.txt)
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    await fs.promises.writeFile(ticketPathTxt, lines.join('\n'), 'utf8');
    
    // Guardar ticket como JSON estructurado (.json)
    const ticketJson = {
      id: ticketId,
      createdAt: ts,
      label: generatedLabel,
      name: session.userName || null,
      device: session.device || null,
      problem: session.problem || null,
      locale: session.userLocale || null,
      sid: sessionId || null,
      accessToken: accessToken,
      stepsDone: session.stepsDone || [],
      transcript: transcriptData,
      redactPublic: true
    };
    const ticketPathJson = path.join(TICKETS_DIR, `${ticketId}.json`);
    await fs.promises.writeFile(ticketPathJson, JSON.stringify(ticketJson, null, 2), 'utf8');
    
    // URLs públicas del ticket (para acceso desde fuera)
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
    
    // ========================================
    // PREPARAR MENSAJE DE WHATSAPP
    // ========================================
    // El mensaje de WhatsApp incluye:
    // - Título del ticket
    // - Introducción personalizada
    // - Información del cliente y dispositivo
    // - ID del ticket y URL de la API
    // - Aviso de privacidad
    //
    const whoName = (ticketJson.name || '').toString().trim();
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.`
      : 'Hola STI. Vengo del chat web. Dejo mi consulta:';
    
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (ticketJson.name) waText += `Cliente: ${ticketJson.name}\n`;
    if (ticketJson.device) waText += `Equipo: ${ticketJson.device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
    waText += `\n\nAviso: al enviar esto, parte de esta conversación se comparte con un técnico de STI vía WhatsApp. No incluyas contraseñas ni datos bancarios.`;
    
    // Generar URLs de WhatsApp (diferentes formatos para compatibilidad)
    const waNumberRaw = String(WHATSAPP_NUMBER);
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g, '');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    
    // Marcar que la sesión es elegible para WhatsApp
    session.waEligible = true;
    
    // ========================================
    // GENERAR MENSAJE DE RESPUESTA
    // ========================================
    // El mensaje explica que se generó el ticket y cómo continuar por WhatsApp
    //
    const replyLines = [];
    
    if (isEn) {
      replyLines.push('Perfect, I will generate a summary ticket with what we tried so far.');
      replyLines.push('You can send it by WhatsApp to a human technician so they can continue helping you.');
      replyLines.push('When you are ready, tap the green WhatsApp button and send the message without changing its text.');
    } else if (isEsLatam) {
      replyLines.push('Listo, voy a generar un ticket con el resumen de esta conversación y los pasos que ya probamos.');
      replyLines.push('Presioná el botón **Hablar con un Técnico** para continuar por WhatsApp. El técnico recibirá todo el contexto de nuestra conversación.');
      replyLines.push('Cuando estés listo, tocá el botón verde y enviá el mensaje sin modificar el texto.');
      replyLines.push('Aviso: no compartas contraseñas ni datos bancarios. Yo ya enmascaré información sensible si la hubieras escrito.');
    } else {
      replyLines.push('Listo, voy a generar un ticket con el resumen de esta conversación y los pasos que ya probamos.');
      replyLines.push('Presioná el botón **Hablar con un Técnico** para continuar por WhatsApp. El técnico recibirá todo el contexto de nuestra conversación.');
      replyLines.push('Cuando estés listo, tocá el botón verde y enviá el mensaje sin modificar el texto.');
      replyLines.push('Aviso: no compartas contraseñas ni datos bancarios. Yo ya enmascaré información sensible si la hubieras escrito.');
    }
    
    // ========================================
    // GENERAR BOTONES
    // ========================================
    // Solo mostrar BTN_WHATSAPP_TECNICO (botón verde) y BTN_BACK
    // según lo solicitado por el usuario
    //
    const buttons = [];
    
    // Botón principal: Hablar con un Técnico (botón verde cuadrangular)
    buttons.push({
      text: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
      value: 'BTN_WHATSAPP_TECNICO',
      description: isEn ? 'Continue on WhatsApp with a technician' : 'Continuar por WhatsApp con un técnico'
    });
    
    // Botón secundario: Volver atrás
    buttons.push({
      text: isEn ? '⏪ Go Back' : '⏪ Volver atrás',
      value: 'BTN_BACK',
      description: isEn ? 'Go back to previous steps' : 'Volver a los pasos anteriores'
    });
    
    // Agregar mensaje al transcript
    session.transcript.push({
      who: 'bot',
      text: replyLines.join('\n\n'),
      ts: ts
    });
    
    // Guardar la sesión actualizada
    await saveSessionAndTranscript(sessionId, session);
    
    // Liberar lock de creación de ticket
    ticketCreationLocks.delete(sessionId);
    
    // Retornar respuesta con ticket y botones
    return res.json({
      ok: true,
      reply: replyLines.join('\n\n'),
      stage: session.stage, // Sigue siendo ESCALATE o CREATE_TICKET
      buttons: buttons, // ⚠️ CRÍTICO: Incluir solo BTN_WHATSAPP_TECNICO y BTN_BACK
      whatsappUrl: waUrl,
      waWebUrl: waWebUrl,
      waAppUrl: waAppUrl,
      waIntentUrl: waIntentUrl,
      ticketId: ticketId,
      publicUrl: publicUrl,
      apiPublicUrl: apiPublicUrl,
      allowWhatsapp: true
    });
    
  } catch (err) {
    // Manejo de errores robusto
    logger.error('[createTicketAndRespond] ❌ Error:', {
      error: err?.message,
      stack: err?.stack,
      sessionId: sessionId
    });
    
    // Liberar lock en caso de error
    ticketCreationLocks.delete(sessionId);
    session.waEligible = false;
    
    // Guardar sesión actualizada
    await saveSessionAndTranscript(sessionId, session);
    
    // Mensaje de error según el idioma
    const errorReply = isEn
      ? '❗ An error occurred while generating the ticket. If you want, you can try again in a few minutes or contact STI directly via WhatsApp.'
      : '❗ Ocurrió un error al generar el ticket. Si querés, podés intentar de nuevo en unos minutos o contactar directamente a STI por WhatsApp.';
    
    // Botones de error (solo BTN_WHATSAPP_TECNICO y BTN_BACK)
    const errorButtons = [
      {
        text: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
        value: 'BTN_WHATSAPP_TECNICO',
        description: isEn ? 'Continue on WhatsApp' : 'Continuar por WhatsApp'
      },
      {
        text: isEn ? '⏪ Go Back' : '⏪ Volver atrás',
        value: 'BTN_BACK',
        description: isEn ? 'Go back' : 'Volver atrás'
      }
    ];
    
    return res.json({
      ok: false,
      reply: errorReply,
      stage: session.stage,
      buttons: errorButtons
    });
  }
}

// ========================================================
// 🎯 HANDLER: handleEscalateStage
// ========================================================
// 
// Esta función procesa las interacciones del usuario en la etapa ESCALATE
// Maneja varios casos:
// 1. Usuario hace clic en "Hablar con un Técnico" → generar ticket y mostrar botón de WhatsApp
// 2. Usuario hace clic en "Volver atrás" → volver a los pasos de diagnóstico
// 3. Usuario escribe confirmación → generar ticket inmediatamente
//
// ⚠️ CRÍTICO: Esta función controla el flujo completo de la Etapa 6
// ✅ SE PUEDE MODIFICAR:
//    - Los mensajes de respuesta (pero mantener la lógica)
//    - Las acciones cuando el usuario confirma
// ❌ NO MODIFICAR:
//    - La estructura del objeto retornado ({ ok, reply, stage, buttons?, handled })
//    - Debe procesar BTN_WHATSAPP_TECNICO correctamente
//    - Debe procesar BTN_BACK correctamente
//    - Debe generar el ticket cuando corresponde
//    - Si cambias la lógica, el flujo se romperá
//
// Si modificas las acciones:
// - Asegúrate de actualizar el stage correctamente
// - Mantén los botones apropiados para cada situación
// ========================================================

/**
 * Procesa las interacciones del usuario en la etapa ESCALATE
 * 
 * @param {object} session - Objeto de sesión actual
 * @param {string} userText - Texto que escribió el usuario (o texto mapeado desde botón)
 * @param {string|null} buttonToken - Token del botón si el usuario hizo clic (null si escribió)
 * @param {string} sessionId - ID de la sesión
 * @param {object} res - Objeto de respuesta de Express
 * @returns {Promise<object>} Objeto con { ok, reply, stage, buttons?, handled }
 */
async function handleEscalateStage(session, userText, buttonToken, sessionId, res) {
  // Validar parámetros esenciales con validación de tipos
  if (!session || typeof session !== 'object') {
    logger.error('[ESCALATE] ❌ Session inválida o no es un objeto');
    return {
      ok: false,
      error: 'Session inválida',
      handled: true
    };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
    logger.error('[ESCALATE] ❌ sessionId inválido');
    return {
      ok: false,
      error: 'sessionId inválido',
      handled: true
    };
  }
  
  if (!res || typeof res.json !== 'function') {
    logger.error('[ESCALATE] ❌ res inválido o no es un objeto Response');
    return {
      ok: false,
      error: 'Response inválido',
      handled: true
    };
  }
  
  // userText es opcional en este handler (puede ser null si solo se hace clic en botón)
  // buttonToken también es opcional
  
  try {
    // Obtener locale del usuario para mensajes en el idioma correcto
    const locale = session.userLocale || 'es-AR';
    const isEnglish = String(locale).toLowerCase().startsWith('en');
    const isEsLatam = String(locale).toLowerCase().startsWith('es-') && !locale.includes('ar');
    
    logger.info(`[ESCALATE] Procesando: "${userText || 'button'}" (buttonToken: ${buttonToken || 'none'})`);
    
    // ========================================
    // CASO 1: USUARIO HACE CLIC EN "HABLAR CON UN TÉCNICO"
    // ========================================
    // Si el usuario hace clic en el botón verde "Hablar con un Técnico"
    // Generar ticket y mostrar mensaje con botón de WhatsApp
    //
    // ⚠️ CRÍTICO: Este es el flujo principal de escalación
    // ✅ SE PUEDE MODIFICAR: El mensaje de confirmación
    // ❌ NO MODIFICAR:
    //    - Debe llamar a createTicketAndRespond()
    //    - Debe mostrar el botón BTN_WHATSAPP_TECNICO
    //
    if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
      // Generar ticket y preparar respuesta con botón de WhatsApp
      // Esta función ya maneja todo: creación del ticket, mensaje, botones, etc.
      return await createTicketAndRespond(session, sessionId, res);
    }
    
    // ========================================
    // CASO 2: USUARIO HACE CLIC EN "VOLVER ATRÁS"
    // ========================================
    // Si el usuario quiere volver a los pasos de diagnóstico
    // Regenerar los pasos para que pueda continuar
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de confirmación
    // ❌ NO MODIFICAR: Debe regenerar los pasos usando handleAskDeviceStage
    //
    if (buttonToken === 'BTN_BACK' || buttonToken === 'BTN_BACK_TO_STEPS') {
      // Verificar que haya dispositivo y problema guardados para regenerar pasos
      if (session.device && session.problem) {
        // Simular la selección del dispositivo para regenerar los pasos
        const deviceCfg = getDeviceFromButton(
          session.device === 'pc' && session.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
          session.device === 'pc' && session.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
          session.device === 'notebook' ? 'BTN_DEV_NOTEBOOK' : 'BTN_DEV_PC_DESKTOP'
        );
        
        if (deviceCfg) {
          // Cambiar de vuelta a BASIC_TESTS para mostrar los pasos
          changeStage(session, STATES.BASIC_TESTS);
          
          // Llamar a handleAskDeviceStage para regenerar los pasos
          return await handleAskDeviceStage(session, '', 
            deviceCfg.device === 'pc' && deviceCfg.pcType === 'desktop' ? 'BTN_DEV_PC_DESKTOP' :
            deviceCfg.device === 'pc' && deviceCfg.pcType === 'all_in_one' ? 'BTN_DEV_PC_ALLINONE' :
            'BTN_DEV_NOTEBOOK', sessionId);
        }
      }
      
      // Si no hay dispositivo o problema, mostrar mensaje de error
      const errorReply = isEnglish
        ? "I couldn't go back to the steps. Please start over by describing your problem."
        : "No pude volver a los pasos. Por favor, empezá de nuevo describiendo tu problema.";
      
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return res.json({
        ok: false,
        reply: errorReply,
        stage: session.stage,
        buttons: []
      });
    }
    
    // ========================================
    // CASO 3: USUARIO ESCRIBE CONFIRMACIÓN
    // ========================================
    // Si el usuario escribe texto que indica confirmación (sí, ok, dale, etc.)
    // Generar ticket inmediatamente
    //
    // ✅ SE PUEDE MODIFICAR: Los patrones de detección de confirmación
    // ❌ NO MODIFICAR: Debe llamar a createTicketAndRespond()
    //
    const confirmRx = /^\s*(sí|si|ok|dale|perfecto|bueno|vamos|adelante|claro|por supuesto|yes|okay|sure|alright|hacelo|hazlo|quiero|necesito|dame)\s*(hablar|conectar|técnico|tecnico)?\s*$/i;
    const techRequestRx = /^\s*(conectar|hablar|técnico|tecnico|quiero hablar|necesito hablar|dame un técnico|dame un tecnico)\s*$/i;
    
    if (confirmRx.test(userText || '') || techRequestRx.test(userText || '')) {
      logger.info('[ESCALATE] ✅ Confirmación detectada - ejecutando escalado inmediatamente');
      return await createTicketAndRespond(session, sessionId, res);
    }
    
    // ========================================
    // CASO 4: FALLBACK - OFRECER BOTÓN DIRECTAMENTE
    // ========================================
    // Si el usuario escribió algo que no se reconoce, ofrecer el botón directamente
    // sin más preguntas
    //
    // ✅ SE PUEDE MODIFICAR: El mensaje de ayuda
    // ❌ NO MODIFICAR: Debe mostrar el botón BTN_WHATSAPP_TECNICO
    //
    const escalationVariations = isEnglish
      ? [
          "I'll connect you with a technician. Press the button below to continue on WhatsApp:",
          "Let me connect you with a specialist. Use the WhatsApp button to continue:",
          "I'll get you in touch with a technician. Tap the button below:"
        ]
      : [
          "Te conecto con un técnico. Presioná el botón de abajo para continuar por WhatsApp:",
          "Déjame conectarte con un especialista. Usá el botón de WhatsApp para continuar:",
          "Te voy a poner en contacto con un técnico. Tocá el botón de abajo:"
        ];
    
    const variationIndex = (sessionId ? sessionId.charCodeAt(0) : 0) % escalationVariations.length;
    const reply = escalationVariations[variationIndex];
    
    // Generar botones (solo BTN_WHATSAPP_TECNICO y BTN_BACK según lo solicitado)
    const buttons = [
      {
        text: isEnglish ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
        value: 'BTN_WHATSAPP_TECNICO',
        description: isEnglish ? 'Continue on WhatsApp with a technician' : 'Continuar por WhatsApp con un técnico'
      },
      {
        text: isEnglish ? '⏪ Go Back' : '⏪ Volver atrás',
        value: 'BTN_BACK',
        description: isEnglish ? 'Go back to previous steps' : 'Volver a los pasos anteriores'
      }
    ];
    
    // Agregar mensajes al transcript
    session.transcript.push({
      who: 'user',
      text: userText || '',
      ts: nowIso()
    });
    session.transcript.push({
      who: 'bot',
      text: reply,
      ts: nowIso()
    });
    
    // Guardar la sesión actualizada
    await saveSessionAndTranscript(sessionId, session);
    
    // Retornar respuesta con botones
    return res.json({
      ok: true,
      reply: reply,
      stage: session.stage, // Sigue siendo ESCALATE
      buttons: buttons, // ⚠️ CRÍTICO: Solo BTN_WHATSAPP_TECNICO y BTN_BACK
      handled: true
    });
    
  } catch (error) {
    // Manejo de errores robusto
    logger.error('[ESCALATE] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sessionId,
      stage: session?.stage
    });
    
    // Mensaje de error según el idioma del usuario
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return res.json({
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES.ESCALATE,
      buttons: [
        {
          text: session?.userLocale === 'en-US' ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
          value: 'BTN_WHATSAPP_TECNICO'
        },
        {
          text: session?.userLocale === 'en-US' ? '⏪ Go Back' : '⏪ Volver atrás',
          value: 'BTN_BACK'
        }
      ],
      handled: true,
      error: error.message
    });
  }
}

// ========================================================
// 📎 SISTEMA DE UPLOAD DE IMÁGENES
// ========================================================
// 
// Esta sección implementa la funcionalidad para que los usuarios puedan
// adjuntar imágenes al chat usando el botón de "clip" (📎)
// 
// Características:
// - Validación de tipo de archivo (solo imágenes: JPEG, PNG, GIF, WebP)
// - Validación de tamaño (máximo 5MB)
// - Compresión automática de imágenes para ahorrar espacio
// - Análisis con OpenAI Vision para detectar problemas técnicos
// - Rate limiting para prevenir abuso
// - Limpieza automática de archivos antiguos
//
// ⚠️ CRÍTICO: Este sistema maneja archivos subidos por usuarios
// ✅ SE PUEDE MODIFICAR:
//    - Los tipos de archivo permitidos
//    - El tamaño máximo de archivo
//    - La calidad de compresión
//    - El prompt de análisis de OpenAI Vision
// ❌ NO MODIFICAR:
//    - Debe validar el tipo de archivo antes de guardar
//    - Debe validar el tamaño antes de procesar
//    - Debe sanitizar nombres de archivo
//    - Debe prevenir path traversal attacks
// ========================================================

/**
 * Constante: Máximo de imágenes por sesión
 * 
 * Limita la cantidad de imágenes que un usuario puede subir en una sola sesión
 * para prevenir abuso y controlar el uso de almacenamiento
 * 
 * ✅ SE PUEDE MODIFICAR: El valor (actualmente 10)
 * ❌ NO MODIFICAR: Debe ser un número positivo
 */
const MAX_IMAGES_PER_SESSION = 10;

/**
 * Rate Limiter para uploads de imágenes
 * 
 * Previene que los usuarios suban demasiadas imágenes en poco tiempo
 * Configuración: máximo 3 uploads por minuto por IP + Session
 * 
 * ⚠️ CRÍTICO: Protege el servidor de abuso y sobrecarga
 * ✅ SE PUEDE MODIFICAR:
 *    - windowMs: ventana de tiempo (actualmente 1 minuto)
 *    - max: cantidad máxima de uploads (actualmente 3)
 * ❌ NO MODIFICAR:
 *    - Debe usar rateLimit de express-rate-limit
 *    - Debe generar una key única por IP + Session
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // Máximo 3 uploads por minuto
  message: { ok: false, error: 'Demasiadas imágenes subidas. Esperá un momento antes de intentar de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit por IP + Session (más estricto)
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const sid = req.sessionId || 'no-session';
    return `${ip}:${sid}`;
  },
  handler: (req, res) => {
    logger.warn(`[RATE_LIMIT] Upload bloqueado: IP=${req.ip}, Session=${req.sessionId}`);
    res.status(429).json({ ok: false, error: 'Demasiadas imágenes subidas. Esperá un momento.' });
  }
});

/**
 * Configuración de almacenamiento de Multer
 * 
 * Multer es el middleware que procesa multipart/form-data (archivos subidos)
 * Esta configuración define:
 * - Dónde se guardan los archivos (UPLOADS_DIR)
 * - Cómo se nombran los archivos (nombre único y seguro)
 * 
 * ⚠️ CRÍTICO: Esta configuración previene ataques de path traversal
 * ✅ SE PUEDE MODIFICAR:
 *    - El formato del nombre de archivo
 *    - La validación de extensiones permitidas
 * ❌ NO MODIFICAR:
 *    - Debe validar extensiones antes de guardar
 *    - Debe generar nombres únicos
 *    - Debe prevenir path traversal (.., /, \)
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Verificar que el directorio existe y es seguro
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o755 });
    }

    // Verificar permisos de escritura
    try {
      fs.accessSync(UPLOADS_DIR, fs.constants.W_OK);
      cb(null, UPLOADS_DIR);
    } catch (err) {
      logger.error('[MULTER] Sin permisos de escritura en UPLOADS_DIR:', err);
      cb(new Error('No se puede escribir en el directorio de uploads'));
    }
  },
  filename: (req, file, cb) => {
    try {
      // Sanitizar nombre de archivo con mayor seguridad
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

      if (!allowedExts.includes(ext)) {
        return cb(new Error('Tipo de archivo no permitido'));
      }

      // Generar nombre único con timestamp y random
      const timestamp = Date.now();
      const random = crypto.randomBytes(8).toString('hex');
      const sessionId = (req.sessionId || 'anon').substring(0, 20).replace(/[^a-zA-Z0-9._-]/g, '');
      const safeName = `${sessionId}_${timestamp}_${random}${ext}`;

      // Verificar que el path final es seguro (prevenir path traversal)
      const fullPath = path.join(UPLOADS_DIR, safeName);
      const resolvedPath = path.resolve(fullPath);
      const resolvedDir = path.resolve(UPLOADS_DIR);
      
      if (!resolvedPath.startsWith(resolvedDir)) {
        return cb(new Error('Ruta de archivo no válida'));
      }

      cb(null, safeName);
    } catch (err) {
      logger.error('[MULTER] Error generando nombre de archivo:', err);
      cb(new Error('Error procesando el archivo'));
    }
  }
});

/**
 * Configuración de Multer con validaciones de seguridad
 * 
 * Esta configuración valida:
 * - Tipo MIME del archivo
 * - Extensión del archivo
 * - Tamaño del archivo (máximo 5MB)
 * - Nombre del archivo (sin caracteres peligrosos)
 * 
 * ⚠️ CRÍTICO: Estas validaciones previenen ataques de seguridad
 * ✅ SE PUEDE MODIFICAR:
 *    - Los tipos MIME permitidos
 *    - El tamaño máximo de archivo
 * ❌ NO MODIFICAR:
 *    - Debe validar Content-Type
 *    - Debe validar MIME type
 *    - Debe validar extensión
 *    - Debe prevenir path traversal
 */
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 1, // Solo 1 archivo a la vez
    fields: 10, // Limitar campos
    fieldSize: 1 * 1024 * 1024, // 1MB por campo
    fieldNameSize: 100, // 100 bytes para nombres de campo
    parts: 20 // Limitar partes multipart
  },
  fileFilter: (req, file, cb) => {
    // SECURITY: Validar Content-Type del multipart (no solo MIME del archivo)
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return cb(new Error('Content-Type debe ser multipart/form-data'));
    }

    // Validar MIME type del archivo (doble validación)
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WebP)'));
    }

    // Validar extensión del archivo
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!allowedExts.includes(ext)) {
      return cb(new Error('Extensión de archivo no permitida'));
    }

    // Validar nombre de archivo
    if (!file.originalname || file.originalname.length > 255) {
      return cb(new Error('Nombre de archivo inválido'));
    }

    // Prevenir path traversal en nombre
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Nombre de archivo contiene caracteres no permitidos'));
    }

    cb(null, true);
  }
});

/**
 * Middleware para servir archivos subidos estáticamente
 * 
 * Permite que el frontend acceda a las imágenes subidas mediante URLs
 * Ejemplo: https://stia.com.ar/uploads/abc123_1234567890_abcdef.jpg
 * 
 * ⚠️ CRÍTICO: Solo sirve archivos desde UPLOADS_DIR (no permite path traversal)
 * ✅ SE PUEDE MODIFICAR:
 *    - maxAge: tiempo de cache (actualmente 7 días)
 * ❌ NO MODIFICAR:
 *    - Debe usar express.static con UPLOADS_DIR
 *    - No debe permitir acceso fuera de UPLOADS_DIR
 */
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true
}));

/**
 * Valida que un archivo sea una imagen real
 * 
 * Esta función verifica:
 * 1. Magic numbers (firma binaria del tipo de archivo)
 * 2. Dimensiones razonables (no demasiado grandes ni pequeñas)
 * 
 * ⚠️ CRÍTICO: Previene que se suban archivos maliciosos disfrazados de imágenes
 * ✅ SE PUEDE MODIFICAR:
 *    - Los límites de dimensiones
 *    - Los magic numbers soportados
 * ❌ NO MODIFICAR:
 *    - Debe verificar magic numbers
 *    - Debe verificar dimensiones con sharp
 * 
 * @param {string} filePath - Ruta al archivo a validar
 * @returns {Promise<object>} { valid: boolean, error?: string, metadata?: object }
 */
async function validateImageFile(filePath) {
  try {
    // Leer primeros bytes para verificar magic number (firma binaria)
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Verificar magic numbers (firmas binarias de tipos de imagen)
    const magicNumbers = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46, 0x38],
      webp: [0x52, 0x49, 0x46, 0x46] // "RIFF"
    };

    let isValid = false;
    for (const [type, magic] of Object.entries(magicNumbers)) {
      let matches = true;
      for (let i = 0; i < magic.length; i++) {
        if (buffer[i] !== magic[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      return { valid: false, error: 'Archivo no es una imagen válida' };
    }

    // Validación adicional con sharp (verificar dimensiones)
    const metadata = await sharp(filePath).metadata();

    // Verificar dimensiones razonables
    if (metadata.width > 10000 || metadata.height > 10000) {
      return { valid: false, error: 'Dimensiones de imagen demasiado grandes' };
    }

    if (metadata.width < 10 || metadata.height < 10) {
      return { valid: false, error: 'Dimensiones de imagen demasiado pequeñas' };
    }

    return { valid: true, metadata };
  } catch (err) {
    return { valid: false, error: 'Error validando imagen: ' + err.message };
  }
}

/**
 * Comprime una imagen para ahorrar espacio
 * 
 * Esta función:
 * 1. Redimensiona la imagen a máximo 1920px (mantiene aspect ratio)
 * 2. Comprime a calidad JPEG 85%
 * 3. Retorna información sobre el ahorro de espacio
 * 
 * ⚠️ CRÍTICO: Reduce significativamente el tamaño de las imágenes
 * ✅ SE PUEDE MODIFICAR:
 *    - El tamaño máximo de redimensionamiento (actualmente 1920px)
 *    - La calidad de compresión (actualmente 85%)
 * ❌ NO MODIFICAR:
 *    - Debe usar sharp para procesar
 *    - Debe mantener aspect ratio
 *    - Debe retornar información de ahorro
 * 
 * @param {string} inputPath - Ruta a la imagen original
 * @param {string} outputPath - Ruta donde guardar la imagen comprimida
 * @returns {Promise<object>} { success: boolean, originalSize?: number, compressedSize?: number, savedBytes?: number, compressionTime?: number, error?: string }
 */
async function compressImage(inputPath, outputPath) {
  try {
    const startTime = Date.now();
    await sharp(inputPath)
      .resize(1920, 1920, { // Máximo 1920px, mantiene aspect ratio
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 }) // Comprimir a 85% calidad
      .toFile(outputPath);

    const compressionTime = Date.now() - startTime;

    // Obtener tamaños de archivo
    const originalSize = fs.statSync(inputPath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const savedBytes = originalSize - compressedSize;
    const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);

    logger.info(`[COMPRESS] ${path.basename(inputPath)}: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (saved ${savedPercent}%) in ${compressionTime}ms`);

    return { success: true, originalSize, compressedSize, savedBytes, compressionTime };
  } catch (err) {
    logger.error('[COMPRESS] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * POST /api/upload-image
 * 
 * Endpoint para subir imágenes al chat
 * 
 * Este endpoint:
 * 1. Valida el archivo (tipo, tamaño, seguridad)
 * 2. Comprime la imagen si es necesario
 * 3. Analiza la imagen con OpenAI Vision (opcional)
 * 4. Guarda la imagen en la sesión
 * 5. Retorna la URL de la imagen y el análisis
 * 
 * ⚠️ CRÍTICO: Este endpoint maneja archivos subidos por usuarios
 * ✅ SE PUEDE MODIFICAR:
 *    - El prompt de análisis de OpenAI Vision
 *    - El formato de la respuesta
 *    - Los límites de tamaño
 * ❌ NO MODIFICAR:
 *    - Debe validar el archivo antes de procesar
 *    - Debe validar la sesión
 *    - Debe limitar imágenes por sesión
 *    - Debe sanitizar nombres de archivo
 * 
 * @route POST /api/upload-image
 * @middleware uploadLimiter, upload.single('image')
 * @returns {object} { ok: boolean, imageUrl?: string, analysis?: object, reply?: string, error?: string }
 */
app.post('/api/upload-image', uploadLimiter, upload.single('image'), async (req, res) => {
  const uploadStartTime = Date.now();
  let uploadedFilePath = null;

  try {
    // Validación básica: verificar que se recibió un archivo
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ninguna imagen' });
    }

    uploadedFilePath = req.file.path;

    // Validar session ID
    const sid = req.sessionId || req.headers['x-session-id'] || req.body.sessionId;
    if (!sid || typeof sid !== 'string' || sid.length < 10) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Session ID inválido' });
    }

    // Cargar sesión
    const session = await getSession(sid);
    if (!session) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Sesión no encontrada' });
    }

    // Limitar uploads por sesión
    if (!session.images) session.images = [];
    if (session.images.length >= MAX_IMAGES_PER_SESSION) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: `Límite de imágenes por sesión alcanzado (${MAX_IMAGES_PER_SESSION} máx)` });
    }

    // Validar que sea una imagen real
    const validation = await validateImageFile(uploadedFilePath);
    if (!validation.valid) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: validation.error });
    }

    // Comprimir imagen
    const originalPath = uploadedFilePath;
    const compressedPath = originalPath.replace(/(\.[^.]+)$/, '-compressed$1');
    const compressionResult = await compressImage(originalPath, compressedPath);

    let finalPath = originalPath;
    let finalSize = req.file.size;

    if (compressionResult.success && compressionResult.compressedSize < req.file.size) {
      // Usar versión comprimida
      fs.unlinkSync(originalPath);
      fs.renameSync(compressedPath, originalPath);
      finalSize = compressionResult.compressedSize;
      logger.info(`[UPLOAD] Compresión ahorró ${(compressionResult.savedBytes / 1024).toFixed(1)}KB`);
    } else if (compressionResult.success) {
      // Original era más pequeño, eliminar comprimida
      fs.unlinkSync(compressedPath);
    }

    // Construir URL de imagen (sanitizada)
    const safeFilename = path.basename(req.file.filename);
    const imageUrl = `${PUBLIC_BASE_URL}/uploads/${safeFilename}`;

    // Analizar imagen con OpenAI Vision si está disponible
    // NOTA: Esta funcionalidad requiere configuración de OpenAI
    // Si no está configurado, simplemente no se analiza la imagen
    // 
    // Para implementar análisis con OpenAI Vision:
    // 1. Configurar OPENAI_API_KEY en variables de entorno
    // 2. Importar OpenAI client al inicio del archivo
    // 3. Llamar a openai.chat.completions.create() con el modelo de visión
    // 4. Procesar la respuesta y guardar en imageAnalysis
    //
    // Ejemplo de implementación (comentado):
    // if (process.env.OPENAI_API_KEY && openai) {
    //   try {
    //     const visionResponse = await openai.chat.completions.create({
    //       model: 'gpt-4o-mini',
    //       messages: [{
    //         role: 'user',
    //         content: [
    //           { type: 'text', text: 'Analiza esta imagen de soporte técnico...' },
    //           { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
    //         ]
    //       }],
    //       max_tokens: 500
    //     });
    //     imageAnalysis = JSON.parse(visionResponse.choices[0]?.message?.content || '{}');
    //   } catch (err) {
    //     logger.error('[VISION] Error analizando imagen:', err);
    //     imageAnalysis = null;
    //   }
    // }
    let imageAnalysis = null;

    // Guardar datos de imagen en sesión
    const imageData = {
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: finalSize,
      uploadedAt: new Date().toISOString(),
      analysis: imageAnalysis
    };

    session.images.push(imageData);

    // Agregar al transcript
    session.transcript.push({
      who: 'user',
      text: '[Imagen subida]',
      imageUrl: imageUrl,
      ts: nowIso()
    });

    await saveSessionAndTranscript(sid, session);

    // Construir respuesta
    let replyText = '✅ Imagen recibida correctamente.';

    if (imageAnalysis && imageAnalysis.problemDetected) {
      replyText += `\n\n🔍 **Análisis de la imagen:**\n${imageAnalysis.problemDetected}`;

      if (imageAnalysis.errorMessages && imageAnalysis.errorMessages.length > 0) {
        replyText += `\n\n**Errores detectados:**\n${imageAnalysis.errorMessages.map(e => `• ${e}`).join('\n')}`;
      }

      if (imageAnalysis.recommendations) {
        replyText += `\n\n**Recomendación:**\n${imageAnalysis.recommendations}`;
      }
    }

    session.transcript.push({
      who: 'bot',
      text: replyText,
      ts: nowIso()
    });

    await saveSessionAndTranscript(sid, session);

    const totalUploadTime = Date.now() - uploadStartTime;
    logger.info(`[UPLOAD] Completado en ${totalUploadTime}ms (${(finalSize / 1024).toFixed(1)}KB)`);

    res.json({
      ok: true,
      imageUrl,
      analysis: imageAnalysis,
      reply: replyText,
      sessionId: sid
    });

  } catch (err) {
    logger.error('[UPLOAD] Error:', err);
    
    // Limpiar archivo si se subió pero falló el procesamiento
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkErr) {
        logger.error('[UPLOAD] Error eliminando archivo:', unlinkErr);
      }
    }
    
    res.status(500).json({
      ok: false,
      error: err.message || 'Error al subir la imagen'
    });
  }
});

// ========================================================
// 🌐 ENDPOINT: GET /api/greeting
// ========================================================
// 
// Este endpoint se llama cuando el usuario abre el chat por primera vez
// Crea una nueva sesión y muestra el mensaje de política de privacidad
//
// ⚠️ CRÍTICO: Este es el punto de entrada del chat
// ✅ SE PUEDE MODIFICAR:
//    - El formato de la respuesta JSON
//    - Los campos adicionales que se retornan
//    - La detección de locale desde headers
// ❌ NO MODIFICAR:
//    - Debe crear una sesión con stage: STATES.ASK_LANGUAGE
//    - Debe retornar el mensaje de buildLanguageSelectionGreeting()
//    - Debe retornar los botones de aceptación/rechazo
//
// Si modificas la estructura de la sesión inicial:
// - Asegúrate de que todos los campos necesarios estén presentes
// - Actualiza también el handler handleAskLanguageStage si usa esos campos
// ========================================================

/**
 * GET /api/greeting
 * Endpoint para iniciar una nueva conversación
 * Crea una sesión nueva y muestra el mensaje de GDPR
 */
app.get('/api/greeting', async (req, res) => {
  try {
    // Generar un ID único para esta sesión
    const sessionId = generateSessionId();
    
    // Detectar idioma preferido del usuario desde headers HTTP
    // Los navegadores envían 'Accept-Language' con los idiomas que el usuario prefiere
    const acceptLanguage = String(req.headers['accept-language'] || '').toLowerCase();
    const headerLocale = String(req.headers['x-locale'] || req.headers['x-lang'] || '').toLowerCase();
    
    // Determinar locale inicial
    // Prioridad: header personalizado > Accept-Language > español por defecto
    let initialLocale = 'es-AR'; // Por defecto: Español Argentina
    if (headerLocale) {
      initialLocale = headerLocale;
    } else if (acceptLanguage.startsWith('en')) {
      initialLocale = 'en';
    } else if (acceptLanguage.startsWith('es')) {
      initialLocale = acceptLanguage.includes('ar') ? 'es-AR' : 'es-419';
    }
    
    logger.info(`[GREETING] Nueva sesión: ${sessionId}, locale detectado: ${initialLocale}`);
    
    // Crear objeto de sesión inicial
    // Esta estructura se usa en TODO el sistema, así que es importante mantenerla
    const newSession = {
      id: sessionId,                    // ID único de la sesión
      userName: null,                   // Nombre del usuario (se llena en ASK_NAME)
      stage: STATES.ASK_LANGUAGE,       // ⚠️ CRÍTICO: Estado inicial siempre es ASK_LANGUAGE
      device: null,                     // Dispositivo del usuario (se llena más adelante)
      problem: null,                    // Problema del usuario (se llena más adelante)
      issueKey: null,                   // Clave del issue (se llena más adelante)
      tests: {                          // Resultados de tests de diagnóstico
        basic: [],
        ai: [],
        advanced: []
      },
      stepsDone: [],                    // Pasos que el usuario ya completó
      fallbackCount: 0,                 // Contador de fallbacks (errores)
      waEligible: false,                // Si es elegible para WhatsApp
      transcript: [],                   // Historial de la conversación
      pendingUtterance: null,           // Mensaje pendiente (si hay)
      lastHelpStep: null,               // Último paso de ayuda solicitado
      startedAt: nowIso(),              // Timestamp de inicio de la sesión
      nameAttempts: 0,                  // Intentos de obtener el nombre
      stepProgress: {},                 // Progreso en los pasos
      pendingDeviceGroup: null,          // Grupo de dispositivos pendiente
      userLocale: initialLocale,        // Idioma del usuario (detectado o por defecto)
      gdprConsent: null,                 // ⚠️ CRÍTICO: null = no aceptado, true = aceptado
      gdprConsentDate: null,            // Fecha/hora del consentimiento (si aceptó)
      contextWindow: [],                 // Ventana de contexto (últimos mensajes)
      detectedEntities: {               // Entidades detectadas automáticamente
        device: null,
        action: null,
        urgency: 'normal'
      }
    };
    
    // Generar el mensaje de bienvenida con política de privacidad
    // Usa el locale detectado para mostrar el mensaje en el idioma correcto
    const greeting = buildLanguageSelectionGreeting(initialLocale);
    
    // Agregar el mensaje inicial al transcript
    newSession.transcript.push({ 
      who: 'bot', 
      text: greeting.text, 
      ts: nowIso() 
    });
    
    // Guardar la sesión en el sistema de archivos
    await saveSessionAndTranscript(sessionId, newSession);
    
    logger.info(`[GREETING] ✅ Sesión creada: ${sessionId}, stage: ${newSession.stage}`);
    
    // Retornar respuesta al frontend
    // El frontend usa esta respuesta para mostrar el mensaje y los botones
    return res.json({
      ok: true,                          // Indica que la operación fue exitosa
      greeting: greeting.text,           // Texto del mensaje de bienvenida
      reply: greeting.text,              // Mismo texto (compatibilidad)
      stage: newSession.stage,           // Estado actual: ASK_LANGUAGE
      sessionId: sessionId,              // ⚠️ CRÍTICO: El frontend necesita este ID para futuras requests
      buttons: greeting.buttons || []    // Botones de aceptación/rechazo
    });
    
  } catch (error) {
    // Si hay un error, loguear y retornar error al frontend
    logger.error('[GREETING] ❌ Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'greeting_failed',
      message: 'Error al crear sesión. Por favor, intentá de nuevo.'
    });
  }
});

// ========================================================
// 💬 ENDPOINT: POST /api/chat (Manejo de Etapas 1 y 2)
// ========================================================
// 
// Este endpoint procesa los mensajes del usuario durante las Etapas 1 y 2
// - Etapa 1: GDPR y selección de idioma
// - Etapa 2: Pedir nombre del usuario
// Maneja tanto texto escrito como clics en botones
//
// ⚠️ CRÍTICO: Este endpoint es el corazón del sistema de chat
// ✅ SE PUEDE MODIFICAR:
//    - El formato de la respuesta JSON
//    - Validaciones adicionales
//    - Logging y métricas
// ❌ NO MODIFICAR:
//    - Debe llamar a handleAskLanguageStage() cuando stage === ASK_LANGUAGE
//    - Debe llamar a handleAskNameStage() cuando stage === ASK_NAME
//    - Debe mapear botones a texto antes de procesar
//    - Debe guardar la sesión después de cada interacción
//
// Si agregas más etapas en el futuro:
// - Agrega más casos en el switch/if para cada stage
// - Cada handler debe retornar { ok, reply, stage, buttons?, handled }
// ========================================================

/**
 * POST /api/chat
 * Endpoint principal para procesar mensajes del chat
 * - Etapa 1: Maneja GDPR y selección de idioma
 * - Etapa 2: Maneja pedido y validación de nombre
 */
app.post('/api/chat', async (req, res) => {
  try {
    const body = req.body || {};
    
    // Obtener o generar sessionId
    // El frontend debe enviar el sessionId que recibió de /api/greeting
    const sessionId = body.sessionId || getSessionId(req);
    
    // Validar sessionId: debe ser un string no vacío con formato válido
    // Formato esperado: "sess_" seguido de 32 caracteres hexadecimales
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
      return res.status(400).json({
        ok: false,
        error: 'sessionId_invalid',
        message: 'Se requiere un sessionId válido'
      });
    }
    
    // Validar formato del sessionId (debe empezar con "sess_" y tener al menos 10 caracteres)
    // Permitir sessionIds generados por getSessionId() que pueden tener diferentes formatos
    if (sessionId.length > 200) {
      return res.status(400).json({
        ok: false,
        error: 'sessionId_too_long',
        message: 'El sessionId es demasiado largo'
      });
    }
    
    // Cargar la sesión existente
    let session = await getSession(sessionId);
    
    // Si no existe sesión, crear una nueva (fallback)
    // Esto no debería pasar normalmente, pero es una medida de seguridad
    if (!session) {
      logger.warn(`[CHAT] ⚠️  Sesión no encontrada: ${sessionId}, creando nueva`);
      
      // Crear sesión nueva igual que en /api/greeting
      session = {
        id: sessionId,
        userName: null,
        stage: STATES.ASK_LANGUAGE,
        device: null,
        problem: null,
        issueKey: null,
        tests: { basic: [], ai: [], advanced: [] },
        stepsDone: [],
        fallbackCount: 0,
        waEligible: false,
        transcript: [],
        pendingUtterance: null,
        lastHelpStep: null,
        startedAt: nowIso(),
        nameAttempts: 0,
        stepProgress: {},
        pendingDeviceGroup: null,
        userLocale: 'es-AR',
        gdprConsent: null,
        gdprConsentDate: null,
        contextWindow: [],
        detectedEntities: { device: null, action: null, urgency: 'normal' }
      };
      
      // Mostrar mensaje de GDPR
      const greeting = buildLanguageSelectionGreeting(session.userLocale);
      session.transcript.push({ who: 'bot', text: greeting.text, ts: nowIso() });
      await saveSessionAndTranscript(sessionId, session);
      
      return res.json({
        ok: true,
        reply: greeting.text,
        stage: session.stage,
        sessionId: sessionId,
        buttons: greeting.buttons || []
      });
    }
    
    // ========================================
    // MAPEO DE BOTONES
    // ========================================
    // Si el usuario hizo clic en un botón, el frontend envía:
    // { action: 'button', value: 'si', label: 'Sí Acepto ✔️' }
    // Este código mapea el valor del botón al texto correspondiente
    // para que se procese como si el usuario lo hubiera escrito
    //
    // ⚠️ CRÍTICO: Esta lógica permite que los botones funcionen correctamente
    // ✅ SE PUEDE MODIFICAR: Agregar más mapeos de botones
    // ❌ NO MODIFICAR: Debe establecer incomingText antes de procesar
    //
    let incomingText = String(body.message || body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;
    
    // Detectar si el usuario hizo clic en un botón
    if (body.action === 'button' && body.value) {
      buttonToken = String(body.value);
      buttonLabel = body.label || buttonToken;
      
      logger.info(`[BUTTON] Botón clickeado: ${buttonToken} (${buttonLabel})`);
      
      // ========================================
      // MAPEO DE VALORES DE BOTONES A TEXTO
      // ========================================
      // Cuando el usuario hace clic en un botón, el frontend envía el token del botón
      // Este código mapea el token al texto correspondiente para procesarlo
      // como si el usuario lo hubiera escrito
      //
      // ⚠️ CRÍTICO: Esta lógica permite que los botones funcionen correctamente
      // ✅ SE PUEDE MODIFICAR: Agregar más mapeos de botones
      // ❌ NO MODIFICAR: Debe establecer incomingText antes de procesar
      //
      // Si agregas un nuevo botón:
      // 1. Agrégalo aquí con su mapeo token → texto
      // 2. O usa getButtonDefinition() para obtener el texto automáticamente
      //
      
      // Buscar la definición del botón para obtener su texto
      const buttonDef = getButtonDefinition(buttonToken);
      
      // Mapear valores de botones a texto
      // Prioridad: definición del botón > mapeo manual > token como texto
      if (buttonDef && buttonDef.text) {
        // Si el botón tiene definición con texto, usarlo
        incomingText = buttonDef.text;
      } else if (buttonToken === 'si' || buttonToken === 'yes') {
        // Botones de GDPR
        incomingText = 'sí'; // Normalizar a "sí" para el handler
      } else if (buttonToken === 'no') {
        // Botón de rechazo GDPR
        incomingText = 'no';
      } else if (buttonToken === 'español' || buttonToken === 'spanish') {
        // Botones de selección de idioma
        incomingText = 'español';
      } else if (buttonToken === 'english' || buttonToken === 'inglés') {
        // Botones de selección de idioma
        incomingText = 'english';
      } else {
        // Si no hay mapeo específico, usar el valor del botón como texto
        // Esto permite que botones sin mapeo explícito funcionen igual
        incomingText = buttonToken;
      }
      
      logger.info(`[BUTTON] Token mapeado: ${buttonToken} → "${incomingText}"`);
    }
    
    // Validar que hay texto para procesar
    if (!incomingText) {
      return res.json({
        ok: false,
        reply: 'No recibí ningún mensaje. ¿Podrías escribir de nuevo?',
        stage: session.stage
      });
    }
    
    // Agregar el mensaje del usuario al transcript
    session.transcript.push({
      who: 'user',
      text: buttonToken ? `[BOTON] ${buttonLabel || buttonToken}` : incomingText,
      ts: nowIso()
    });
    
    logger.info(`[CHAT] Usuario (${sessionId}): "${incomingText.substring(0, 50)}${incomingText.length > 50 ? '...' : ''}"`);
    
    // ========================================
    // PROCESAR SEGÚN EL STAGE ACTUAL
    // ========================================
    // En la Etapa 1, manejamos ASK_LANGUAGE
    // En la Etapa 2, manejamos ASK_NAME
    // En etapas futuras, aquí se agregarán más casos
    //
    if (session.stage === STATES.ASK_LANGUAGE) {
      // Llamar al handler de la Etapa 1
      const result = await handleAskLanguageStage(
        session,
        incomingText,
        buttonToken,
        sessionId
      );
      
      // Si el handler procesó la request, retornar su respuesta
      if (result && result.handled) {
        // Guardar la sesión actualizada (el handler ya la guardó, pero por seguridad)
        await saveSessionAndTranscript(sessionId, session);
        
        return res.json({
          ok: result.ok,
          reply: result.reply,
          stage: result.stage,
          sessionId: sessionId,
          buttons: result.buttons || []
        });
      }
    }
    
    // ========================================
    // ETAPA 2: ASK_NAME - Pedir nombre del usuario
    // ========================================
    if (session.stage === STATES.ASK_NAME) {
      // Llamar al handler de la Etapa 2
      const result = await handleAskNameStage(
        session,
        incomingText,
        buttonToken,
        sessionId
      );
      
      // Si el handler procesó la request, retornar su respuesta
      if (result && result.handled) {
        // Guardar la sesión actualizada (el handler ya la guardó, pero por seguridad)
        await saveSessionAndTranscript(sessionId, session);
        
        return res.json({
          ok: result.ok,
          reply: result.reply,
          stage: result.stage,
          sessionId: sessionId,
          buttons: result.buttons || []
        });
      }
    }
    
    // ========================================
    // ETAPA 3: ASK_NEED - Preguntar qué necesita el usuario
    // ========================================
    if (session.stage === STATES.ASK_NEED) {
      // Llamar al handler de la Etapa 3
      const result = await handleAskNeedStage(
        session,
        incomingText,
        buttonToken,
        sessionId
      );
      
      // Si el handler procesó la request, retornar su respuesta
      if (result && result.handled) {
        // Guardar la sesión actualizada (el handler ya la guardó, pero por seguridad)
        await saveSessionAndTranscript(sessionId, session);
        
        return res.json({
          ok: result.ok,
          reply: result.reply,
          stage: result.stage,
          sessionId: sessionId,
          buttons: result.buttons || []
        });
      }
    }
    
    // ========================================
    // ETAPA 4: ASK_DEVICE - Preguntar tipo de dispositivo
    // ========================================
    if (session.stage === STATES.ASK_DEVICE) {
      // Llamar al handler de la Etapa 4
      const result = await handleAskDeviceStage(
        session,
        incomingText,
        buttonToken,
        sessionId
      );
      
      // Si el handler procesó la request, retornar su respuesta
      if (result && result.handled) {
        // Guardar la sesión actualizada (el handler ya la guardó, pero por seguridad)
        await saveSessionAndTranscript(sessionId, session);
        
        return res.json({
          ok: result.ok,
          reply: result.reply,
          stage: result.stage,
          sessionId: sessionId,
          buttons: result.buttons || []
        });
      }
    }
    
    // ========================================
    // ETAPA 5: BASIC_TESTS - Ayudar con pasos de diagnóstico
    // ========================================
    if (session.stage === STATES.BASIC_TESTS) {
      // Llamar al handler de la Etapa 5
      const result = await handleBasicTestsStage(
        session,
        incomingText,
        buttonToken,
        sessionId
      );
      
      // Si el handler procesó la request, retornar su respuesta
      if (result && result.handled) {
        // Guardar la sesión actualizada (el handler ya la guardó, pero por seguridad)
        await saveSessionAndTranscript(sessionId, session);
        
        return res.json({
          ok: result.ok,
          reply: result.reply,
          stage: result.stage,
          sessionId: sessionId,
          buttons: result.buttons || []
        });
      }
      
      // ========================================
      // MANEJO ESPECIAL: BTN_WHATSAPP_TECNICO desde BASIC_TESTS
      // ========================================
      // Si el usuario hace clic en "Hablar con un Técnico" desde BASIC_TESTS
      // Cambiar a ESCALATE y generar el ticket
      //
      if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
        changeStage(session, STATES.ESCALATE);
        return await handleEscalateStage(session, incomingText, buttonToken, sessionId, res);
      }
    }
    
    // ========================================
    // ETAPA 6: ESCALATE - Escalar a técnico humano
    // ========================================
    if (session.stage === STATES.ESCALATE || session.stage === STATES.CREATE_TICKET) {
      // Llamar al handler de la Etapa 6
      const result = await handleEscalateStage(
        session,
        incomingText,
        buttonToken,
        sessionId,
        res
      );
      
      // Si el handler procesó la request, retornar su respuesta
      // (handleEscalateStage ya envía la respuesta con res.json, así que retornamos)
      if (result && result.handled) {
        return; // Ya se envió la respuesta
      }
    }
    
    // ========================================
    // FALLBACK: Si no se procesó en ningún handler
    // ========================================
    // Esto no debería pasar en las Etapas 1 y 2, pero es una medida de seguridad
    // En etapas futuras, aquí se manejarán otros stages
    //
    logger.warn(`[CHAT] ⚠️  Stage no manejado: ${session.stage}`);
    
    await saveSessionAndTranscript(sessionId, session);
    
    return res.json({
      ok: false,
      reply: 'Lo siento, aún no puedo procesar esa solicitud. Por favor, usá los botones disponibles.',
      stage: session.stage,
      sessionId: sessionId
    });
    
  } catch (error) {
    // Manejo de errores global
    logger.error('[CHAT] ❌ Error procesando mensaje:', error);
    
    return res.status(500).json({
      ok: false,
      reply: '😅 Disculpá, tuve un problema momentáneo. Probá escribirme de nuevo.',
      error: 'Internal server error'
    });
  }
});

// ========================================================
// ✅ INICIALIZACIÓN COMPLETA
// ========================================================

logger.info('✅ Configuración inicial completada');
logger.info('✅ Etapa 1 (GDPR y Selección de Idioma) implementada');
logger.info('✅ Etapa 2 (Pedir Nombre del Usuario) implementada');
logger.info('✅ Etapa 3 (Preguntar Qué Necesita - ASK_NEED) implementada');
logger.info('✅ Etapa 4 (Preguntar Tipo de Dispositivo - ASK_DEVICE) implementada');
logger.info('✅ Etapa 5 (Ayudar con Pasos de Diagnóstico - BASIC_TESTS) implementada');
logger.info('✅ Etapa 6 (Escalar a Técnico Humano - ESCALATE) implementada');
logger.info('📝 Endpoints disponibles:');
logger.info('   - GET  /api/greeting  → Iniciar nueva conversación');
logger.info('   - POST /api/chat     → Procesar mensajes (Etapas 1, 2, 3, 4, 5 y 6)');

// Exportar la aplicación Express para testing o uso externo
export default app;

