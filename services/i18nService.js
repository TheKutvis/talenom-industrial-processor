const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path = require('path');
const fs = require('fs');
const gettextParser = require('gettext-parser');

class I18nService {
  constructor() {
    this.initialized = false;
    this.supportedLanguages = ['en', 'fi', 'sv'];
    this.defaultLanguage = 'en';
    this.localesPath = path.join(__dirname, '..', 'locales');
  }

  /**
   * Initialize i18next with .po file support
   */
  async init() {
    if (this.initialized) return i18next;

    // Ensure locale directories exist
    this.ensureLocaleDirectories();

    // Convert .po files to JSON if they exist
    await this.convertPoFiles();

    await i18next
      .use(Backend)
      .use(middleware.LanguageDetector)
      .init({
        lng: this.defaultLanguage,
        fallbackLng: this.defaultLanguage,
        supportedLngs: this.supportedLanguages,
        
        // Backend configuration for JSON files
        backend: {
          loadPath: path.join(this.localesPath, '{{lng}}/{{ns}}.json'),
          addPath: path.join(this.localesPath, '{{lng}}/{{ns}}.missing.json')
        },

        // Language detection
        detection: {
          order: ['querystring', 'cookie', 'header'],
          caches: ['cookie']
        },

        // Namespace configuration
        ns: ['common', 'ui', 'processors', 'errors'],
        defaultNS: 'common',

        // Interpolation settings
        interpolation: {
          escapeValue: false // React already does escaping
        },

        // Development settings
        debug: process.env.NODE_ENV === 'development',
        saveMissing: true,
        
        // Return key if translation is missing
        parseMissingKeyHandler: (key) => {
          console.warn(`Missing translation key: ${key}`);
          return key;
        }
      });

    this.initialized = true;
    return i18next;
  }

  /**
   * Ensure all locale directories exist
   */
  ensureLocaleDirectories() {
    this.supportedLanguages.forEach(lang => {
      const langDir = path.join(this.localesPath, lang);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
      }
    });
  }

  /**
   * Convert .po files to JSON format
   */
  async convertPoFiles() {
    for (const lang of this.supportedLanguages) {
      const langDir = path.join(this.localesPath, lang);
      const poFiles = fs.readdirSync(langDir).filter(file => file.endsWith('.po'));
      
      for (const poFile of poFiles) {
        const poPath = path.join(langDir, poFile);
        const jsonPath = path.join(langDir, poFile.replace('.po', '.json'));
        
        try {
          const poContent = fs.readFileSync(poPath);
          const parsed = gettextParser.po.parse(poContent);
          const jsonContent = this.convertParsedPoToJson(parsed);
          
          fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
          console.log(`Converted ${poPath} to ${jsonPath}`);
        } catch (error) {
          console.error(`Error converting ${poPath}:`, error.message);
        }
      }
    }
  }

  /**
   * Convert parsed .po data to JSON format
   */
  convertParsedPoToJson(parsed) {
    const json = {};
    const translations = parsed.translations[''] || parsed.translations;
    
    Object.keys(translations).forEach(key => {
      if (key === '') return; // Skip header
      
      const translation = translations[key];
      if (translation.msgstr && translation.msgstr[0]) {
        // Convert dot notation to nested objects
        this.setNestedProperty(json, key, translation.msgstr[0]);
      }
    });
    
    return json;
  }

  /**
   * Set nested property using dot notation
   */
  setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Convert JSON translations back to .po format
   */
  async exportToPo(language, namespace) {
    const jsonPath = path.join(this.localesPath, language, `${namespace}.json`);
    const poPath = path.join(this.localesPath, language, `${namespace}.po`);
    
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found: ${jsonPath}`);
    }
    
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const flattenedContent = this.flattenObject(jsonContent);
    
    const poData = {
      charset: 'utf-8',
      headers: {
        'pot-creation-date': new Date().toISOString(),
        'po-revision-date': new Date().toISOString(),
        'language': language,
        'content-type': 'text/plain; charset=utf-8',
        'project-id-version': 'Talenom Industrial Processor 1.0'
      },
      translations: {
        '': Object.keys(flattenedContent).reduce((acc, key) => {
          acc[key] = {
            msgid: key,
            msgstr: [flattenedContent[key]]
          };
          return acc;
        }, {})
      }
    };
    
    const poContent = gettextParser.po.compile(poData);
    fs.writeFileSync(poPath, poContent);
    console.log(`Exported ${jsonPath} to ${poPath}`);
  }

  /**
   * Flatten nested object to dot notation
   */
  flattenObject(obj, prefix = '') {
    const flattened = {};
    
    Object.keys(obj).forEach(key => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, this.flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    });
    
    return flattened;
  }

  /**
   * Get Express middleware
   */
  getMiddleware() {
    if (!this.initialized) {
      throw new Error('I18n service not initialized. Call init() first.');
    }
    return middleware.handle(i18next);
  }

  /**
   * Get i18next instance
   */
  getInstance() {
    return i18next;
  }

  /**
   * Add missing translation keys
   */
  addMissingKeys(language, namespace, keys) {
    const filePath = path.join(this.localesPath, language, `${namespace}.json`);
    let translations = {};
    
    if (fs.existsSync(filePath)) {
      translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    let updated = false;
    keys.forEach(key => {
      // Check if nested key exists
      if (!this.getNestedProperty(translations, key)) {
        this.setNestedProperty(translations, key, key); // Use key as default translation
        updated = true;
      }
    });
    
    if (updated) {
      fs.writeFileSync(filePath, JSON.stringify(translations, null, 2));
      console.log(`Updated ${filePath} with missing keys`);
    }
  }

  /**
   * Get nested property using dot notation
   */
  getNestedProperty(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Create template .po files with all translation keys
   */
  async createPoTemplates() {
    for (const lang of this.supportedLanguages) {
      for (const namespace of ['common', 'ui', 'processors', 'errors']) {
        await this.exportToPo(lang, namespace);
      }
    }
  }
}

module.exports = new I18nService();