const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Encontrar el código suelto que empieza en línea 5476 (0-indexed: 5475)
let startLine = 5475;
let endLine = -1;

// Buscar desde la línea 5476 hasta encontrar un cierre de bloque o código válido
for (let i = startLine; i < startLine + 110 && i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Si encontramos código que no es comentario y no está dentro de un bloque válido
  if (line && !line.startsWith('//') && !line.startsWith('*')) {
    // Si encontramos un cierre de bloque } que probablemente cierra el código suelto
    if (line === '}' && i > startLine + 50) {
      // Verificar que la siguiente línea no es parte del código suelto
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // Si la siguiente línea es un comentario sobre "Inline fallback" o código válido, este es el cierre
        if (nextLine.includes('Inline fallback') || nextLine.startsWith('//') || nextLine === '{' || nextLine.startsWith('const') || nextLine.startsWith('let')) {
          endLine = i;
          break;
        }
      }
    }
  }
}

if (endLine === -1) {
  // Buscar de otra manera: encontrar el primer } seguido de un comentario sobre "Inline fallback"
  for (let i = startLine; i < startLine + 110 && i < lines.length; i++) {
    if (lines[i].trim() === '}') {
      if (i + 1 < lines.length && lines[i + 1].includes('Inline fallback')) {
        endLine = i;
        break;
      }
    }
  }
}

if (endLine === -1) {
  console.error('❌ No se encontró el cierre del código suelto');
  console.log('Primeras líneas del código suelto:');
  for (let i = startLine; i < startLine + 5 && i < lines.length; i++) {
    console.log(`  ${i + 1}: ${lines[i].substring(0, 80)}`);
  }
  process.exit(1);
}

console.log(`Eliminando código suelto: líneas ${startLine + 1} a ${endLine + 1} (${endLine - startLine + 1} líneas)`);

// Eliminar el código suelto
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
