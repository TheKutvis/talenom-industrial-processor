#!/usr/bin/env node

/**
 * i18n Management Utility
 * 
 * Usage:
 *   node scripts/i18n-manager.js export [language] [namespace]  - Export JSON to .po
 *   node scripts/i18n-manager.js import [language] [namespace]  - Import .po to JSON
 *   node scripts/i18n-manager.js extract                       - Extract keys from source
 *   node scripts/i18n-manager.js missing [language]           - Find missing translations
 */

const fs = require('fs');
const path = require('path');
const gettextParser = require('gettext-parser');

class I18nManager {
    constructor() {
        this.localesDir = path.join(__dirname, '..', 'locales');
        this.supportedLanguages = ['en', 'fi', 'sv'];
        this.namespaces = ['common', 'ui', 'processors', 'errors'];
    }

    /**
     * Export JSON translations to .po files
     */
    async exportToPo(language = null, namespace = null) {
        const languages = language ? [language] : this.supportedLanguages;
        const namespaces = namespace ? [namespace] : this.namespaces;

        for (const lang of languages) {
            for (const ns of namespaces) {
                try {
                    await this.exportSingleFile(lang, ns);
                    console.log(`✅ Exported ${lang}/${ns}.po`);
                } catch (error) {
                    console.error(`❌ Failed to export ${lang}/${ns}.po:`, error.message);
                }
            }
        }
    }

    /**
     * Export single JSON file to .po
     */
    async exportSingleFile(language, namespace) {
        const jsonPath = path.join(this.localesDir, language, `${namespace}.json`);
        const poPath = path.join(this.localesDir, language, `${namespace}.po`);

        if (!fs.existsSync(jsonPath)) {
            throw new Error(`JSON file not found: ${jsonPath}`);
        }

        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        const poData = {
            charset: 'utf-8',
            headers: {
                'Project-Id-Version': 'Talenom Industrial Processor 1.0',
                'Report-Msgid-Bugs-To': 'developers@talenom.fi',
                'POT-Creation-Date': new Date().toISOString(),
                'PO-Revision-Date': new Date().toISOString(),
                'Last-Translator': 'Automated <no-reply@talenom.fi>',
                'Language-Team': this.getLanguageTeam(language),
                'Language': language,
                'MIME-Version': '1.0',
                'Content-Type': 'text/plain; charset=UTF-8',
                'Content-Transfer-Encoding': '8bit',
                'Plural-Forms': this.getPluralForms(language)
            },
            translations: {
                '': this.flattenObject(jsonContent)
            }
        };

        const poContent = gettextParser.po.compile(poData);
        fs.writeFileSync(poPath, poContent);
    }

    /**
     * Import .po files to JSON
     */
    async importFromPo(language = null, namespace = null) {
        const languages = language ? [language] : this.supportedLanguages;
        const namespaces = namespace ? [namespace] : this.namespaces;

        for (const lang of languages) {
            for (const ns of namespaces) {
                try {
                    await this.importSingleFile(lang, ns);
                    console.log(`✅ Imported ${lang}/${ns}.json`);
                } catch (error) {
                    console.error(`❌ Failed to import ${lang}/${ns}.po:`, error.message);
                }
            }
        }
    }

    /**
     * Import single .po file to JSON
     */
    async importSingleFile(language, namespace) {
        const poPath = path.join(this.localesDir, language, `${namespace}.po`);
        const jsonPath = path.join(this.localesDir, language, `${namespace}.json`);

        if (!fs.existsSync(poPath)) {
            throw new Error(`PO file not found: ${poPath}`);
        }

        const poContent = fs.readFileSync(poPath);
        const parsed = gettextParser.po.parse(poContent);
        const translations = parsed.translations[''] || parsed.translations;
        
        const jsonContent = {};
        Object.keys(translations).forEach(key => {
            if (key === '') return; // Skip header
            
            const translation = translations[key];
            if (translation.msgstr && translation.msgstr[0]) {
                this.setNestedValue(jsonContent, key, translation.msgstr[0]);
            }
        });

        fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
    }

