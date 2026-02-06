const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = 'talenom-toolbox';
const DIST_DIR = 'dist';

console.log('🗜️  Building Ultra-Compressed Executable...');

async function buildCompressed() {
  try {
    // Step 1: Build with CAXA (optimized)
    console.log('📦 Building base executable...');
    execSync('node build-simple.js', { stdio: 'inherit' });

    const platform = process.platform;
    const baseFile = path.join(DIST_DIR, platform === 'win32' ? `${APP_NAME}.exe` : APP_NAME);
    
    if (!fs.existsSync(baseFile)) {
      throw new Error('Base executable not found');
    }

    const originalSize = fs.statSync(baseFile).size;
    console.log(`📏 Original size: ${Math.round(originalSize / 1024 / 1024)} MB`);

    // Step 2: Install UPX if not available
    console.log('🔧 Checking for UPX compressor...');
    try {
      execSync('upx --version', { stdio: 'pipe' });
      console.log('✅ UPX is available');
    } catch (error) {
      console.log('📥 Installing UPX...');
      if (platform === 'darwin') {
        try {
          execSync('brew install upx', { stdio: 'inherit' });
        } catch (brewError) {
          console.log('⚠️  Please install UPX manually: brew install upx');
          throw new Error('UPX installation failed');
        }
      } else if (platform === 'linux') {
        try {
          execSync('sudo apt-get install upx-ucl', { stdio: 'inherit' });
        } catch (aptError) {
          console.log('⚠️  Please install UPX manually: sudo apt-get install upx-ucl');
          throw new Error('UPX installation failed');
        }
      } else {
        console.log('⚠️  Please download UPX from https://upx.github.io/');
        throw new Error('UPX not available for Windows via this script');
      }
    }

    // Step 3: Compress with UPX
    console.log('🗜️  Compressing executable with UPX...');
    const compressedFile = path.join(DIST_DIR, `${APP_NAME}-compressed${platform === 'win32' ? '.exe' : ''}`);
    
    // Copy original file
    fs.copyFileSync(baseFile, compressedFile);
    
    // Compress with UPX (aggressive compression)
    try {
      execSync(`upx --ultra-brute "${compressedFile}"`, { stdio: 'inherit' });
    } catch (upxError) {
      // Try less aggressive compression if ultra-brute fails
      console.log('⚠️  Ultra compression failed, trying standard compression...');
      execSync(`upx --best "${compressedFile}"`, { stdio: 'inherit' });
    }

    const compressedSize = fs.statSync(compressedFile).size;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(`✅ Compression completed!`);
    console.log(`📏 Original size: ${Math.round(originalSize / 1024 / 1024)} MB`);
    console.log(`📏 Compressed size: ${Math.round(compressedSize / 1024 / 1024)} MB`);
    console.log(`🎯 Compression ratio: ${compressionRatio}%`);
    console.log(`🚀 Compressed executable: ${compressedFile}`);

  } catch (error) {
    console.error('❌ Compression failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  buildCompressed();
}

module.exports = { buildCompressed };