const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = 'talenom-toolbox';
const DIST_DIR = 'dist';
const TEMP_DIR = 'build-temp';

console.log('📦 Building Minimal Executable...');

async function buildMinimal() {
  try {
    // Step 1: Create temporary build directory with only essential files
    console.log('📁 Creating minimal build directory...');
    
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true });
    }
    fs.mkdirSync(TEMP_DIR);

    // Copy essential files
    const essentialFiles = [
      'server.js',
      'package.json',
      'public/',
      'services/',
      'utils/',
      'config/',
      'locales/',
      'general-ledger-fi.json'
    ];

    console.log('📋 Copying essential files...');
    for (const file of essentialFiles) {
      const srcPath = path.join('.', file);
      const destPath = path.join(TEMP_DIR, file);
      
      if (fs.existsSync(srcPath)) {
        if (fs.lstatSync(srcPath).isDirectory()) {
          execSync(`cp -r "${srcPath}" "${destPath}"`, { stdio: 'pipe' });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
        console.log(`✅ Copied: ${file}`);
      }
    }

    // Create minimal package.json
    const originalPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const minimalPkg = {
      name: originalPkg.name,
      version: originalPkg.version,
      main: 'server.js',
      dependencies: {
        // Only include production dependencies that are actually used
        'axios': originalPkg.dependencies.axios,
        'cors': originalPkg.dependencies.cors,
        'express': originalPkg.dependencies.express,
        'helmet': originalPkg.dependencies.helmet,
        'multer': originalPkg.dependencies.multer,
        'winston': originalPkg.dependencies.winston,
        'csv-parser': originalPkg.dependencies['csv-parser'],
        'exceljs': originalPkg.dependencies.exceljs,
        'dotenv': originalPkg.dependencies.dotenv,
        'xlsx': originalPkg.dependencies.xlsx
      }
    };

    fs.writeFileSync(path.join(TEMP_DIR, 'package.json'), JSON.stringify(minimalPkg, null, 2));

    // Step 2: Install only production dependencies
    console.log('📦 Installing minimal dependencies...');
    execSync('npm install --production', { cwd: TEMP_DIR, stdio: 'inherit' });

    // Step 3: Build with CAXA from temp directory
    console.log('🔨 Building from minimal directory...');
    
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR);
    }

    const platform = process.platform;
    const outputName = platform === 'win32' ? `${APP_NAME}-minimal.exe` : `${APP_NAME}-minimal`;
    const outputPath = path.join('..', DIST_DIR, outputName);

    const command = `npx caxa --input . --output "${outputPath}" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"`;
    
    execSync(command, { cwd: TEMP_DIR, stdio: 'inherit' });

    // Step 4: Make executable and show results
    const finalPath = path.join(DIST_DIR, outputName);
    if (platform !== 'win32') {
      fs.chmodSync(finalPath, '755');
    }

    const size = fs.statSync(finalPath).size;
    console.log(`✅ Minimal executable created: ${finalPath}`);
    console.log(`📏 Size: ${Math.round(size / 1024 / 1024)} MB`);

    // Cleanup
    console.log('🧹 Cleaning up temporary files...');
    fs.rmSync(TEMP_DIR, { recursive: true });

    console.log('🎉 Minimal build completed!');

  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true });
    }
    console.error('❌ Minimal build failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  buildMinimal();
}

module.exports = { buildMinimal };