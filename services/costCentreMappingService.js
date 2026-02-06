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
    ? path.join(path.dirname(process.execPath), 'config', 'cost-centre-mappings.json')
    : path.join(__dirname, '..', 'config', 'cost-centre-mappings.json');

/**
 * Cost Centre Mapping Service
 * Manages cost centre mappings for both main application and Esimerkkiseura
 */
class CostCentreMappingService {
    constructor() {
        this.mappings = {
            main: {},
            esimerkkiseura: {}
        };
        this.loadMappings();
    }

    /**
     * Load cost centre mappings from configuration file
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
                logger.info('Cost centre mappings loaded from configuration file');
            } else {
                // Try to create default configuration
                try {
                    this.saveMappings();
                    logger.info('Created default cost centre mappings configuration');
                } catch (saveError) {
                    logger.warn('Could not save default mappings, using in-memory mappings:', saveError.message);
                }
            }
        } catch (error) {
            logger.error('Error loading cost centre mappings:', error);
            // Use default empty mappings on error
            this.mappings = {
                main: {},
                esimerkkiseura: {}
            };
        }
    }

    /**
     * Save cost centre mappings to configuration file
     */
    saveMappings() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.mappings, null, 2));
            logger.info('Cost centre mappings saved to configuration file');
        } catch (error) {
            logger.error('Error saving cost centre mappings:', error);
            throw error;
        }
    }

    /**
     * Get mappings for a specific application or all applications
     * @param {string} [app] - Application name ('main' or 'esimerkkiseura'), if omitted returns all
     * @returns {object} - Cost centre mappings
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
     * @param {object} [mappings] - Cost centre mappings object (if app is string)
     */
    setMappings(app, mappings) {
        if (typeof app === 'object' && mappings === undefined) {
            // Setting all mappings at once
            this.mappings = app;
            this.saveMappings();
            logger.info('All cost centre mappings updated');
        } else if (typeof app === 'string') {
            // Setting mappings for specific app
            if (!['main', 'esimerkkiseura'].includes(app)) {
                throw new Error('Invalid application name. Use "main" or "esimerkkiseura"');
            }
            this.mappings[app] = mappings;
            this.saveMappings();
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

        if (!this.mappings[app]) {
            this.mappings[app] = {};
        }

        this.mappings[app][sourceCostCentre] = targetCostCentre;
        this.saveMappings();
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

        if (this.mappings[app] && this.mappings[app][sourceCostCentre]) {
            delete this.mappings[app][sourceCostCentre];
            this.saveMappings();
            logger.info(`Removed cost centre mapping for ${app}: ${sourceCostCentre}`);
        }
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
        return {
            configFile: CONFIG_FILE,
            mainMappings: Object.keys(this.mappings.main || {}).length,
            esimerkkiseuraMappings: Object.keys(this.mappings.esimerkkiseura || {}).length,
            lastModified: fs.existsSync(CONFIG_FILE) ? fs.statSync(CONFIG_FILE).mtime : null
        };
    }
}

// Export singleton instance
module.exports = CostCentreMappingService;