#!/usr/bin/env node

/**
 * Script para iniciar ambos servicios: CAP y MCP
 *
 * Uso:
 *   node start-all.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Iniciando servicios MCP + CAP...\n');

// Iniciar servidor CAP
console.log('📦 Iniciando servidor CAP en puerto 4004...');
const capProcess = spawn('npm', ['run', 'cap:start'], {
  cwd: __dirname,
  shell: true,
  stdio: 'inherit'
});

// Esperar 3 segundos antes de iniciar MCP
setTimeout(() => {
  console.log('\n📡 Iniciando servidor MCP en puerto 3001...');
  const mcpProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    shell: true,
    stdio: 'inherit'
  });

  mcpProcess.on('error', (error) => {
    console.error('❌ Error iniciando servidor MCP:', error);
    capProcess.kill();
    process.exit(1);
  });

  mcpProcess.on('exit', (code) => {
    console.log(`\n🛑 Servidor MCP terminado con código ${code}`);
    capProcess.kill();
    process.exit(code || 0);
  });
}, 3000);

capProcess.on('error', (error) => {
  console.error('❌ Error iniciando servidor CAP:', error);
  process.exit(1);
});

capProcess.on('exit', (code) => {
  console.log(`\n🛑 Servidor CAP terminado con código ${code}`);
  process.exit(code || 0);
});

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n🛑 Apagando servicios...');
  capProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Apagando servicios...');
  capProcess.kill('SIGTERM');
  process.exit(0);
});
