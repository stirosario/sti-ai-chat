const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');
const lines = content.split('\n');

console.log('🔍 Eliminando código duplicado en ASK_NAME...\n');

// Buscar la línea donde empieza el bloque duplicado
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  // Buscar segunda declaración de candidate (la duplicada)
  if (i > 5750 && i < 5800 && lines[i].includes('const candidate = extractName(t);')) {
    startIdx = i;
    console.log(`✅ Encontrado inicio del código duplicado en línea ${i + 1}`);
    break;
  }
}

if (startIdx > 0) {
  // Buscar el cierre del bloque ASK_NAME
  for (let i = startIdx; i < lines.length && i < startIdx + 100; i++) {
    if (lines[i].trim() === '}' && lines[i+1] && lines[i+2] && lines[i+2].includes('// Inline fallback')) {
      endIdx = i;
      console.log(`✅ Encontrado fin del bloque duplicado en línea ${i + 1}`);
      break;
    }
  }
  
  if (endIdx > startIdx) {
    // Reemplazar todo el bloque duplicado con el fallback simple
    const replacement = [
      '',
      '      // ✅ NO ES UN NOMBRE VÁLIDO - Este punto no debería alcanzarse',
      '      // Fallback final por seguridad',
      '      console.log(\'[ASK_NAME] ⚠️ Fallback final alcanzado - código legacy duplicado\');',
      '      session.nameAttempts = (session.nameAttempts || 0) + 1;',
      '',
      '      const fallbackReply = isEn',
      '        ? "I didn\'t detect a valid name. Please tell me only your name, for example: "Ana" or "John Paul"."',
      '        : (locale === \'es-419\'',
      '          ? "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: "Ana" o "Juan Pablo"."',
      '          : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: "Ana" o "Juan Pablo".");',
      '',
      '      session.transcript.push({ who: \'bot\', text: fallbackReply, ts: nowIso() });',
      '      await saveSessionAndTranscript(sid, session);',
      '      return res.json({',
      '        ok: true,',
      '        reply: fallbackReply,',
      '        stage: session.stage',
      '        // ✅ BOTÓN ELIMINADO',
      '      });',
      '    }'
    ];
    
    lines.splice(startIdx, endIdx - startIdx + 1, ...replacement);
    
    content = lines.join('\n');
    fs.writeFileSync(serverPath, content, 'utf8');
    
    console.log(`\n✅ Eliminadas ${endIdx - startIdx + 1} líneas duplicadas`);
    console.log(`✅ Agregadas ${replacement.length} líneas de fallback simple\n`);
  }
}

console.log('✅ Corrección completada\n');
