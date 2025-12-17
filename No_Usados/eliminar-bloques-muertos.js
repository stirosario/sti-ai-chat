const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Bloques a eliminar (líneas 0-indexed, pero el output muestra 1-indexed)
const blocks = [
  { start: 5373, name: 'ASK_LANGUAGE' },  // Línea 5374 (1-indexed)
  { start: 5526, name: 'ASK_NEED' },      // Línea 5527 (1-indexed)
  { start: 5684, name: 'ASK_NAME' }        // Línea 5685 (1-indexed)
];

// Encontrar cierres de cada bloque
blocks.forEach(block => {
  let braceLevel = 0;
  let foundStart = false;
  let endLine = block.start;
  
  for (let i = block.start; i < block.start + 200 && i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('if (false && false')) {
      foundStart = true;
      braceLevel = 1;
      continue;
    }
    
    if (foundStart) {
      // Contar llaves
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
  
  block.end = endLine;
  block.size = endLine - block.start + 1;
});

console.log('Bloques a eliminar:');
blocks.forEach(b => {
  console.log(`  ${b.name}: líneas ${b.start + 1} a ${b.end + 1} (${b.size} líneas)`);
});

// Eliminar en orden inverso para mantener índices correctos
blocks.sort((a, b) => b.start - a.start);

let newLines = [...lines];
blocks.forEach(block => {
  const before = newLines.slice(0, block.start);
  const after = newLines.slice(block.end + 1);
  newLines = before.concat(after);
  console.log(`✅ Eliminado bloque ${block.name}`);
});

// Escribir archivo
fs.writeFileSync('server.js', newLines.join('\n'), 'utf8');

const finalLines = fs.readFileSync('server.js', 'utf8').split('\n');
console.log(`\n✅ Eliminación completada`);
console.log(`Líneas antes: ${lines.length}`);
console.log(`Líneas después: ${finalLines.length}`);
console.log(`Total eliminado: ${lines.length - finalLines.length} líneas`);
