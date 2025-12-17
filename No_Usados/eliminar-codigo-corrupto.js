const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

console.log('Total líneas:', lines.length);

// Buscar el inicio: línea que contiene "// blacklist (trolls"
let startIdx = -1;
for (let i = 1360; i < 1370 && i < lines.length; i++) {
  if (lines[i].includes('// blacklist (trolls')) {
    startIdx = i;
    break;
  }
}

// Buscar el fin: línea que contiene "// ========================================================" antes de la segunda función readHistorialChat
let endIdx = -1;
for (let i = 1490; i < 1500 && i < lines.length; i++) {
  if (lines[i].trim() === '// ========================================================') {
    // Verificar que la siguiente línea contiene "TRANSCRIPT JSON HELPER"
    if (i + 1 < lines.length && lines[i + 1].includes('TRANSCRIPT JSON HELPER')) {
      endIdx = i;
      break;
    }
  }
}

console.log('startIdx:', startIdx, 'endIdx:', endIdx);

if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const newContent = before.concat(after).join('\n');
  fs.writeFileSync('server.js', newContent, 'utf8');
  console.log(`✅ Eliminadas ${endIdx - startIdx} líneas corruptas (índices ${startIdx} a ${endIdx})`);
  console.log(`Nuevo total: ${before.length + after.length} líneas`);
  
  // Verificar
  const verify = fs.readFileSync('server.js', 'utf8').split('\n');
  console.log(`Verificación: Archivo tiene ${verify.length} líneas`);
} else {
  console.log(`⚠️ No se encontraron marcadores válidos. startIdx: ${startIdx}, endIdx: ${endIdx}`);
}
