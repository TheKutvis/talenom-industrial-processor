const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Create logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Determine if running as packaged executable
const isPackaged = typeof process.pkg !== 'undefined';

// Use executable directory for config when packaged, otherwise use project directory
const CONFIG_FILE = isPackaged 
    ? path.join(path.dirname(process.execPath), 'config', 'account-mappings.json')
    : path.join(__dirname, '..', 'config', 'account-mappings.json');

/**
 * Account Mapping Service
 * Manages account number mappings for both main application and Esimerkkiseura
 */
class AccountMappingService {
    constructor() {
        this.mappings = {
            main: {},
            esimerkkiseura: {}
        };
        this.loadMappings();
    }

    /**
     * Load account mappings from configuration file
     */
    loadMappings() {
        try {
            // Ensure config directory exists
            const configDir = path.dirname(CONFIG_FILE);
            if (!fs.existsSync(configDir)) {
                try {
                    fs.mkdirSync(configDir, { recursive: true });
                } catch (mkdirError) {
                    logger.warn('Could not create config directory, using default mappings:', mkdirError.message);
                    return; // Continue with default empty mappings
                }
            }

            // Load existing mappings if file exists
            if (fs.existsSync(CONFIG_FILE)) {
                const data = fs.readFileSync(CONFIG_FILE, 'utf8');
                this.mappings = JSON.parse(data);
                logger.info('Account mappings loaded from configuration file');
            } else {
                // Try to create default configuration
                try {
                    this.saveMappings();
                    logger.info('Created default account mappings configuration');
                } catch (saveError) {
                    logger.warn('Could not save default mappings, using in-memory mappings:', saveError.message);
                }
            }
        } catch (error) {
            logger.error('Error loading account mappings:', error);
            // Use default empty mappings on error
            this.mappings = {
                main: {},
                esimerkkiseura: {}
            };
        }
    }

    /**
     * Save account mappings to configuration file
     */
    saveMappings() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.mappings, null, 2));
            logger.info('Account mappings saved to configuration file');
        } catch (error) {
            logger.error('Error saving account mappings:', error);
            throw error;
        }
    }

    /**
     * Get mappings for a specific application or all applications
     * @param {string} [app] - Application name ('main' or 'esimerkkiseura'), if omitted returns all
     * @returns {object} - Account mappings
     */
    getMappings(app) {
        if (app) {
            return this.mappings[app] || {};
        }
        return this.mappings;
    }

    /**
     * Set mappings for a specific application or all applications
     * @param {string|object} app - Application name ('main' or 'esimerkkiseura') or full mappings object
     * @param {object} [mappings] - Account mappings object (if app is string)
     */
    setMappings(app, mappings) {
        if (typeof app === 'object' && mappings === undefined) {
            // Setting all mappings at once
            this.mappings = app;
            this.saveMappings();
            logger.info('All account mappings updated');
        } else if (typeof app === 'string') {
            // Setting mappings for specific app
            if (!['main', 'esimerkkiseura'].includes(app)) {
                throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
            }
            this.mappings[app] = mappings;
            this.saveMappings();
            logger.info(`Account mappings updated for ${app} application`);
        } else {
            throw new Error('Invalid parameters for setMappings');
        }
    }

    /**
     * Add or update a single mapping for a specific application
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} sourceAccount - Original account number
     * @param {string} targetAccount - Mapped account number
     */
    addMapping(app, sourceAccount, targetAccount) {
        if (!['main', 'esimerkkiseura'].includes(app)) {
            throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
        }

        if (!this.mappings[app]) {
            this.mappings[app] = {};
        }

        this.mappings[app][sourceAccount] = targetAccount;
        this.saveMappings();
        logger.info(`Added mapping for ${app}: ${sourceAccount} -> ${targetAccount}`);
    }

    /**
     * Remove a mapping for a specific application
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} sourceAccount - Original account number to remove mapping for
     */
    removeMapping(app, sourceAccount) {
        if (!['main', 'esimerkkiseura'].includes(app)) {
            throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
        }

        if (this.mappings[app] && this.mappings[app][sourceAccount]) {
            delete this.mappings[app][sourceAccount];
            this.saveMappings();
            logger.info(`Removed mapping for ${app}: ${sourceAccount}`);
        }
    }

    /**
     * Apply account mapping to a single account number
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} accountNumber - Original account number
     * @returns {string} - Mapped account number (or original if no mapping exists)
     */
    mapAccount(app, accountNumber) {
        if (!accountNumber) return accountNumber;
        
        const mappings = this.getMappings(app);
        const mapped = mappings[String(accountNumber)];
        
        if (mapped) {
            logger.debug(`Mapped account ${accountNumber} to ${mapped} for ${app}`);
            return mapped;
        }
        
        return String(accountNumber);
    }

    /**
     * Apply account mappings to accounting data
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {Array} data - Array of accounting data objects
     * @param {string} accountField - Field name containing account number
     * @returns {Array} - Data with mapped account numbers
     */
    applyMappingsToData(app, data, accountField = 'Tili') {
        if (!Array.isArray(data)) return data;
        
        const mappings = this.getMappings(app);
        const mappingCount = Object.keys(mappings).length;
        
        if (mappingCount === 0) {
            logger.debug(`No account mappings defined for ${app}, using original accounts`);
            return data;
        }

        let appliedMappings = 0;
        const mappedData = data.map(row => {
            if (row[accountField]) {
                const originalAccount = String(row[accountField]);
                const mappedAccount = this.mapAccount(app, originalAccount);
                
                if (mappedAccount !== originalAccount) {
                    appliedMappings++;
                    return {
                        ...row,
                        [accountField]: mappedAccount
                    };
                }
            }
            return row;
        });

        logger.info(`Applied ${appliedMappings} account mappings for ${app} application`);
        return mappedData;
    }

    /**
     * Apply account mappings to voucher data
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {Array} vouchers - Array of voucher objects
     * @returns {Array} - Vouchers with mapped account numbers
     */
    applyMappingsToVouchers(app, vouchers) {
        if (!Array.isArray(vouchers)) return vouchers;
        
        const mappings = this.getMappings(app);
        const mappingCount = Object.keys(mappings).length;
        
        if (mappingCount === 0) {
            logger.debug(`No account mappings defined for ${app}, using original accounts`);
            return vouchers;
        }

        let appliedMappings = 0;
        const mappedVouchers = vouchers.map(voucher => {
            if (voucher.voucherRows && Array.isArray(voucher.voucherRows)) {
                const mappedRows = voucher.voucherRows.map(row => {
                    if (row.accountNumber) {
                        const originalAccount = String(row.accountNumber);
                        const mappedAccount = this.mapAccount(app, originalAccount);
                        
                        if (mappedAccount !== originalAccount) {
                            appliedMappings++;
                            return {
                                ...row,
                                accountNumber: mappedAccount
                            };
                        }
                    }
                    return row;
                });

                return {
                    ...voucher,
                    voucherRows: mappedRows
                };
            }
            return voucher;
        });

        logger.info(`Applied ${appliedMappings} account mappings to vouchers for ${app} application`);
        return mappedVouchers;
    }

    /**
     * Get configuration status
     * @returns {object} - Configuration status and statistics
     */
    getStatus() {
        return {
            configFile: CONFIG_FILE,
            mainMappings: Object.keys(this.mappings.main || {}).length,
            esimerkkiseuraMappings: Object.keys(this.mappings.esimerkkiseura || {}).length,
            lastModified: fs.existsSync(CONFIG_FILE) ? fs.statSync(CONFIG_FILE).mtime : null
        };
    }
}

// Export singleton instance
module.exports = AccountMappingService;