const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = 'talenom-toolbox';
const ENTRY_POINT = './server.js';

console.log('🔨 Building Simple Executable (CAXA method)...');

try {
  // Step 1: Check if caxa is available
  try {
    execSync('npx caxa --version', { stdio: 'pipe' });
    console.log('✅ CAXA is available');
  } catch (error) {
    console.log('📥 Installing CAXA...');
    execSync('npm install caxa', { stdio: 'inherit' });
  }

  // Step 2: Create output directory
  const distDir = 'dist';
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
    console.log('📁 Created dist directory');
  }

  // Step 3: Build executable
  const platform = process.platform;
  const outputName = platform === 'win32' ? `${APP_NAME}.exe` : APP_NAME;
  const outputPath = path.join(distDir, outputName);

  console.log('🔨 Building executable with CAXA...');
  
  // Create optimized command with exclusions
  const excludes = [
    '--exclude', 'node_modules/.cache/**',
    '--exclude', 'node_modules/*/test/**', 
    '--exclude', 'node_modules/*/tests/**',
    '--exclude', 'node_modules/*/*.md',
    '--exclude', 'node_modules/*/README*',
    '--exclude', 'node_modules/*/CHANGELOG*',
    '--exclude', 'node_modules/*/LICENSE*',
    '--exclude', 'node_modules/*/.github/**',
    '--exclude', 'node_modules/*/docs/**',
    '--exclude', 'temp/**',
    '--exclude', 'logs/**',
    '--exclude', 'uploads/**',
    '--exclude', 'test/**',
    '--exclude', '.git/**',
    '--exclude', '*.log',
    '--exclude', '*.map',
    '--exclude', '.DS_Store'
  ];
  
  const command = `npx caxa --input . --output "${outputPath}" ${excludes.join(' ')} -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"`;
  
  console.log('🗜️  Building optimized executable...');
  execSync(command, { stdio: 'inherit' });

  // Step 4: Make executable on Unix systems
  if (platform !== 'win32') {
    fs.chmodSync(outputPath, '755');
  }

  console.log(`✅ Success! Executable created: ${outputPath}`);
  console.log(`📏 File size: ${Math.round(fs.statSync(outputPath).size / 1024 / 1024)} MB`);
  
  console.log('\n🎉 Build completed successfully!');
  console.log(`🚀 You can run the executable: ./${outputPath}`);

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}