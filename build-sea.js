const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = 'talenom-toolbox';
const ENTRY_POINT = './server.js';

console.log('🔨 Building Single Executable Application...');

// Step 1: Create the SEA configuration
const seaConfig = {
  main: ENTRY_POINT,
  output: `${APP_NAME}-sea-prep.blob`,
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
  useSnapshot: false
};

console.log('📝 Writing SEA configuration...');
fs.writeFileSync('sea-config.json', JSON.stringify(seaConfig, null, 2));

try {
  // Step 2: Generate the blob
  console.log('🗜️  Generating application blob...');
  execSync(`node --experimental-sea-config sea-config.json`, { stdio: 'inherit' });

  // Step 3: Create executable from Node.js binary
  console.log('📦 Creating executable...');
  
  const platform = process.platform;
  let nodeExecutable, outputExecutable;
  
  if (platform === 'win32') {
    nodeExecutable = process.execPath;
    outputExecutable = `${APP_NAME}.exe`;
  } else if (platform === 'darwin') {
    nodeExecutable = process.execPath;
    outputExecutable = APP_NAME;
  } else if (platform === 'linux') {
    nodeExecutable = process.execPath;
    outputExecutable = APP_NAME;
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Copy Node.js executable
  fs.copyFileSync(nodeExecutable, outputExecutable);
  
  // Ensure the copied executable is writable (critical for macOS)
  fs.chmodSync(outputExecutable, '755');
  
  // Verify the file is writable
  try {
    fs.accessSync(outputExecutable, fs.constants.W_OK);
    console.log('✅ Executable is writable');
  } catch (error) {
    throw new Error(`Copied executable is not writable: ${error.message}`);
  }

  // Step 4: Inject the application
  console.log('💉 Injecting application into executable...');
  
  // Ensure postject is available
  try {
    execSync('npx postject --version', { stdio: 'pipe' });
    console.log('✅ postject is available');
  } catch (error) {
    console.log('📥 Installing postject...');
    execSync('npm install --save-dev postject', { stdio: 'inherit' });
  }
  
  // Build the postject command based on platform
  let postjectCommand;
  if (platform === 'win32') {
    postjectCommand = `npx postject ${outputExecutable} NODE_SEA_BLOB ${seaConfig.output} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
  } else {
    postjectCommand = `npx postject ${outputExecutable} NODE_SEA_BLOB ${seaConfig.output} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`;
  }
  
  console.log(`🔧 Running: ${postjectCommand}`);
  
  try {
    execSync(postjectCommand, { stdio: 'inherit' });
    console.log('✅ Injection successful');
  } catch (error) {
    // Try alternative approach for macOS
    if (platform === 'darwin') {
      console.log('⚠️  Standard injection failed, trying alternative approach...');
      
      // Remove the existing file and try a different approach
      if (fs.existsSync(outputExecutable)) {
        fs.unlinkSync(outputExecutable);
      }
      
      // Create a temporary script to handle the injection
      const tempScript = `#!/bin/bash
set -e
cp "${nodeExecutable}" "${outputExecutable}"
chmod 755 "${outputExecutable}"
npx postject "${outputExecutable}" NODE_SEA_BLOB "${seaConfig.output}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
`;
      fs.writeFileSync('temp-inject.sh', tempScript);
      fs.chmodSync('temp-inject.sh', '755');
      
      try {
        execSync('./temp-inject.sh', { stdio: 'inherit' });
        fs.unlinkSync('temp-inject.sh');
        console.log('✅ Alternative injection successful');
      } catch (altError) {
        if (fs.existsSync('temp-inject.sh')) fs.unlinkSync('temp-inject.sh');
        throw new Error(`Both injection methods failed: ${error.message}, ${altError.message}`);
      }
    } else {
      throw error;
    }
  }

  // Cleanup
  fs.unlinkSync('sea-config.json');
  fs.unlinkSync(seaConfig.output);

  console.log(`✅ Success! Executable created: ${outputExecutable}`);
  console.log(`📏 File size: ${Math.round(fs.statSync(outputExecutable).size / 1024 / 1024)} MB`);

} catch (error) {
  console.error('❌ Build failed:', error.message);
  
  // Cleanup on error
  try {
    if (fs.existsSync('sea-config.json')) fs.unlinkSync('sea-config.json');
    if (fs.existsSync(seaConfig.output)) fs.unlinkSync(seaConfig.output);
  } catch (cleanupError) {
    // Ignore cleanup errors
  }
  
  process.exit(1);
}