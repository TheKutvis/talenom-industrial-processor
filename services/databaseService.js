const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
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

// Use executable directory for database when packaged, otherwise use project directory
const DB_DIR = isPackaged 
    ? path.join(path.dirname(process.execPath), 'data')
    : path.join(__dirname, '..', 'data');

const DB_FILE = path.join(DB_DIR, 'mappings.db');

/**
 * Database Service
 * Manages SQLite database for storing mappings and configurations
 */
class DatabaseService {
    constructor() {
        this.db = null;
        this.initialize();
    }

    /**
     * Initialize database and create tables if they don't exist
     */
    initialize() {
        try {
            // Ensure data directory exists
            if (!fs.existsSync(DB_DIR)) {
                fs.mkdirSync(DB_DIR, { recursive: true });
                logger.info('Created data directory:', DB_DIR);
            }

            // Open database connection
            this.db = new Database(DB_FILE);
            logger.info('Database connection established:', DB_FILE);

            // Enable WAL mode for better concurrent access
            this.db.pragma('journal_mode = WAL');

            // Create tables
            this.createTables();
            
            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Error initializing database:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    createTables() {
        // Account mappings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS account_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_type TEXT NOT NULL,
                source_account TEXT NOT NULL,
                target_account TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(app_type, source_account)
            )
        `);

        // Cost centre mappings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cost_centre_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_type TEXT NOT NULL,
                source_code TEXT NOT NULL,
                target_code TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(app_type, source_code)
            )
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_account_mappings_app_type 
            ON account_mappings(app_type)
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_cost_centre_mappings_app_type 
            ON cost_centre_mappings(app_type)
        `);

        logger.info('Database tables created/verified');
    }

    /**
     * Get all account mappings for a specific app type
     * @param {string} appType - Application type ('main' or 'esimerkkiseura')
     * @returns {Object} - Mappings as key-value pairs
     */
    getAccountMappings(appType) {
        try {
            const stmt = this.db.prepare(
                'SELECT source_account, target_account FROM account_mappings WHERE app_type = ?'
            );
            const rows = stmt.all(appType);
            
            const mappings = {};
            rows.forEach(row => {
                mappings[row.source_account] = row.target_account;
            });
            
            return mappings;
        } catch (error) {
            logger.error('Error getting account mappings:', error);
            throw error;
        }
    }

    /**
     * Get all account mappings for all app types
     * @returns {Object} - Mappings organized by app type
     */
    getAllAccountMappings() {
        try {
            const stmt = this.db.prepare(
                'SELECT app_type, source_account, target_account FROM account_mappings'
            );
            const rows = stmt.all();
            
            const mappings = {};
            rows.forEach(row => {
                if (!mappings[row.app_type]) {
                    mappings[row.app_type] = {};
                }
                mappings[row.app_type][row.source_account] = row.target_account;
            });
            
            return mappings;
        } catch (error) {
            logger.error('Error getting all account mappings:', error);
            throw error;
        }
    }

