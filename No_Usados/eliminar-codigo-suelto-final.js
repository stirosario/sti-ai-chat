const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Encontrar el bloque que empieza en línea 5479 (0-indexed: 5478)
const startLine = 5478; // Línea 5479 en 1-indexed
let endLine = -1;
let braceLevel = 0;
let foundStart = false;

// Buscar desde la línea de inicio
for (let i = startLine; i < startLine + 100 && i < lines.length; i++) {
  const line = lines[i];
  
  // Encontrar el inicio del bloque (línea con solo '{')
  if (line.trim() === '{' && !foundStart) {
    foundStart = true;
    braceLevel = 1;
    continue;
  }
  
  // Si encontramos el inicio, contar llaves
  if (foundStart) {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    braceLevel += openBraces - closeBraces;
    
    // Si llegamos a nivel 0, encontramos el cierre
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

console.log(`Eliminando código suelto: líneas ${startLine + 1} a ${endLine + 1} (${endLine - startLine + 1} líneas)`);
console.log(`Línea antes: ${lines[startLine - 1].substring(0, 80)}`);
console.log(`Línea después: ${lines[endLine + 1].substring(0, 80)}`);

// Eliminar el bloque
const before = lines.slice(0, startLine);
const after = lines.slice(endLine + 1);
const newLines = before.concat(after);

// Escribir archivo
fs.writeFileSync('server.js', newLines.join('\n'), 'utf8');

const final = fs.readFileSync('server.js', 'utf8').split('\n');
console.log(`✅ Eliminado. Total: ${lines.length} -> ${final.length} (${lines.length - final.length} líneas eliminadas)`);