    /**
     * Extract translation keys from source files
     */
    async extractKeys() {
        const sourceDir = path.join(__dirname, '..', 'public');
        const keys = new Set();

        const htmlFiles = this.findFiles(sourceDir, '.html');
        const jsFiles = this.findFiles(sourceDir, '.js');

        // Extract from HTML data-i18n attributes
        htmlFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            const matches = content.match(/data-i18n="([^"]+)"/g);
            if (matches) {
                matches.forEach(match => {
                    const key = match.match(/data-i18n="([^"]+)"/)[1];
                    keys.add(key);
                });
            }
        });

        // Extract from JavaScript i18n.t() calls
        jsFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            const matches = content.match(/i18n\.t\(['"`]([^'"`]+)['"`]/g);
            if (matches) {
                matches.forEach(match => {
                    const key = match.match(/i18n\.t\(['"`]([^'"`]+)['"`]/)[1];
                    keys.add(key);
                });
            }
        });

        const sortedKeys = Array.from(keys).sort();
        console.log(`🔍 Found ${sortedKeys.length} translation keys:`);
        sortedKeys.forEach(key => console.log(`  - ${key}`));

        // Save to file
        const outputPath = path.join(__dirname, 'extracted-keys.txt');
        fs.writeFileSync(outputPath, sortedKeys.join('\n'));
        console.log(`📝 Keys saved to: ${outputPath}`);

        return sortedKeys;
    }

    /**
     * Find missing translations
     */
    async findMissing(language) {
        const referenceLang = 'en';
        const missing = {};

        for (const namespace of this.namespaces) {
            const refPath = path.join(this.localesDir, referenceLang, `${namespace}.json`);
            const targetPath = path.join(this.localesDir, language, `${namespace}.json`);

            if (!fs.existsSync(refPath)) continue;

            const refTranslations = JSON.parse(fs.readFileSync(refPath, 'utf8'));
            const targetTranslations = fs.existsSync(targetPath) 
                ? JSON.parse(fs.readFileSync(targetPath, 'utf8'))
                : {};

            const refKeys = this.getNestedKeys(refTranslations);
            const targetKeys = this.getNestedKeys(targetTranslations);
            
            const missingKeys = refKeys.filter(key => !targetKeys.includes(key));
            
            if (missingKeys.length > 0) {
                missing[namespace] = missingKeys;
            }
        }

        if (Object.keys(missing).length === 0) {
            console.log(`✅ No missing translations for ${language}`);
        } else {
            console.log(`⚠️ Missing translations for ${language}:`);
            Object.keys(missing).forEach(namespace => {
                console.log(`\n📁 ${namespace}:`);
                missing[namespace].forEach(key => {
                    console.log(`  - ${key}`);
                });
            });
        }

        return missing;
    }

    /**
     * Utility functions
     */
    flattenObject(obj, prefix = '') {
        const result = {};
        
        Object.keys(obj).forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(result, this.flattenObject(value, fullKey));
            } else if (typeof value === 'string') {
                result[fullKey] = {
                    msgid: fullKey,
                    msgstr: [value]
                };
            }
        });
        
        return result;
    }

    setNestedValue(obj, key, value) {
        const keys = key.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    getNestedKeys(obj, prefix = '') {
        const keys = [];
        
        Object.keys(obj).forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                keys.push(...this.getNestedKeys(value, fullKey));
            } else {
                keys.push(fullKey);
            }
        });
        
        return keys;
    }

    findFiles(dir, extension) {
        const files = [];
        
        function scanDir(currentDir) {
            const items = fs.readdirSync(currentDir);
            items.forEach(item => {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (item.endsWith(extension)) {
                    files.push(fullPath);
                }
            });
        }
        
        scanDir(dir);
        return files;
    }

    getLanguageTeam(language) {
        const teams = {
            'en': 'English',
            'fi': 'Finnish',
            'sv': 'Swedish'
        };
        return teams[language] || language;
    }

    getPluralForms(language) {
        const forms = {
            'en': 'nplurals=2; plural=(n != 1);',
            'fi': 'nplurals=2; plural=(n != 1);',
            'sv': 'nplurals=2; plural=(n != 1);'
        };
        return forms[language] || 'nplurals=2; plural=(n != 1);';
    }
}

// CLI interface
if (require.main === module) {
    const manager = new I18nManager();
    const [,, command, ...args] = process.argv;

    async function main() {
        switch (command) {
            case 'export':
                await manager.exportToPo(args[0], args[1]);
                break;
            case 'import':
                await manager.importFromPo(args[0], args[1]);
                break;
            case 'extract':
                await manager.extractKeys();
                break;
            case 'missing':
                await manager.findMissing(args[0] || 'fi');
                break;
            default:
                console.log(`
🌍 i18n Management Utility

Usage:
  node scripts/i18n-manager.js export [language] [namespace]  - Export JSON to .po
  node scripts/i18n-manager.js import [language] [namespace]  - Import .po to JSON  
  node scripts/i18n-manager.js extract                       - Extract keys from source
  node scripts/i18n-manager.js missing [language]           - Find missing translations

Examples:
  node scripts/i18n-manager.js export fi ui                  - Export Finnish UI translations
  node scripts/i18n-manager.js import                        - Import all .po files
  node scripts/i18n-manager.js missing sv                    - Find missing Swedish translations
                `);
        }
    }

    main().catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
}

module.exports = I18nManager;