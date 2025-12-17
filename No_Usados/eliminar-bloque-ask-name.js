const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Encontrar el bloque ASK_NAME (línea 5477)
let startLine = 5476; // 0-indexed (línea 5477 en 1-indexed)
let endLine = -1;
let braceLevel = 0;
let foundStart = false;

for (let i = startLine; i < startLine + 110 && i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('if (false && false')) {
    foundStart = true;
    braceLevel = 1;
    continue;
  }
  
  if (foundStart) {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    braceLevel += openBraces - closeBraces;
    
    if (braceLevel === 0 && closeBraces > 0) {
      endLine = i;
      break;
    }
  }
}

if (endLine === -1) {
  console.error('❌ No se encontró el cierre del bloque');
  process.exit(1);
}

console.log(`Eliminando bloque ASK_NAME: líneas ${startLine + 1} a ${endLine + 1} (${endLine - startLine + 1} líneas)`);

// Eliminar el bloque
const before = lines.slice(0, startLine);
const after = lines.slice(endLine + 1);
const newLines = before.concat(after);

// Escribir archivo
fs.writeFileSync('server.js', newLines.join('\n'), 'utf8');

const finalLines = fs.readFileSync('server.js', 'utf8').split('\n');
console.log(`✅ Eliminación completada`);
console.log(`Líneas antes: ${lines.length}`);
console.log(`Líneas después: ${finalLines.length}`);
console.log(`Total eliminado: ${lines.length - finalLines.length} líneas`);