    /**
     * Add or update an account mapping
     * @param {string} appType - Application type
     * @param {string} sourceAccount - Source account number
     * @param {string} targetAccount - Target account number
     */
    setAccountMapping(appType, sourceAccount, targetAccount) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO account_mappings (app_type, source_account, target_account, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(app_type, source_account) 
                DO UPDATE SET target_account = excluded.target_account, updated_at = CURRENT_TIMESTAMP
            `);
            
            stmt.run(appType, sourceAccount, targetAccount);
            logger.info(`Account mapping set: ${appType} ${sourceAccount} -> ${targetAccount}`);
        } catch (error) {
            logger.error('Error setting account mapping:', error);
            throw error;
        }
    }

    /**
     * Remove an account mapping
     * @param {string} appType - Application type
     * @param {string} sourceAccount - Source account number
     */
    removeAccountMapping(appType, sourceAccount) {
        try {
            const stmt = this.db.prepare(
                'DELETE FROM account_mappings WHERE app_type = ? AND source_account = ?'
            );
            
            const result = stmt.run(appType, sourceAccount);
            logger.info(`Account mapping removed: ${appType} ${sourceAccount} (${result.changes} rows)`);
            
            return result.changes > 0;
        } catch (error) {
            logger.error('Error removing account mapping:', error);
            throw error;
        }
    }

    /**
     * Clear all account mappings for a specific app type
     * @param {string} appType - Application type
     */
    clearAccountMappings(appType) {
        try {
            const stmt = this.db.prepare('DELETE FROM account_mappings WHERE app_type = ?');
            const result = stmt.run(appType);
            logger.info(`Cleared ${result.changes} account mappings for ${appType}`);
            
            return result.changes;
        } catch (error) {
            logger.error('Error clearing account mappings:', error);
            throw error;
        }
    }

    /**
     * Bulk insert account mappings (for migration)
     * @param {string} appType - Application type
     * @param {Object} mappings - Mappings object {source: target}
     */
    bulkInsertAccountMappings(appType, mappings) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO account_mappings (app_type, source_account, target_account, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);

            const insert = this.db.transaction((mappingsObj) => {
                for (const [source, target] of Object.entries(mappingsObj)) {
                    stmt.run(appType, source, target);
                }
            });

            insert(mappings);
            logger.info(`Bulk inserted ${Object.keys(mappings).length} account mappings for ${appType}`);
        } catch (error) {
            logger.error('Error bulk inserting account mappings:', error);
            throw error;
        }
    }

    /**
     * Get all cost centre mappings for a specific app type
     * @param {string} appType - Application type
     * @returns {Object} - Mappings as key-value pairs
     */
    getCostCentreMappings(appType) {
        try {
            const stmt = this.db.prepare(
                'SELECT source_code, target_code FROM cost_centre_mappings WHERE app_type = ?'
            );
            const rows = stmt.all(appType);
            
            const mappings = {};
            rows.forEach(row => {
                mappings[row.source_code] = row.target_code;
            });
            
            return mappings;
        } catch (error) {
            logger.error('Error getting cost centre mappings:', error);
            throw error;
        }
    }

    /**
     * Get all cost centre mappings for all app types
     * @returns {Object} - Mappings organized by app type
     */
    getAllCostCentreMappings() {
        try {
            const stmt = this.db.prepare(
                'SELECT app_type, source_code, target_code FROM cost_centre_mappings'
            );
            const rows = stmt.all();
            
            const mappings = {};
            rows.forEach(row => {
                if (!mappings[row.app_type]) {
                    mappings[row.app_type] = {};
                }
                mappings[row.app_type][row.source_code] = row.target_code;
            });
            
            return mappings;
        } catch (error) {
            logger.error('Error getting all cost centre mappings:', error);
            throw error;
        }
    }

    /**
     * Add or update a cost centre mapping
     * @param {string} appType - Application type
     * @param {string} sourceCode - Source cost centre code
     * @param {string} targetCode - Target cost centre code
     */
    setCostCentreMapping(appType, sourceCode, targetCode) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO cost_centre_mappings (app_type, source_code, target_code, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(app_type, source_code) 
                DO UPDATE SET target_code = excluded.target_code, updated_at = CURRENT_TIMESTAMP
            `);
            
            stmt.run(appType, sourceCode, targetCode);
            logger.info(`Cost centre mapping set: ${appType} ${sourceCode} -> ${targetCode}`);
        } catch (error) {
            logger.error('Error setting cost centre mapping:', error);
            throw error;
        }
    }

    /**
     * Remove a cost centre mapping
     * @param {string} appType - Application type
     * @param {string} sourceCode - Source cost centre code
     */
    removeCostCentreMapping(appType, sourceCode) {
        try {
            const stmt = this.db.prepare(
                'DELETE FROM cost_centre_mappings WHERE app_type = ? AND source_code = ?'
            );
            
            const result = stmt.run(appType, sourceCode);
            logger.info(`Cost centre mapping removed: ${appType} ${sourceCode} (${result.changes} rows)`);
            
            return result.changes > 0;
        } catch (error) {
            logger.error('Error removing cost centre mapping:', error);
            throw error;
        }
    }

    /**
     * Clear all cost centre mappings for a specific app type
     * @param {string} appType - Application type
     */
    clearCostCentreMappings(appType) {
        try {
            const stmt = this.db.prepare('DELETE FROM cost_centre_mappings WHERE app_type = ?');
            const result = stmt.run(appType);
            logger.info(`Cleared ${result.changes} cost centre mappings for ${appType}`);
            
            return result.changes;
        } catch (error) {
            logger.error('Error clearing cost centre mappings:', error);
            throw error;
        }
    }

    /**
     * Bulk insert cost centre mappings (for migration)
     * @param {string} appType - Application type
     * @param {Object} mappings - Mappings object {source: target}
     */
    bulkInsertCostCentreMappings(appType, mappings) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO cost_centre_mappings (app_type, source_code, target_code, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);

            const insert = this.db.transaction((mappingsObj) => {
                for (const [source, target] of Object.entries(mappingsObj)) {
                    stmt.run(appType, source, target);
                }
            });

            insert(mappings);
            logger.info(`Bulk inserted ${Object.keys(mappings).length} cost centre mappings for ${appType}`);
        } catch (error) {
            logger.error('Error bulk inserting cost centre mappings:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            logger.info('Database connection closed');
        }
    }

    /**
     * Get database statistics
     * @returns {Object} - Database statistics
     */
    getStats() {
        try {
            const accountCount = this.db.prepare('SELECT COUNT(*) as count FROM account_mappings').get();
            const costCentreCount = this.db.prepare('SELECT COUNT(*) as count FROM cost_centre_mappings').get();
            
            return {
                accountMappings: accountCount.count,
                costCentreMappings: costCentreCount.count,
                databasePath: DB_FILE
            };
        } catch (error) {
            logger.error('Error getting database stats:', error);
            throw error;
        }
    }
}

module.exports = DatabaseService;
