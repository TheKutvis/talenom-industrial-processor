#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const config = {
  name: 'talenom-toolbox',
  version: '2.0.0',
  platforms: ['win32', 'darwin', 'linux'],
  methods: ['sea', 'bun', 'caxa'],
  outputDir: 'dist'
};

console.log('🏗️  Talenom Toolbox - Advanced Build System');
console.log(`📊 Building for: ${config.platforms.join(', ')}`);

// Ensure dist directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir);
}

async function buildForPlatform(platform, method) {
  console.log(`\n🔨 Building ${method} for ${platform}...`);
  
  const extension = platform === 'win32' ? '.exe' : '';
  const outputName = `${config.name}-${platform}-${method}${extension}`;
  const outputPath = path.join(config.outputDir, outputName);

  try {
    switch (method) {
      case 'sea':
        await buildSEA(outputPath);
        break;
      case 'bun':
        await buildBun(outputPath);
        break;
      case 'caxa':
        await buildCaxa(outputPath);
        break;
    }
    
    if (fs.existsSync(outputPath)) {
      const size = Math.round(fs.statSync(outputPath).size / 1024 / 1024);
      console.log(`✅ ${outputName} (${size}MB)`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${outputName}: ${error.message}`);
    return false;
  }
  return false;
}

async function buildSEA(outputPath) {
  const seaConfig = {
    main: './server.js',
    output: `sea-prep-${Date.now()}.blob`,
    disableExperimentalSEAWarning: true,
    useCodeCache: true,
    useSnapshot: false
  };

  const configPath = `sea-config-${Date.now()}.json`;
  fs.writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

  try {
    execSync(`node --experimental-sea-config ${configPath}`, { stdio: 'pipe' });
    fs.copyFileSync(process.execPath, outputPath);
    
    // Install postject if needed
    try {
      execSync('npx postject --version', { stdio: 'pipe' });
    } catch {
      execSync('npm install postject', { stdio: 'pipe' });
    }

    const postjectCmd = process.platform === 'win32' 
      ? `npx postject ${outputPath} NODE_SEA_BLOB ${seaConfig.output} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
      : `npx postject ${outputPath} NODE_SEA_BLOB ${seaConfig.output} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`;
    
    execSync(postjectCmd, { stdio: 'pipe' });
    
    if (process.platform !== 'win32') {
      fs.chmodSync(outputPath, '755');
    }

    // Cleanup
    fs.unlinkSync(configPath);
    fs.unlinkSync(seaConfig.output);
  } catch (error) {
    // Cleanup on error
    try {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      if (fs.existsSync(seaConfig.output)) fs.unlinkSync(seaConfig.output);
    } catch {}
    throw error;
  }
}

async function buildBun(outputPath) {
  // Check if Bun is available
  try {
    execSync('bun --version', { stdio: 'pipe' });
  } catch {
    throw new Error('Bun not installed');
  }

  execSync(`bun build server.js --compile --outfile ${outputPath}`, { stdio: 'pipe' });
}

async function buildCaxa(outputPath) {
  try {
    execSync('npx caxa --version', { stdio: 'pipe' });
  } catch {
    execSync('npm install caxa', { stdio: 'pipe' });
  }

  const command = `npx caxa --input . --output ${outputPath} -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"`;
  execSync(command, { stdio: 'pipe' });
}

async function main() {
  const method = process.argv[2] || 'sea';
  const platform = process.argv[3] || process.platform;

  if (!config.methods.includes(method)) {
    console.error(`❌ Unknown method: ${method}`);
    console.log(`Available methods: ${config.methods.join(', ')}`);
    process.exit(1);
  }

  console.log(`🎯 Building with ${method} for ${platform}`);
  const success = await buildForPlatform(platform, method);
  
  if (success) {
    console.log('\n🎉 Build completed successfully!');
    console.log(`📁 Output directory: ${config.outputDir}/`);
  } else {
    console.log('\n❌ Build failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Build error:', error.message);
    process.exit(1);
  });
}

module.exports = { buildForPlatform, config };