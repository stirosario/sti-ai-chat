/**
 * Script de prueba: 200 IDs únicos
 * Verifica que reserveUniqueConversationId genera IDs únicos sin colisiones
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_BASE = path.join(__dirname, '..', 'data');
const IDS_DIR = path.join(DATA_BASE, 'ids');
const USED_IDS_FILE = path.join(IDS_DIR, 'used_ids.json');
const USED_IDS_LOCK = path.join(IDS_DIR, 'used_ids.lock');

// Importar función de reserva (necesitamos copiar la lógica o importarla)
// Como no podemos importar fácilmente, vamos a copiar la función aquí para el test

async function reserveUniqueConversationId() {
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      // 1. Adquirir lock
      let lockHandle;
      try {
        lockHandle = await fs.open(USED_IDS_LOCK, 'wx');
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Lock existe, esperar un poco y reintentar
          await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
          attempts++;
          continue;
        }
        throw err;
      }
      
      try {
        // 2. Leer used_ids.json
        let usedIds = new Set();
        try {
          const content = await fs.readFile(USED_IDS_FILE, 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            usedIds = new Set(parsed);
          } else if (parsed.ids && Array.isArray(parsed.ids)) {
            usedIds = new Set(parsed.ids);
          }
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
          // Archivo no existe, empezar vacío
        }
        
        // 3. Generar ID
        let newId;
        let idAttempts = 0;
        do {
          const letter1 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
          const letter2 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
          const digits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          newId = letter1 + letter2 + digits;
          idAttempts++;
        } while (usedIds.has(newId) && idAttempts < 100);
        
        if (idAttempts >= 100) {
          throw new Error('No se pudo generar ID único después de 100 intentos');
        }
        
        // 4. Agregar y escribir (write temp + rename para atomicidad)
        usedIds.add(newId);
        const tempIdsFile = USED_IDS_FILE + '.tmp';
        await fs.writeFile(tempIdsFile, JSON.stringify(Array.from(usedIds), null, 2), 'utf-8');
        await fs.rename(tempIdsFile, USED_IDS_FILE);
        
        // 5. Liberar lock
        await lockHandle.close();
        await fs.unlink(USED_IDS_LOCK).catch(() => {}); // Ignorar si no existe
        
        return newId;
        
      } catch (err) {
        await lockHandle.close().catch(() => {});
        throw err;
      }
      
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`No se pudo generar ID único: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  throw new Error('No se pudo generar ID único después de 50 intentos');
}

async function test200UniqueIds() {
  console.log('🧪 Iniciando prueba de 200 IDs únicos...\n');
  
  const NUM_IDS = 200;
  const NUM_RUNS = 5;
  const results = [];
  
  // Backup del archivo usado_ids.json si existe
  let backupPath = null;
  try {
    if (await fs.access(USED_IDS_FILE).then(() => true).catch(() => false)) {
      backupPath = USED_IDS_FILE + '.backup.' + Date.now();
      await fs.copyFile(USED_IDS_FILE, backupPath);
      console.log(`📦 Backup creado: ${backupPath}`);
    }
  } catch (err) {
    console.warn('⚠️  No se pudo crear backup:', err.message);
  }
  
  // Asegurar que el directorio existe
  await fs.mkdir(IDS_DIR, { recursive: true });
  
  for (let run = 1; run <= NUM_RUNS; run++) {
    console.log(`\n📊 Ejecución ${run}/${NUM_RUNS}:`);
    
    // Limpiar used_ids.json para cada ejecución (empezar desde cero)
    try {
      await fs.writeFile(USED_IDS_FILE, JSON.stringify([], null, 2), 'utf-8');
    } catch (err) {
      // Ignorar si no existe
    }
    
    const generatedIds = new Set();
    const startTime = Date.now();
    let errors = 0;
    
    for (let i = 0; i < NUM_IDS; i++) {
      try {
        const id = await reserveUniqueConversationId();
        
        if (generatedIds.has(id)) {
          console.error(`❌ COLISIÓN DETECTADA en iteración ${i + 1}: ${id}`);
          errors++;
        } else {
          generatedIds.add(id);
        }
        
        if ((i + 1) % 50 === 0) {
          process.stdout.write(`  Generados: ${i + 1}/${NUM_IDS}...\r`);
        }
      } catch (err) {
        console.error(`❌ Error generando ID ${i + 1}:`, err.message);
        errors++;
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const uniqueCount = generatedIds.size;
    const collisionCount = NUM_IDS - uniqueCount;
    
    const result = {
      run,
      total: NUM_IDS,
      unique: uniqueCount,
      collisions: collisionCount,
      errors,
      duration_ms: duration,
      success: uniqueCount === NUM_IDS && errors === 0
    };
    
    results.push(result);
    
    console.log(`\n  ✅ Únicos: ${uniqueCount}/${NUM_IDS}`);
    console.log(`  ⏱️  Duración: ${duration}ms (${(duration / NUM_IDS).toFixed(2)}ms por ID)`);
    if (collisionCount > 0) {
      console.log(`  ❌ Colisiones: ${collisionCount}`);
    }
    if (errors > 0) {
      console.log(`  ❌ Errores: ${errors}`);
    }
    console.log(`  ${result.success ? '✅' : '❌'} Resultado: ${result.success ? 'PASS' : 'FAIL'}`);
  }
  
  // Restaurar backup si existe
  if (backupPath) {
    try {
      await fs.copyFile(backupPath, USED_IDS_FILE);
      await fs.unlink(backupPath).catch(() => {});
      console.log(`\n📦 Backup restaurado`);
    } catch (err) {
      console.warn('⚠️  No se pudo restaurar backup:', err.message);
    }
  }
  
  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL:');
  console.log('='.repeat(60));
  
  const allPassed = results.every(r => r.success);
  const totalCollisions = results.reduce((sum, r) => sum + r.collisions, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  const avgDuration = results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length;
  
  results.forEach(r => {
    console.log(`  Ejecución ${r.run}: ${r.unique}/${r.total} únicos, ${r.duration_ms}ms - ${r.success ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  console.log(`\n  Total colisiones: ${totalCollisions}`);
  console.log(`  Total errores: ${totalErrors}`);
  console.log(`  Duración promedio: ${avgDuration.toFixed(2)}ms`);
  console.log(`\n  ${allPassed ? '✅' : '❌'} RESULTADO FINAL: ${allPassed ? 'PASS (0 colisiones)' : 'FAIL (colisiones detectadas)'}`);
  
  process.exit(allPassed ? 0 : 1);
}

// Ejecutar prueba
test200UniqueIds().catch(err => {
  console.error('❌ Error fatal en prueba:', err);
  process.exit(1);
});

