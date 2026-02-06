const XLSX = require('xlsx');
const logger = require('../utils/logger');

/**
 * Process Emce Excel files and transform to Talenom format
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {string} fileName - Original filename
 * @param {Object} accountMappingService - Account mapping service instance
 * @returns {Object} Processing result with vouchers
 */
async function processEmceExcel(fileBuffer, fileName, accountMappingService = null) {
    try {
        logger.info(`Processing Emce Excel file: ${fileName}`);
        
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new Error('Invalid file buffer - buffer is empty or undefined');
        }

        // Read the workbook using xlsx (SheetJS) - more compatible than ExcelJS
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('No worksheets found in the Excel file');
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

        logger.info(`Processing worksheet: ${sheetName} with ${data.length} rows`);

        // Extract date from row 2 (index 1)
        let transactionDate = null;
        if (data.length >= 2 && data[1]) {
            for (const cellValue of data[1]) {
                if (cellValue === null || cellValue === undefined) continue;
                
                if (typeof cellValue === 'string') {
                    // Try to extract a date range like "1.1.2025 - 30.11.2025"
                    // Use the end date of the range as the transaction date
                    const rangeMatch = cellValue.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
                    if (rangeMatch) {
                        transactionDate = rangeMatch[2]; // Use end date
                        logger.info(`Found date range in row 2, using end date: ${transactionDate}`);
                        break;
                    }
                    
                    // Try single date pattern DD.MM.YYYY
                    const singleMatch = cellValue.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
                    if (singleMatch) {
                        transactionDate = singleMatch[1];
                        logger.info(`Found date in row 2: ${transactionDate}`);
                        break;
                    }
                }
            }
        }

        if (!transactionDate) {
            logger.warn('Could not find date in row 2, using current date');
            transactionDate = formatDate(new Date());
        }

        logger.info(`Extracted transaction date: ${transactionDate}`);

        const vouchers = [];
        const currentDate = formatDate(new Date());
        
        // Process all rows looking for "Tili #### yhteensä" patterns
        let processedRows = 0;
        data.forEach((row, rowIndex) => {
            // Skip first few rows (header area)
            if (rowIndex < 2 || !row) return;
            
            processedRows++;
            
            // Check each cell in the row for the pattern "Tili #### yhteensä"
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                const cellValue = row[colIndex];
                if (typeof cellValue === 'string') {
                    const match = cellValue.match(/Tili\s+(\d+)\s+yhteensä/i);
                    if (match) {
                        const accountNumber = match[1];
                        
                        // Get the SALDO value from column J (index 9) in the same row
                        const saldoValue = parseSaldoValue(row[9]);
                        
                        if (saldoValue !== null && saldoValue !== 0) {
                            logger.info(`Found account ${accountNumber} with SALDO ${saldoValue} in row ${rowIndex + 1}`);
                            
                            // Create voucher entry
                            const voucher = {
                                PAIVAMAARA: transactionDate,
                                TILI: accountNumber,
                                SELITE: `Historiasyöttö ${currentDate}`,
                                SALDO: saldoValue,
                                DEBET: saldoValue > 0 ? saldoValue : 0,
                                KREDIT: saldoValue < 0 ? Math.abs(saldoValue) : 0,
                                BRUTTO: saldoValue,
                                TOSITE: 'EMCE-IMPORT',
                                TOSITELAJI: 'ML',
                                ALV_PROSENTTI: 0,
                                ALV_EUR: 0
                            };
                            
                            vouchers.push(voucher);
                        } else {
                            logger.info(`Found account ${accountNumber} but SALDO is 0 or empty in row ${rowIndex + 1}, skipping`);
                        }
                        break; // Only match once per row
                    }
                }
            }
        });

        logger.info(`Processed ${processedRows} rows, found ${vouchers.length} voucher entries from Emce file`);
        
        if (vouchers.length === 0) {
            logger.warn('No valid account entries found in the Emce file');
        }

        return {
            success: true,
            fileName: fileName,
            vouchers: vouchers,
            summary: {
                totalVouchers: vouchers.length,
                transactionDate: transactionDate,
                processedAt: new Date().toISOString()
            }
        };

    } catch (error) {
        logger.error('Error processing Emce Excel file:', error);
        throw error;
    }
}

/**
 * Parse SALDO value from cell, handling various formats
 * @param {*} cellValue - Cell value from Excel
 * @returns {number|null} Parsed number or null
 */
function parseSaldoValue(cellValue) {
    if (cellValue === null || cellValue === undefined || cellValue === '') {
        return null;
    }
    
    if (typeof cellValue === 'number') {
        return cellValue;
    }
    
    if (typeof cellValue === 'string') {
        // Remove common formatting characters and parse
        const cleaned = cellValue.replace(/[^\d.-]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? null : parsed;
    }
    
    return null;
}

/**
 * Parse date from string value
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed date or null
 */
function parseDate(dateString) {
    try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        return null;
    }
}

/**
 * Format date as DD.MM.YYYY
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

module.exports = {
    processEmceExcel,
    parseSaldoValue,
    parseDate,
    formatDate
};