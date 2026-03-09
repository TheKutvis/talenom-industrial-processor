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
    ? path.join(path.dirname(process.execPath), 'config', 'cost-centre-mappings.json')
    : path.join(__dirname, '..', 'config', 'cost-centre-mappings.json');

/**
 * Cost Centre Mapping Service
 * Manages cost centre mappings for both main application and Esimerkkiseura
 * Now uses SQLite database instead of JSON file
 */
class CostCentreMappingService {
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
                logger.info('Found legacy cost centre JSON config file, checking for migration...');
                
                // Check if database is empty
                const stats = this.db.getStats();
                if (stats.costCentreMappings === 0) {
                    // Database is empty, migrate from JSON
                    const data = fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8');
                    const legacyMappings = JSON.parse(data);
                    
                    // Migrate each app type
                    for (const [appType, mappings] of Object.entries(legacyMappings)) {
                        if (Object.keys(mappings).length > 0) {
                            this.db.bulkInsertCostCentreMappings(appType, mappings);
                            logger.info(`Migrated ${Object.keys(mappings).length} cost centre mappings for ${appType}`);
                        }
                    }
                    
                    // Rename legacy file to .migrated
                    const backupPath = LEGACY_CONFIG_FILE + '.migrated';
                    fs.renameSync(LEGACY_CONFIG_FILE, backupPath);
                    logger.info(`Legacy cost centre config migrated and backed up to ${backupPath}`);
                } else {
                    logger.info('Database already contains cost centre mappings, skipping migration');
                }
            }
        } catch (error) {
            logger.warn('Error during migration from legacy cost centre config:', error.message);
            // Don't throw - allow service to continue with empty mappings
        }
    }

    /**
     * Get mappings for a specific application or all applications
     * @param {string} [app] - Application name ('main' or 'esimerkkiseura'), if omitted returns all
     * @returns {object} - Cost centre mappings
     */
    getMappings(app) {
        if (app) {
            return this.db.getCostCentreMappings(app);
        }
        
        // Return all mappings organized by app type
        const allMappings = this.db.getAllCostCentreMappings();
        
        // Ensure both main and esimerkkiseura keys exist
        return {
            main: allMappings.main || {},
            esimerkkiseura: allMappings.esimerkkiseura || {}
        };
    }

    /**
     * Set mappings for a specific application or all applications
     * @param {string|object} app - Application name ('main' or 'esimerkkiseura') or full mappings object
     * @param {object} [mappings] - Cost centre mappings object (if app is string)
     */
    setMappings(app, mappings) {
        if (typeof app === 'object' && mappings === undefined) {
            // Setting all mappings at once
            // Clear existing and bulk insert new ones
            for (const [appType, appMappings] of Object.entries(app)) {
                this.db.clearCostCentreMappings(appType);
                if (Object.keys(appMappings).length > 0) {
                    this.db.bulkInsertCostCentreMappings(appType, appMappings);
                }
            }
            logger.info('All cost centre mappings updated');
        } else if (typeof app === 'string') {
            // Setting mappings for specific app
            if (!['main', 'esimerkkiseura'].includes(app)) {
                throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
            }
            
            // Clear existing mappings for this app and insert new ones
            this.db.clearCostCentreMappings(app);
            if (Object.keys(mappings).length > 0) {
                this.db.bulkInsertCostCentreMappings(app, mappings);
            }
            logger.info(`Cost centre mappings updated for ${app} application`);
        } else {
            throw new Error('Invalid parameters for setMappings');
        }
    }

    /**
     * Add or update a single mapping for a specific application
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} sourceCostCentre - Original cost centre code
     * @param {string} targetCostCentre - Mapped cost centre code
     */
    addMapping(app, sourceCostCentre, targetCostCentre) {
        if (!['main', 'esimerkkiseura'].includes(app)) {
            throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
        }

        this.db.setCostCentreMapping(app, String(sourceCostCentre), String(targetCostCentre));
        logger.info(`Added cost centre mapping for ${app}: ${sourceCostCentre} -> ${targetCostCentre}`);
    }

    /**
     * Remove a mapping for a specific application
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} sourceCostCentre - Original cost centre code to remove mapping for
     */
    removeMapping(app, sourceCostCentre) {
        if (!['main', 'esimerkkiseura'].includes(app)) {
            throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
        }

        this.db.removeCostCentreMapping(app, String(sourceCostCentre));
        logger.info(`Removed cost centre mapping for ${app}: ${sourceCostCentre}`);
    }

    /**
     * Apply cost centre mapping to a single cost centre code
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {string} costCentreCode - Original cost centre code
     * @returns {string} - Mapped cost centre code (or original if no mapping exists)
     */
    mapCostCentre(app, costCentreCode) {
        if (!costCentreCode) return costCentreCode;
        
        const mappings = this.getMappings(app);
        const mapped = mappings[String(costCentreCode)];
        
        if (mapped) {
            logger.debug(`Mapped cost centre ${costCentreCode} to ${mapped} for ${app}`);
            return mapped;
        }
        
        return String(costCentreCode);
    }

    /**
     * Apply cost centre mappings to accounting data
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {Array} data - Array of accounting data objects
     * @param {string} costCentreField - Field name containing cost centre code
     * @returns {Array} - Data with mapped cost centre codes
     */
    applyMappingsToData(app, data, costCentreField = 'Kustannuspaikka') {
        if (!Array.isArray(data)) return data;
        
        const mappings = this.getMappings(app);
        const mappingCount = Object.keys(mappings).length;
        
        if (mappingCount === 0) {
            logger.debug(`No cost centre mappings defined for ${app}, using original cost centres`);
            return data;
        }

        let appliedMappings = 0;
        const mappedData = data.map(row => {
            if (row[costCentreField]) {
                const originalCostCentre = String(row[costCentreField]);
                const mappedCostCentre = this.mapCostCentre(app, originalCostCentre);
                
                if (mappedCostCentre !== originalCostCentre) {
                    appliedMappings++;
                    return {
                        ...row,
                        [costCentreField]: mappedCostCentre
                    };
                }
            }
            return row;
        });

        logger.info(`Applied ${appliedMappings} cost centre mappings for ${app} application`);
        return mappedData;
    }

    /**
     * Apply cost centre mappings to voucher data
     * @param {string} app - Application name ('main' or 'esimerkkiseura')
     * @param {Array} vouchers - Array of voucher objects
     * @returns {Array} - Vouchers with mapped cost centre codes
     */
    applyMappingsToVouchers(app, vouchers) {
        if (!Array.isArray(vouchers)) return vouchers;
        
        const mappings = this.getMappings(app);
        const mappingCount = Object.keys(mappings).length;
        
        if (mappingCount === 0) {
            logger.debug(`No cost centre mappings defined for ${app}, using original cost centres`);
            return vouchers;
        }

        let appliedMappings = 0;
        const mappedVouchers = vouchers.map(voucher => {
            if (voucher.voucherRows && Array.isArray(voucher.voucherRows)) {
                const mappedRows = voucher.voucherRows.map(row => {
                    if (row.costCentre) {
                        const originalCostCentre = String(row.costCentre);
                        const mappedCostCentre = this.mapCostCentre(app, originalCostCentre);
                        
                        if (mappedCostCentre !== originalCostCentre) {
                            appliedMappings++;
                            return {
                                ...row,
                                costCentre: mappedCostCentre
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

        logger.info(`Applied ${appliedMappings} cost centre mappings to vouchers for ${app} application`);
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
            totalMappings: stats.costCentreMappings
        };
    }
}

// Export singleton instance
module.exports = CostCentreMappingService;