#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('🚀 Improved SEA Builder for macOS/Linux');

const APP_NAME = 'talenom-toolbox';
const DIST_DIR = 'dist';

async function buildSEA() {
  try {
    // Ensure dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR);
    }

    // Step 1: Create SEA configuration
    console.log('📝 Creating SEA configuration...');
    const seaConfig = {
      main: './server.js',
      output: 'app.blob',
      disableExperimentalSEAWarning: true,
      useCodeCache: true
    };

    fs.writeFileSync('sea-config.json', JSON.stringify(seaConfig, null, 2));

    // Step 2: Generate the blob
    console.log('🗜️  Generating application blob...');
    execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });

    if (!fs.existsSync('app.blob')) {
      throw new Error('Failed to generate app.blob');
    }

    // Step 3: Find or download a suitable Node.js binary
    console.log('📦 Preparing Node.js binary...');
    
    let nodeBinary;
    const platform = process.platform;
    const arch = process.arch;
    
    if (platform === 'darwin' || platform === 'linux') {
      // For macOS/Linux, we need to use a writable copy of Node.js
      const nodeVersion = process.version;
      const downloadUrl = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-${platform}-${arch}.tar.gz`;
      
      console.log('⬇️  Downloading fresh Node.js binary...');
      
      // Download and extract Node.js
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-'));
      const tarFile = path.join(tmpDir, 'node.tar.gz');
      
      try {
        execSync(`curl -L "${downloadUrl}" -o "${tarFile}"`, { stdio: 'inherit' });
        execSync(`tar -xzf "${tarFile}" -C "${tmpDir}"`, { stdio: 'inherit' });
        
        const extractedDir = fs.readdirSync(tmpDir).find(name => name.startsWith('node-'));
        nodeBinary = path.join(tmpDir, extractedDir, 'bin', 'node');
        
        if (!fs.existsSync(nodeBinary)) {
          throw new Error('Could not find Node.js binary in downloaded package');
        }
        
        console.log('✅ Fresh Node.js binary ready');
      } catch (downloadError) {
        console.log('⚠️  Download failed, using local Node.js binary with workaround');
        nodeBinary = process.execPath;
      }
    } else {
      nodeBinary = process.execPath;
    }

    // Step 4: Create the executable
    const outputFile = path.join(DIST_DIR, platform === 'win32' ? `${APP_NAME}-sea.exe` : `${APP_NAME}-sea`);
    
    console.log('🔨 Creating executable...');
    fs.copyFileSync(nodeBinary, outputFile);
    fs.chmodSync(outputFile, 0o755);

    // Step 5: Install and use postject
    console.log('💉 Installing and running postject...');
    
    try {
      execSync('npm list postject', { stdio: 'pipe' });
    } catch {
      execSync('npm install postject', { stdio: 'inherit' });
    }

    // Build postject command
    let postjectCmd;
    if (platform === 'win32') {
      postjectCmd = `npx postject "${outputFile}" NODE_SEA_BLOB app.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
    } else {
      postjectCmd = `npx postject "${outputFile}" NODE_SEA_BLOB app.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`;
    }

    console.log('🔧 Injecting application...');
    execSync(postjectCmd, { stdio: 'inherit' });

    // Cleanup
    fs.unlinkSync('sea-config.json');
    fs.unlinkSync('app.blob');

    const stats = fs.statSync(outputFile);
    console.log(`✅ SEA executable created: ${outputFile}`);
    console.log(`📏 Size: ${Math.round(stats.size / 1024 / 1024)} MB`);

    return outputFile;

  } catch (error) {
    // Cleanup on error
    ['sea-config.json', 'app.blob'].forEach(file => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch {}
      }
    });
    
    throw error;
  }
}

if (require.main === module) {
  buildSEA()
    .then(output => {
      console.log('🎉 Build completed successfully!');
      console.log(`🚀 Run with: ${output}`);
    })
    .catch(error => {
      console.error('❌ Build failed:', error.message);
      process.exit(1);
    });
}

module.exports = { buildSEA };