#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('📦 Building with CAXA...');

try {
  // Install CAXA if not present
  try {
    execSync('npx caxa --version', { stdio: 'pipe' });
  } catch (error) {
    console.log('📥 Installing CAXA...');
    execSync('npm install --save-dev caxa', { stdio: 'inherit' });
  }

  const platform = process.platform;
  const outputName = platform === 'win32' ? 'talenom-toolbox.exe' : 'talenom-toolbox';

  // Build with CAXA
  console.log('🔨 Building executable...');
  const command = `npx caxa --input . --output ${outputName} -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"`;
  
  execSync(command, { stdio: 'inherit' });

  console.log(`✅ Success! Executable created: ${outputName}`);
  console.log(`📏 File size: ${Math.round(fs.statSync(outputName).size / 1024 / 1024)} MB`);

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}