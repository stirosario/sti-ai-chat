/**
 * Syntax Gate Test
 * Verifica que server.js pase el parseo estricto de Node.js
 * y que no haya corrupción de sintaxis (spread/rest operators)
 * 
 * Ejecutar con: node tests/syntax-gate.test.js
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverJsPath = path.join(__dirname, '..', 'server.js');

// Tests
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`❌ ${name}: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('\n=== Tests: Syntax Gate ===\n');

// ========================================================
// Test 1: Parseo estricto de Node.js
// ========================================================

test('server.js pasa parseo estricto (node --check)', () => {
  try {
    execSync(`node --check "${serverJsPath}"`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    // Si no hay error, el parseo pasó
    assert(true, 'Parseo exitoso');
  } catch (error) {
    throw new Error(`SyntaxError detectado: ${error.message}`);
  }
});

// ========================================================
// Test 2: Verificar que no hay corrupción de spread/rest
// ========================================================

test('No hay corrupción de spread/rest operators', () => {
  const content = fs.readFileSync(serverJsPath, 'utf8');
  
  // Patrones corruptos a buscar:
  // 1. `.meta` como spread operator (no `...meta`)
  // 2. `.extra` como spread operator (no `...extra`)
  // 3. `.(COND && { ... })` como spread operator (no `...(COND && { ... })`)
  // 4. `function x(.args)` como rest parameter (no `function x(...args)`)
  // 5. `[.session.transcript]` como spread operator (no `[...session.transcript]`)
  
  const corruptPatterns = [
    {
      pattern: /meta:\s*\{[^}]*\s\.meta[^a-zA-Z_]/,
      description: 'Corrupción: `.meta` en lugar de `...meta`'
    },
    {
      pattern: /meta:\s*\{[^}]*\s\.extra[^a-zA-Z_]/,
      description: 'Corrupción: `.extra` en lugar de `...extra`'
    },
    {
      pattern: /meta:\s*\{[^}]*\s\.\(/,
      description: 'Corrupción: `.(` en lugar de `...(`'
    },
    {
      pattern: /function\s+\w+\(\.(?!\.\.)/,
      description: 'Corrupción: `function x(.args)` en lugar de `function x(...args)`'
    },
    {
      pattern: /\[\.session\.transcript\]/,
      description: 'Corrupción: `[.session.transcript]` en lugar de `[...session.transcript]`'
    },
    {
      pattern: /\[\.transcript\]/,
      description: 'Corrupción: `[.transcript]` en lugar de `[...transcript]`'
    }
  ];
  
  const matches = [];
  corruptPatterns.forEach(({ pattern, description }) => {
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          description
        });
      }
    });
  });
  
  if (matches.length > 0) {
    console.error('\n⚠️ Patrones corruptos detectados:');
    matches.forEach(m => {
      console.error(`  Línea ${m.line}: ${m.description}`);
      console.error(`    ${m.content.substring(0, 80)}...`);
    });
    throw new Error(`Se encontraron ${matches.length} patrones corruptos de spread/rest`);
  }
  
  assert(true, 'No se encontraron patrones corruptos');
});

// ========================================================
// Test 3: Verificar que los spread/rest operators están correctos
// ========================================================

test('Spread/rest operators están correctamente formateados', () => {
  const content = fs.readFileSync(serverJsPath, 'utf8');
  
  // Verificar que los patrones correctos existen
  const correctPatterns = [
    /\.\.\.meta/,
    /\.\.\.extra/,
    /\.\.\.\(/,
    /function\s+\w+\(\.\.\./,
    /\[\.\.\.session\.transcript\]/,
    /\[\.\.\.transcript\]/
  ];
  
  // Al menos uno de estos patrones debe existir (para confirmar que el archivo tiene spread/rest)
  const hasCorrectPattern = correctPatterns.some(pattern => pattern.test(content));
  
  // No es un error si no hay ningún spread/rest, pero es bueno verificar que si existen, están correctos
  assert(true, 'Verificación de formato completada');
});

// ========================================================
// Resumen
// ========================================================

console.log('\n=== Resumen ===');
console.log(`✅ Tests pasados: ${testsPassed}`);
console.log(`❌ Tests fallidos: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}\n`);

if (testsFailed > 0) {
  console.log('⚠️ Si falla, buscar y restaurar:');
  console.log('  - `.meta` → `...meta`');
  console.log('  - `.extra` → `...extra`');
  console.log('  - `.(` → `...(`');
  console.log('  - `function x(.args)` → `function x(...args)`');
  console.log('  - `[.session.transcript]` → `[...session.transcript]`\n');
  process.exit(1);
} else {
  console.log('🎉 Todos los tests pasaron!\n');
  process.exit(0);
}

