/**
 * Client-side internationalization helper
 */
class I18nClient {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.supportedLanguages = ['en', 'fi', 'sv'];
        this.namespaces = ['common', 'ui', 'processors', 'errors'];
        this.initialized = false;
    }

    /**
     * Initialize the i18n client
     */
    async init(language = null) {
        // Detect language from various sources
        this.currentLanguage = language || 
            this.getLanguageFromURL() || 
            this.getLanguageFromStorage() || 
            this.getLanguageFromBrowser() || 
            'en';

        // Ensure supported language
        if (!this.supportedLanguages.includes(this.currentLanguage)) {
            this.currentLanguage = 'en';
        }

        // Load all namespaces for current language
        await this.loadTranslations(this.currentLanguage);
        
        // Update HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
        
        // Store language preference
        localStorage.setItem('preferred-language', this.currentLanguage);
        
        this.initialized = true;
        this.log(`🌍 I18n initialized with language: ${this.currentLanguage}`, 'info');
        
        return this;
    }

    /**
     * Load translations for a specific language
     */
    async loadTranslations(language) {
        if (!this.translations[language]) {
            this.translations[language] = {};
        }

        const loadPromises = this.namespaces.map(async (namespace) => {
            try {
                const response = await fetch(`/api/translations/${language}/${namespace}`);
                if (response.ok) {
                    const translations = await response.json();
                    this.translations[language][namespace] = translations;
                    this.log(`Loaded ${namespace} translations for ${language}`, 'debug');
                } else {
                    this.log(`Failed to load ${namespace} translations for ${language}`, 'warn');
                }
            } catch (error) {
                this.log(`Error loading ${namespace} translations: ${error.message}`, 'error');
            }
        });

        await Promise.all(loadPromises);
    }

    /**
     * Translate a key with optional interpolation
     */
    t(key, options = {}) {
        if (!this.initialized) {
            this.log('I18n not initialized, returning key', 'warn');
            return key;
        }

        // Handle namespace separator ':'
        let namespace = 'common';
        let actualKey = key;
        
        if (key.includes(':')) {
            const [ns, keyPart] = key.split(':', 2);
            if (this.namespaces.includes(ns)) {
                namespace = ns;
                actualKey = keyPart;
            }
        }

        const translation = this.getNestedTranslation(namespace, actualKey);
        
        if (translation) {
            return this.interpolate(translation, options);
        }

        // Fallback to English if current language doesn't have translation
        if (this.currentLanguage !== 'en') {
            const englishTranslation = this.getNestedTranslation(namespace, actualKey, 'en');
            if (englishTranslation) {
                this.log(`Using English fallback for key: ${key}`, 'debug');
                return this.interpolate(englishTranslation, options);
            }
        }

        this.log(`Missing translation for key: ${key}`, 'warn');
        return key; // Return key if no translation found
    }

    /**
     * Get nested translation from namespace
     */
    getNestedTranslation(namespace, key, language = null) {
        const lang = language || this.currentLanguage;
        const translations = this.translations[lang]?.[namespace];
        
        if (!translations) return null;

        // Support nested keys like 'app.title'
        const keys = key.split('.');
        let result = translations;
        
        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                return null;
            }
        }
        
        return typeof result === 'string' ? result : null;
    }

    /**
     * Interpolate variables in translation string
     */
    interpolate(translation, options) {
        if (!options || Object.keys(options).length === 0) {
            return translation;
        }

        return translation.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return options[key] !== undefined ? options[key] : match;
        });
    }

    /**
     * Change language and reload translations
     */
    async changeLanguage(language) {
        if (!this.supportedLanguages.includes(language)) {
            this.log(`Unsupported language: ${language}`, 'error');
            return false;
        }

        this.currentLanguage = language;
        await this.loadTranslations(language);
        
        // Update HTML lang attribute
        document.documentElement.lang = language;
        
        // Store preference
        localStorage.setItem('preferred-language', language);
        
        // Trigger update event
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language } 
        }));
        
        this.log(`Language changed to: ${language}`, 'info');
        return true;
    }

    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return this.supportedLanguages;
    }

    /**
     * Update all elements with data-i18n attributes
     */
    updatePageTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (element.tagName === 'INPUT' && element.type === 'text') {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        });

        // Update title
        const titleKey = document.querySelector('title')?.getAttribute('data-i18n');
        if (titleKey) {
            document.title = this.t(titleKey);
        }
    }

    /**
     * Get language from URL parameters
     */
    getLanguageFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('lang');
    }

    /**
     * Get language from localStorage
     */
    getLanguageFromStorage() {
        return localStorage.getItem('preferred-language');
    }

    /**
     * Get language from browser settings
     */
    getLanguageFromBrowser() {
        const browserLang = navigator.language || navigator.userLanguage;
        return browserLang ? browserLang.split('-')[0] : null;
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        const prefix = level === 'error' ? '❌' : 
                     level === 'warn' ? '⚠️' : 
                     level === 'debug' ? '🔧' : '🌍';
        console.log(`${prefix} [I18n] ${message}`);
    }

    /**
     * Create language switcher buttons
     */
    createLanguageSwitcher(container) {
        const switcher = document.createElement('div');
        switcher.className = 'language-selector';
        
        this.supportedLanguages.forEach(lang => {
            const button = document.createElement('button');
            button.className = `btn btn-lang ${lang === this.currentLanguage ? 'active' : ''}`;
            button.textContent = this.getLanguageLabel(lang);
            button.addEventListener('click', () => this.changeLanguage(lang));
            switcher.appendChild(button);
        });
        
        if (container) {
            container.appendChild(switcher);
        }
        
        return switcher;
    }

    /**
     * Get language label with flag
     */
    getLanguageLabel(lang) {
        const labels = {
            'en': '🇬🇧 EN',
            'fi': '🇫🇮 FI', 
            'sv': '🇸🇪 SV'
        };
        return labels[lang] || lang.toUpperCase();
    }
}

// Create global instance
window.i18n = new I18nClient();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.i18n.init().then(() => {
            window.i18n.updatePageTranslations();
        });
    });
} else {
    window.i18n.init().then(() => {
        window.i18n.updatePageTranslations();
    });
}

// Listen for language changes and update UI
window.addEventListener('languageChanged', () => {
    window.i18n.updatePageTranslations();
    
    // Update language selector buttons
    document.querySelectorAll('.btn-lang').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.btn-lang:nth-child(${window.i18n.supportedLanguages.indexOf(window.i18n.currentLanguage) + 1})`)?.classList.add('active');
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18nClient;
}