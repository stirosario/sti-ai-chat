/**
 * Script de validación PWA
 * Verifica que todos los componentes estén correctamente configurados
 * Uso: node pwa-validate.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checks = [];
let passed = 0;
let failed = 0;

function check(name, condition, errorMsg) {
  const status = condition ? '✅' : '❌';
  const result = { name, passed: condition, message: condition ? 'OK' : errorMsg };
  checks.push(result);
  
  if (condition) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} ${name}`);
  if (!condition && errorMsg) {
    console.log(`   → ${errorMsg}`);
  }
}

console.log('🔍 Validando configuración PWA de ChatSTI\n');

// 1. Verificar archivos core
console.log('📁 Archivos Core:');
check(
  'manifest.json existe',
  fs.existsSync('public/manifest.json'),
  'Crear archivo public/manifest.json'
);

check(
  'sw.js existe',
  fs.existsSync('public/sw.js'),
  'Crear archivo public/sw.js'
);

check(
  'pwa-install.js existe',
  fs.existsSync('public/pwa-install.js'),
  'Crear archivo public/pwa-install.js'
);

check(
  'offline.html existe',
  fs.existsSync('public/offline.html'),
  'Crear archivo public/offline.html'
);

check(
  'browserconfig.xml existe',
  fs.existsSync('public/browserconfig.xml'),
  'Crear archivo public/browserconfig.xml'
);

// 2. Verificar manifest.json
console.log('\n📱 Manifest:');
if (fs.existsSync('public/manifest.json')) {
  try {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
    
    check(
      'Manifest tiene nombre',
      !!manifest.name,
      'Agregar propiedad "name" al manifest'
    );
    
    check(
      'Manifest tiene short_name',
      !!manifest.short_name,
      'Agregar propiedad "short_name" al manifest'
    );
    
    check(
      'Manifest tiene start_url',
      !!manifest.start_url,
      'Agregar propiedad "start_url" al manifest'
    );
    
    check(
      'Manifest tiene display: standalone',
      manifest.display === 'standalone',
      'Configurar "display": "standalone" en manifest'
    );
    
    check(
      'Manifest tiene theme_color',
      !!manifest.theme_color,
      'Agregar propiedad "theme_color" al manifest'
    );
    
    check(
      'Manifest tiene background_color',
      !!manifest.background_color,
      'Agregar propiedad "background_color" al manifest'
    );
    
    check(
      'Manifest tiene íconos',
      manifest.icons && manifest.icons.length >= 2,
      'Agregar al menos 2 íconos (192x192 y 512x512) al manifest'
    );
    
    // Verificar ícono 192x192
    const icon192 = manifest.icons?.find(i => i.sizes === '192x192');
    check(
      'Ícono 192x192 configurado',
      !!icon192,
      'Agregar ícono 192x192 al manifest'
    );
    
    // Verificar ícono 512x512
    const icon512 = manifest.icons?.find(i => i.sizes === '512x512');
    check(
      'Ícono 512x512 configurado',
      !!icon512,
      'Agregar ícono 512x512 al manifest'
    );
    
  } catch (err) {
    check('Manifest válido JSON', false, `Error parseando manifest: ${err.message}`);
  }
}

// 3. Verificar íconos
console.log('\n🎨 Íconos:');
const requiredSizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = 'public/icons';

check(
  'Directorio de íconos existe',
  fs.existsSync(iconsDir),
  'Crear directorio public/icons/'
);

if (fs.existsSync(iconsDir)) {
  requiredSizes.forEach(size => {
    const iconPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    check(
      `Ícono ${size}x${size} existe`,
      fs.existsSync(iconPath),
      `Generar ícono ${size}x${size}.png (ver GENERAR_ICONOS.md)`
    );
  });
}

// 4. Verificar Service Worker
console.log('\n⚙️ Service Worker:');
if (fs.existsSync('public/sw.js')) {
  const swContent = fs.readFileSync('public/sw.js', 'utf8');
  
  check(
    'SW tiene event listener install',
    swContent.includes("addEventListener('install'"),
    'Agregar event listener "install" al Service Worker'
  );
  
  check(
    'SW tiene event listener activate',
    swContent.includes("addEventListener('activate'"),
    'Agregar event listener "activate" al Service Worker'
  );
  
  check(
    'SW tiene event listener fetch',
    swContent.includes("addEventListener('fetch'"),
    'Agregar event listener "fetch" al Service Worker'
  );
  
  check(
    'SW tiene cache version',
    swContent.includes('CACHE_VERSION'),
    'Definir CACHE_VERSION en Service Worker'
  );
}

// 5. Verificar server.js
console.log('\n🖥️ Server:');
if (fs.existsSync('server.js')) {
  const serverContent = fs.readFileSync('server.js', 'utf8');
  
  check(
    'Server sirve archivos estáticos',
    serverContent.includes('express.static'),
    'Agregar express.static("public") al server.js'
  );
  
  check(
    'Server tiene ruta /manifest.json',
    serverContent.includes('/manifest.json'),
    'Agregar ruta específica para /manifest.json'
  );
  
  check(
    'Server tiene ruta /sw.js',
    serverContent.includes('/sw.js'),
    'Agregar ruta específica para /sw.js'
  );
}

// 6. Verificar documentación
console.log('\n📚 Documentación:');
check(
  'PWA_README.md existe',
  fs.existsSync('PWA_README.md'),
  'Crear guía PWA_README.md'
);

check(
  'PWA_INTEGRATION.html existe',
  fs.existsSync('PWA_INTEGRATION.html'),
  'Crear guía de integración PWA_INTEGRATION.html'
);

check(
  'GENERAR_ICONOS.md existe',
  fs.existsSync('GENERAR_ICONOS.md'),
  'Crear guía GENERAR_ICONOS.md'
);

// Resumen
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMEN');
console.log('='.repeat(50));
console.log(`✅ Pasaron: ${passed}`);
console.log(`❌ Fallaron: ${failed}`);
console.log(`📝 Total: ${checks.length}`);

const percentage = Math.round((passed / checks.length) * 100);
console.log(`\n🎯 Completitud: ${percentage}%`);

if (failed === 0) {
  console.log('\n🎉 ¡PERFECTO! La PWA está completamente configurada.');
  console.log('\n📝 Próximos pasos:');
  console.log('1. Generar íconos (ver GENERAR_ICONOS.md)');
  console.log('2. Integrar en index.php (ver PWA_INTEGRATION.html)');
  console.log('3. Reiniciar servidor: node server.js');
  console.log('4. Testear en: http://localhost:3001');
  console.log('5. Verificar con Lighthouse en DevTools');
} else {
  console.log('\n⚠️ Hay tareas pendientes. Revisar los errores arriba.');
  console.log('\n📖 Consultar: PWA_README.md para instrucciones completas');
}

console.log('\n');
process.exit(failed === 0 ? 0 : 1);
