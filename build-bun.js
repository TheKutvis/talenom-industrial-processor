#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🥖 Building with Bun...');

try {
  // Check if Bun is installed
  try {
    execSync('bun --version', { stdio: 'pipe' });
  } catch (error) {
    console.log('📥 Installing Bun...');
    if (process.platform === 'win32') {
      execSync('powershell -c "irm bun.sh/install.ps1 | iex"', { stdio: 'inherit' });
    } else {
      execSync('curl -fsSL https://bun.sh/install | bash', { stdio: 'inherit' });
    }
  }

  // Build executable
  const platform = process.platform;
  const outputName = platform === 'win32' ? 'talenom-toolbox.exe' : 'talenom-toolbox';
  
  console.log('📦 Compiling to executable...');
  execSync(`bun build server.js --compile --outfile ${outputName}`, { stdio: 'inherit' });

  console.log(`✅ Success! Executable created: ${outputName}`);
  console.log(`📏 File size: ${Math.round(fs.statSync(outputName).size / 1024 / 1024)} MB`);

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}