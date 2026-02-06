#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🥖 Building with Bun (Smallest Size)...');

try {
  // Create dist directory
  const distDir = 'dist';
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  // Check if Bun is installed
  try {
    execSync('bun --version', { stdio: 'pipe' });
    console.log('✅ Bun is available');
  } catch (error) {
    console.log('📥 Installing Bun...');
    if (process.platform === 'win32') {
      execSync('powershell -c "irm bun.sh/install.ps1 | iex"', { stdio: 'inherit' });
    } else {
      execSync('curl -fsSL https://bun.sh/install | bash', { stdio: 'inherit' });
      // Add bun to PATH for this session
      process.env.PATH = `${process.env.HOME}/.bun/bin:${process.env.PATH}`;
    }
  }

  // Build executable
  const platform = process.platform;
  const outputName = platform === 'win32' ? 'talenom-toolbox-bun.exe' : 'talenom-toolbox-bun';
  const outputPath = `${distDir}/${outputName}`;
  
  console.log('📦 Compiling to executable with Bun...');
  console.log('🗜️  This creates the smallest possible executable...');
  
  // Use bun build with optimization
  const buildCommand = `bun build server.js --compile --minify --target bun --outfile ${outputPath}`;
  execSync(buildCommand, { stdio: 'inherit' });

  const size = fs.statSync(outputPath).size;
  console.log(`✅ Success! Bun executable created: ${outputPath}`);
  console.log(`📏 File size: ${Math.round(size / 1024 / 1024)} MB (Smallest option!)`);

  // Make executable on Unix systems
  if (platform !== 'win32') {
    fs.chmodSync(outputPath, '755');
  }

  console.log('🎉 Bun build completed - This should be your smallest executable!');

} catch (error) {
  console.error('❌ Bun build failed:', error.message);
  console.log('💡 Tip: Make sure Bun is properly installed and try again');
  process.exit(1);
}