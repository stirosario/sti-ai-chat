/**
 * Script para generar íconos PWA desde logo
 * Requiere: npm install sharp
 * Uso: node generate-icons.js
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = './logo.png'; // Cambiar a la ruta del logo de STI
const OUTPUT_DIR = './public/icons';
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Crear directorio de salida
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✓ Directorio creado: ${OUTPUT_DIR}`);
}

// Verificar que existe el logo
if (!fs.existsSync(LOGO_PATH)) {
  console.error(`❌ Error: No se encontró el logo en ${LOGO_PATH}`);
  console.log('\n📝 Instrucciones:');
  console.log('1. Colocá el logo de STI en la raíz del proyecto como "logo.png"');
  console.log('2. El logo debe ser cuadrado y de alta resolución (mínimo 512x512)');
  console.log('3. Ejecutá: node generate-icons.js\n');
  process.exit(1);
}

// Validar que sharp está instalado
try {
  await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
} catch (err) {
  console.error('❌ Error: Sharp no está instalado correctamente');
  console.log('\n📦 Instalá sharp con: npm install sharp');
  process.exit(1);
}

// Generar íconos
async function generateIcons() {
  console.log('🎨 Generando íconos PWA...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
    
    try {
      await sharp(LOGO_PATH)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 10, g: 31, b: 68, alpha: 1 } // #0a1f44
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(outputPath);
      
      const stats = fs.statSync(outputPath);
      console.log(`✓ ${size}x${size} → ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
      successCount++;
    } catch (err) {
      console.error(`❌ Error generando ${size}x${size}:`, err.message);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Generados: ${successCount}/${SIZES.length} íconos`);
  if (errorCount > 0) {
    console.log(`⚠️ Errores: ${errorCount}`);
  }
  console.log(`\n📁 Ubicación: ${OUTPUT_DIR}`);
  console.log('\n📝 Próximos pasos:');
  console.log('1. Verificá que todos los íconos se generaron correctamente');
  console.log('2. Ejecutá: node pwa-validate.js');
  console.log('3. Actualizá el index.php con los tags PWA');
  
  return errorCount === 0;
}

generateIcons().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
