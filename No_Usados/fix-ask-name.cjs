/**
 * Script para eliminar referencias al botón BTN_NO_NAME en ASK_NAME
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('🔍 Buscando y eliminando referencias a BTN_NO_NAME...\n');

// Reemplazo 1: looksClearlyNotName con botón
const pattern1 = /return res\.json\(withOptions\(\{\s*ok: true,\s*reply,\s*stage: session\.stage,\s*options: \[\s*\{ token: 'BTN_NO_NAME', label: isEn \? "I'd rather not say" : "Prefiero no decirlo" \}\s*\]\s*\}\)\);/g;
const replacement1 = `return res.json({
          ok: true,
          reply,
          stage: session.stage
          // ✅ BOTÓN ELIMINADO
        });`;

if (pattern1.test(content)) {
  content = content.replace(pattern1, replacement1);
  console.log('✅ Eliminado botón BTN_NO_NAME de validación looksClearlyNotName');
}

// Reemplazo 2: Eliminar bloque completo de nombre aceptado (código duplicado)
const pattern2 = /const candidate = extractName\(t\);\s*if \(!candidate \|\| !isValidName\(candidate\)\) \{[\s\S]*?return res\.json\(withOptions\(\{[\s\S]*?options: \[\s*\{ token: 'BTN_NO_NAME'[\s\S]*?\}\)\);\s*\}\s*\/\/ Nombre aceptado - transición a ASK_NEED según Flujo\.csv[\s\S]*?return res\.json\(\{[\s\S]*?buttons: \[[\s\S]*?\{ text: isEn \? '💡 IT Consultation[\s\S]*?\]\s*\}\);/;

if (pattern2.test(content)) {
  content = content.replace(pattern2, `// ✅ NO ES UN NOMBRE VÁLIDO - Mostrar mensaje de error
      // Este bloque ya no debería ejecutarse porque la detección se hace al inicio
      console.log('[ASK_NAME] ⚠️ Fallback: código legacy alcanzado - revisar lógica');
      
      session.nameAttempts = (session.nameAttempts || 0) + 1;
      
      const fallbackReply = isEn
        ? "I didn't detect a valid name. Please tell me only your name, for example: "Ana" or "John Paul"."
        : (locale === 'es-419'
          ? "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: "Ana" o "Juan Pablo"."
          : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: "Ana" o "Juan Pablo".");

      session.transcript.push({ who: 'bot', text: fallbackReply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json({
        ok: true,
        reply: fallbackReply,
        stage: session.stage
        // ✅ BOTÓN ELIMINADO
      });`);
  console.log('✅ Eliminado bloque duplicado de validación de nombre');
}

// Guardar cambios
fs.writeFileSync(serverPath, content, 'utf8');

console.log('\n✅ Script completado - server.js actualizado');
console.log('\n🔍 Ahora ejecutando búsqueda de referencias restantes...\n');

// Buscar referencias restantes
const lines = content.split('\n');
const references = [];

lines.forEach((line, index) => {
  if (
    line.includes('BTN_NO_NAME') ||
    line.includes('prefiero_no_decirlo') ||
    line.includes('prefer_not_to_say') ||
    (line.includes('Prefiero no decirlo') && !line.includes('CÓDIGO ELIMINADO') && !line.includes('Ya no'))
  ) {
    references.push({ line: index + 1, content: line.trim() });
  }
});

if (references.length > 0) {
  console.log(`⚠️  Se encontraron ${references.length} referencias restantes:\n`);
  references.forEach(ref => {
    console.log(`   Línea ${ref.line}: ${ref.content.substring(0, 100)}...`);
  });
} else {
  console.log('✅ No se encontraron referencias restantes a BTN_NO_NAME o prefiero_no_decirlo');
}
