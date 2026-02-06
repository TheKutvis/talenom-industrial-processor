# 📦 Talenom Toolbox - Build Guide

This document describes the modern packaging options available for creating distributable executables.

## 🚀 Quick Start

```bash
# Build with the recommended SEA method
npm run build

# Or choose a specific method
npm run build:sea    # Single Executable Application (Node.js official)
npm run build:bun    # Bun compile (fastest)
npm run build:caxa   # CAXA (most compatible)
```

## 📊 Build Methods Comparison

| Method | File Size | Startup Speed | Compatibility | Node Version |
|--------|-----------|---------------|---------------|--------------|
| **SEA** | ~50MB | Fast | Excellent | 20.0+ |
| **Bun** | ~30MB | Fastest | Good | Any |
| **CAXA** | ~60MB | Medium | Excellent | Any |
| **pkg** (legacy) | ~40MB | Medium | Good | 16-18 |

## 🎯 Recommended Approach: SEA (Single Executable Applications)

This is the **official Node.js solution** and our recommended approach:

```bash
npm run build:sea
```

### ✅ Advantages:
- Official Node.js feature (stable since v20)
- Best performance and compatibility
- No additional runtime dependencies
- Supports all Node.js APIs
- Small file size
- Active development and support

### ⚙️ How it works:
1. Creates a JavaScript blob from your application
2. Injects the blob into a Node.js binary
3. Results in a single, self-contained executable

## ⚡ Alternative: Bun Compile

For maximum speed and smallest file size:

```bash
npm run build:bun
```

### ✅ Advantages:
- Fastest startup time
- Smallest file size
- Built-in TypeScript support
- Modern runtime

### ⚠️ Considerations:
- Requires Bun runtime (automatically installed)
- Newer ecosystem (less battle-tested)

## 📦 Alternative: CAXA

For maximum compatibility:

```bash
npm run build:caxa
```

### ✅ Advantages:
- Works with any Node.js version
- Excellent compatibility with native modules
- Simple and reliable
- Good for complex applications

### ⚠️ Considerations:
- Slightly larger file size
- Slower startup than SEA/Bun

## 🏗️ Advanced Build Options

### Build for specific platform:
```bash
node build-advanced.js sea win32
node build-advanced.js bun darwin
node build-advanced.js caxa linux
```

### Build all variants:
```bash
npm run build:all
```

## 📁 Output Structure

After building, you'll find executables in the `dist/` directory:

```
dist/
├── talenom-toolbox.exe          (Windows SEA build)
├── talenom-toolbox              (Linux/macOS SEA build)
├── talenom-toolbox-win32-bun.exe
└── talenom-toolbox-darwin-caxa
```

## 🚀 Distribution

The generated executables are completely self-contained and can be distributed without:
- Node.js installation
- npm dependencies
- Additional configuration files

Simply copy the executable to any compatible system and run it!

## 🔧 Customization

Edit the build scripts to customize:
- Output names and paths
- Included assets and dependencies
- Platform-specific options
- Optimization settings

## 💡 Tips

1. **For production**: Use SEA method for best balance of size/performance
2. **For development**: Use Bun for fastest iteration
3. **For compatibility**: Use CAXA if you encounter issues with other methods
4. **File size**: All methods produce executables under 100MB
5. **Startup time**: All methods start in under 3 seconds on modern hardware

## ❓ Troubleshooting

### Common issues:
- **"Permission denied"**: Make sure the executable has proper permissions
- **"Module not found"**: Ensure all dependencies are included in the build
- **Large file size**: Consider excluding unnecessary dependencies

### Need help?
Check the console output during build for detailed error messages and suggestions.