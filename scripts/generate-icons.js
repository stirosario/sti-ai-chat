import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '../public/icons');

// SVG base - logo de ChatSTI con diseño mejorado
const svgTemplate = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="chatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f0fdf4;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Fondo redondeado con gradiente verde -->
  <rect width="512" height="512" rx="120" fill="url(#grad)"/>
  
  <!-- Círculo decorativo de fondo -->
  <circle cx="256" cy="256" r="200" fill="#047857" opacity="0.2"/>
  
  <!-- Burbuja de chat principal -->
  <g transform="translate(256, 220)" filter="url(#shadow)">
    <!-- Burbuja principal con gradiente -->
    <rect x="-150" y="-90" width="300" height="180" rx="35" fill="url(#chatGrad)"/>
    
    <!-- Cola de la burbuja -->
    <path d="M -130 90 L -145 120 L -110 100 Z" fill="url(#chatGrad)"/>
    
    <!-- Texto "STI" con sombra -->
    <text x="0" y="5" font-family="Arial, sans-serif" font-size="90" font-weight="900" fill="#059669" text-anchor="middle">STI</text>
    
    <!-- Líneas decorativas arriba del texto -->
    <line x1="-80" y1="-50" x2="80" y2="-50" stroke="#10b981" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
    <line x1="-60" y1="-35" x2="60" y2="-35" stroke="#10b981" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
  </g>
  
  <!-- Iconos de herramientas mejorados -->
  <g transform="translate(170, 370)">
    <!-- Llave inglesa con gradiente -->
    <g>
      <path d="M -15 -8 L -8 -15 L 8 2 L 15 -5 L 22 2 L 8 16 L 2 10 L -15 28 L -22 21 Z" fill="#3b82f6" opacity="0.95"/>
      <circle cx="5" cy="5" r="4" fill="#60a5fa" opacity="0.7"/>
    </g>
  </g>
  
  <g transform="translate(342, 370)">
    <!-- Destornillador con gradiente -->
    <rect x="-4" y="-20" width="8" height="40" rx="3" fill="#f59e0b" opacity="0.95"/>
    <ellipse cx="0" cy="-24" rx="7" ry="5" fill="#dc2626" opacity="0.9"/>
    <line x1="0" y1="-10" x2="0" y2="10" stroke="#fbbf24" stroke-width="2" opacity="0.5"/>
  </g>
  
  <!-- Puntos de "escribiendo..." con animación sugerida -->
  <g transform="translate(256, 450)" opacity="0.4">
    <circle cx="-35" cy="0" r="14" fill="white"/>
    <circle cx="0" cy="0" r="14" fill="white"/>
    <circle cx="35" cy="0" r="14" fill="white"/>
  </g>
  
  <!-- Detalles adicionales: pequeñas estrellas decorativas -->
  <circle cx="80" cy="80" r="8" fill="white" opacity="0.3"/>
  <circle cx="432" cy="100" r="6" fill="white" opacity="0.25"/>
  <circle cx="100" cy="420" r="7" fill="white" opacity="0.3"/>
  <circle cx="420" cy="400" r="5" fill="white" opacity="0.2"/>
</svg>
`;

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  console.log('🎨 Generando iconos PWA para ChatSTI...\n');
  
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = Buffer.from(svgTemplate);

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    
    try {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(outputPath);
      
      console.log(`✅ Generado: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Error generando icon-${size}x${size}.png:`, error.message);
    }
  }

  console.log('\n🎉 ¡Iconos PWA generados exitosamente!');
  console.log(`📁 Ubicación: ${iconsDir}`);
}

generateIcons().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
