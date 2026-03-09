const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DatabaseService = require('./databaseService');

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

// Legacy JSON config file path (for migration)
const LEGACY_CONFIG_FILE = isPackaged 
    ? path.join(path.dirname(process.execPath), 'config', 'account-mappings.json')
    : path.join(__dirname, '..', 'config', 'account-mappings.json');

/**
 * Account Mapping Service
 * Manages account number mappings for both main application and Esimerkkiseura
 * Now uses SQLite database instead of JSON file
 */
class AccountMappingService {
    constructor(dbService = null) {
        // Use provided database service or create new one
        this.db = dbService || new DatabaseService();
        this.migrateFromLegacyConfig();
    }

    /**
     * Migrate existing JSON mappings to database (one-time operation)
     */
    migrateFromLegacyConfig() {
        try {
            // Check if legacy config file exists
            if (fs.existsSync(LEGACY_CONFIG_FILE)) {
                logger.info('Found legacy JSON config file, checking for migration...');
                
                // Check if database is empty
                const stats = this.db.getStats();
                if (stats.accountMappings === 0) {
                    // Database is empty, migrate from JSON
                    const data = fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8');
                    const legacyMappings = JSON.parse(data);
                    
                    // Migrate each app type
                    for (const [appType, mappings] of Object.entries(legacyMappings)) {
                        if (Object.keys(mappings).length > 0) {
                            this.db.bulkInsertAccountMappings(appType, mappings);
                            logger.info(`Migrated ${Object.keys(mappings).length} account mappings for ${appType}`);
                        }
                    }
                    
                    // Rename legacy file to .migrated
                    const backupPath = LEGACY_CONFIG_FILE + '.migrated';
                    fs.renameSync(LEGACY_CONFIG_FILE, backupPath);
                    logger.info(`Legacy config migrated and backed up to ${backupPath}`);
                } else {
                    logger.info('Database already contains mappings, skipping migration');
                }
            }
        } catch (error) {
            logger.warn('Error during migration from legacy config:', error.message);
            // Don't throw - allow service to continue with empty mappings
        }
    }

    /**
     * Get mappings for a specific application or all applications
     * @param {string} [app] - Application name ('main' or 'esimerkkiseura'), if omitted returns all
     * @returns {object} - Account mappings
     */
    getMappings(app) {
        if (app) {
            return this.db.getAccountMappings(app);
        }
        
        // Return all mappings organized by app type
        const allMappings = this.db.getAllAccountMappings();
        
        // Ensure both main and esimerkkiseura keys exist
        return {
            main: allMappings.main || {},
            esimerkkiseura: allMappings.esimerkkiseura || {}
        };
    }

    /**
     * Set mappings for a specific application or all applications
     * @param {string|object} app - Application name ('main' or 'esimerkkiseura') or full mappings object
     * @param {object} [mappings] - Account mappings object (if app is string)
     */
    setMappings(app, mappings) {
        if (typeof app === 'object' && mappings === undefined) {
            // Setting all mappings at once
            // Clear existing and bulk insert new ones
            for (const [appType, appMappings] of Object.entries(app)) {
                this.db.clearAccountMappings(appType);
                if (Object.keys(appMappings).length > 0) {
                    this.db.bulkInsertAccountMappings(appType, appMappings);
                }
            }
            logger.info('All account mappings updated');
        } else if (typeof app === 'string') {
            // Setting mappings for specific app
            if (!['main', 'esimerkkiseura'].includes(app)) {
                throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
            }
            
            // Clear existing mappings for this app and insert new ones
            this.db.clearAccountMappings(app);
            if (Object.keys(mappings).length > 0) {
                this.db.bulkInsertAccountMappings(app, mappings);
            }
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

        this.db.setAccountMapping(app, String(sourceAccount), String(targetAccount));
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

        this.db.removeAccountMapping(app, String(sourceAccount));
        logger.info(`Removed mapping for ${app}: ${sourceAccount}`);
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
        const stats = this.db.getStats();
        const allMappings = this.getMappings();
        
        return {
            storageType: 'sqlite',
            databasePath: stats.databasePath,
            mainMappings: Object.keys(allMappings.main || {}).length,
            esimerkkiseuraMappings: Object.keys(allMappings.esimerkkiseura || {}).length,
            totalMappings: stats.accountMappings
        };
    }
}

// Export singleton instance
module.exports = AccountMappingService;