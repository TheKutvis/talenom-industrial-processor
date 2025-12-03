# Talenom Toolbox - Distribution Guide

## Building the Executable

To package the Talenom Toolbox as a Windows executable:

### 1. Install pkg (if not already installed)
```bash
npm install
```

### 2. Build the executable
```bash
npm run build
```

This will create `TalenomToolbox.exe` in the `dist/` folder.

## Distribution Package

When distributing the application, include:

1. **TalenomToolbox.exe** - The main executable
2. **.env file** - Configuration file (users need to add their credentials)
3. **README for users** - Instructions below

### Create a distribution folder with:
```
TalenomToolbox/
├── TalenomToolbox.exe
├── .env.example (rename to .env and fill in)
└── README.txt
```

## User Instructions

### .env File Setup

Create a `.env` file in the same folder as `TalenomToolbox.exe` with:

```
# Talenom API Configuration
TALENOM_CLIENT_ID=your_client_id_here
TALENOM_CLIENT_SECRET=your_client_secret_here
TALENOM_COMPANY_ID=your_company_id_here

# Server Configuration
PORT=3000

# Logging
LOG_LEVEL=info
```

### Running the Application

1. Double-click `TalenomToolbox.exe`
2. Open your browser to `http://localhost:3000`
3. Access the tools from the landing page

### Stopping the Application

- Close the console window that appears when running the .exe
- Or press `Ctrl+C` in the console window

## Technical Details

- **Platform**: Windows x64
- **Node.js Version**: 18 (bundled)
- **Port**: 3000 (configurable via .env)
- **Size**: ~80-100 MB (includes Node.js runtime)

## Troubleshooting

**Port already in use:**
- Change PORT in .env file to another number (e.g., 3001, 8080)

**Cannot access the application:**
- Check that the console window is running
- Verify the correct port in your browser URL
- Check Windows Firewall settings

**API errors:**
- Verify credentials in .env file
- Check that TALENOM_COMPANY_ID is correct
