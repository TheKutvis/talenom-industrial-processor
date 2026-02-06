#!/bin/bash

echo "🗜️  Ultra Compression with UPX"

# Check if UPX is installed
if ! command -v upx &> /dev/null; then
    echo "📥 Installing UPX..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install upx
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get install upx-ucl
    else
        echo "Please install UPX manually from https://upx.github.io/"
        exit 1
    fi
fi

# Compress the minimal build
if [ -f "dist/talenom-toolbox-minimal" ]; then
    echo "🔨 Compressing minimal build..."
    cp dist/talenom-toolbox-minimal dist/talenom-toolbox-ultra
    
    # Get original size
    original_size=$(stat -f%z dist/talenom-toolbox-minimal)
    echo "📏 Original size: $((original_size / 1024 / 1024)) MB"
    
    # Compress with UPX
    upx --ultra-brute dist/talenom-toolbox-ultra
    
    # Get compressed size
    compressed_size=$(stat -f%z dist/talenom-toolbox-ultra)
    echo "📏 Compressed size: $((compressed_size / 1024 / 1024)) MB"
    
    # Calculate compression ratio
    ratio=$(( (original_size - compressed_size) * 100 / original_size ))
    echo "🎯 Compression: ${ratio}% reduction"
    
    echo "✅ Ultra-compressed executable ready: dist/talenom-toolbox-ultra"
else
    echo "❌ Minimal build not found. Run: npm run build:minimal"
fi