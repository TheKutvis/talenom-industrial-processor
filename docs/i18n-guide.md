# 🌍 Internationalization (i18n) System

## Overview

The Talenom Industrial Processor features a comprehensive internationalization system that supports multiple languages with professional translation workflows using industry-standard .po files.

## Supported Languages

- **English (en)** - Default language
- **Finnish (fi)** - Primary language for Finnish users  
- **Swedish (sv)** - Support for Swedish-speaking users

## Translation Namespaces

Translations are organized into logical namespaces:

- **common** - Common UI elements, buttons, navigation
- **ui** - Page-specific interface elements
- **processors** - Processing-related messages and descriptions
- **errors** - Error messages and validation text

## File Structure

```
locales/
├── en/
│   ├── common.json         # English translations
│   ├── ui.json
│   ├── processors.json
│   ├── errors.json
│   ├── common.po          # Generated .po files
│   ├── ui.po
│   ├── processors.po
│   └── errors.po
├── fi/                    # Finnish translations (same structure)
└── sv/                    # Swedish translations (same structure)
```

## Managing Translations

### Using the i18n Manager Script

The project includes a powerful command-line tool for managing translations:

```bash
# Export all JSON translations to .po files
node scripts/i18n-manager.js export

# Export specific language/namespace
node scripts/i18n-manager.js export fi ui

# Import .po files back to JSON
node scripts/i18n-manager.js import

# Extract translation keys from source code
node scripts/i18n-manager.js extract

# Find missing translations
node scripts/i18n-manager.js missing fi
```

### Translation Workflow

1. **Development**: Add translation keys to HTML/JS files
2. **Extract**: Run `extract` command to find all used keys
3. **Export**: Generate .po files for translators
4. **Translate**: Edit .po files with translation tools (Poedit, etc.)
5. **Import**: Convert .po files back to JSON
6. **Deploy**: Restart server to load new translations

## Using Translations in Code

### HTML Elements

Add `data-i18n` attributes to elements:

```html
<h1 data-i18n="common.title">Default Title</h1>
<button data-i18n="common.buttons.submit">Submit</button>
```

### JavaScript

Use the global `i18n` object:

```javascript
// Simple translation
const title = i18n.t('common.title');

// With interpolation
const message = i18n.t('ui.welcome', { name: 'John' });

// Update page translations after language change
i18n.changeLanguage('fi');
```

### Server-side (Node.js)

Access translations in Express routes:

```javascript
app.get('/api/data', (req, res) => {
    const message = req.t('processors.success');
    res.json({ message });
});
```

## Language Detection

The system automatically detects user language from:

1. URL parameter: `?lang=fi`
2. Browser language preferences
3. Fallback to English

## Translation Key Naming

Use descriptive, hierarchical keys:

```
common.buttons.submit
common.navigation.home
ui.upload.title
ui.upload.dragDrop
processors.esimerkkiseura.title
errors.validation.required
```

## Professional Translation Tools

The .po file format is supported by professional translation tools:

- **Poedit** - Popular desktop editor
- **Weblate** - Web-based collaborative platform
- **Crowdin** - Professional translation management
- **Lokalise** - Translation management platform

## API Endpoints

The server provides REST endpoints for managing translations:

```
GET /api/translations/:language/:namespace  # Get translations
POST /api/translations/:language/:namespace # Update translations
GET /api/languages                          # List available languages
```

## Configuration

### Server Configuration

The i18n system is configured in `server.js`:

```javascript
const i18nService = require('./services/i18nService');
app.use(i18nService.getMiddleware());
```

### Client Configuration

Client-side i18n is initialized in `public/i18n-client.js`:

```javascript
const i18n = new I18nClient({
    fallbackLng: 'en',
    debug: false,
    detection: {
        order: ['querystring', 'navigator'],
        caches: ['localStorage']
    }
});
```

## Best Practices

1. **Use descriptive keys**: `ui.upload.title` instead of `title1`
2. **Group by context**: Organize keys in logical namespaces
3. **Provide context**: Add comments in .po files for translators
4. **Test all languages**: Verify UI layout with different text lengths
5. **Keep fallbacks**: Always provide English translations
6. **Use interpolation**: `Hello {{name}}` for dynamic content

## Troubleshooting

### Missing Translations

Find missing translations with:
```bash
node scripts/i18n-manager.js missing fi
```

### Key Extraction

Find all translation keys in source code:
```bash
node scripts/i18n-manager.js extract
```

### File Sync Issues

If .po and JSON files get out of sync:
```bash
# Export fresh .po files from JSON
node scripts/i18n-manager.js export

# Or import .po changes to JSON
node scripts/i18n-manager.js import
```

## Development Notes

- The i18n system loads on application startup
- Translation changes require server restart in production
- Client-side translations are cached in browser storage
- The system gracefully falls back to keys if translations are missing

## Contributing Translations

1. Fork the repository
2. Export current .po files: `node scripts/i18n-manager.js export`
3. Edit .po files with your translations
4. Import back to JSON: `node scripts/i18n-manager.js import`
5. Test your translations
6. Submit a pull request

For questions about the i18n system, contact the development team.