#!/usr/bin/env node
/**
 * start-modular.js
 * 
 * Inicia el servidor con arquitectura modular activada
 * 
 * USO:
 * node start-modular.js
 * 
 * O con npm:
 * npm run start:modular
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🏗️  Iniciando servidor con ARQUITECTURA MODULAR...\n');

// Configurar variables de entorno
const env = {
  ...process.env,
  USE_MODULAR_ARCHITECTURE: 'true',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Iniciar servidor
const serverPath = join(__dirname, 'server.js');
const serverProcess = spawn('node', [serverPath], {
  env,
  stdio: 'inherit',
  shell: true
});

serverProcess.on('error', (error) => {
  console.error('❌ Error al iniciar servidor:', error);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Servidor terminó con código ${code}`);
  }
  process.exit(code);
});

// Manejar señales de terminación
process.on('SIGINT', () => {
  console.log('\n⚠️  Deteniendo servidor...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Deteniendo servidor...');
  serverProcess.kill('SIGTERM');
});
