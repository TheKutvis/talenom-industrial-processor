const XLSX = require('xlsx');
const logger = require('../utils/logger');

/**
 * Transform Excel data from Esimerkkiseura format to Talenom voucher format
 * @param {Array} rawData - Raw data from Excel file
 * @param {string} sheetName - Name of the processed sheet
 * @param {Object} accountMappingService - Account mapping service instance
 * @param {string} customSelite - Custom SELITE text to use for all rows (optional)
 * @param {string} customTosite - Custom TOSITE text to use for all rows (optional)
 * @returns {Array} - Transformed voucher data
 */
function transformEsimerkkiseuraToTalenomFormat(rawData, sheetName = 'Unknown', accountMappingService = null, customSelite = '', customTosite = '') {
    logger.info(`Transforming Esimerkkiseura data from sheet: ${sheetName}`);
    if (customSelite) {
        logger.info(`Using custom SELITE: "${customSelite}"`);
    }
    if (customTosite) {
        logger.info(`Using custom TOSITE: "${customTosite}"`);
    }
    
    const vouchers = [];
    const groupedTransactions = new Map();
    
    // Filter out empty rows and header row
    const validData = rawData.filter(row => {
        // Row must have either Debet-tili or Kredit-tili, and must have an Arvo
        const hasAccount = (row['Debet-tili'] && row['Debet-tili'] !== 'Debet-tili') || 
                          (row['Kredit-tili'] && row['Kredit-tili'] !== 'Kredit-tili');
        const hasValue = row['Arvo'] && 
                        row['Arvo'] !== 'Arvo' &&
                        row['Arvo'] !== '';
        return hasAccount && hasValue;
    });
    
    logger.info(`Processing ${validData.length} valid transactions`);
    
    // Group transactions by invoice number or date for vouchers
    validData.forEach((row, index) => {
        const invoiceNumber = row['Laskun numero'] || `AUTO-${Date.now()}-${index}`;
        const transactionDate = parseExcelDate(row['Laskun kirjauspäivä'] || row['Maksun kirjauspäivä'] || row['Luotu']);
        const key = `${invoiceNumber}-${transactionDate}`;
        
        if (!groupedTransactions.has(key)) {
            groupedTransactions.set(key, {
                invoiceNumber,
                date: transactionDate,
                transactions: []
            });
        }
        
        groupedTransactions.get(key).transactions.push(row);
    });
    
    // Convert grouped transactions to Talenom voucher format
    groupedTransactions.forEach((group, key) => {
        const voucher = createTalenomVoucherFromEsimerkkiseura(group, accountMappingService, customSelite, customTosite);
        if (voucher) {
            vouchers.push(voucher);
        } else {
            logger.warn(`Failed to create voucher for group: ${key}`);
        }
    });
    
    logger.info(`Created ${vouchers.length} vouchers from ${groupedTransactions.size} transaction groups`);
    return vouchers;
}

/**
 * Parse Excel date number to ISO date string
 * @param {number|string} excelDate - Excel date number or string
 * @returns {string} - ISO date string
 */
function parseExcelDate(excelDate) {
    if (!excelDate) {
        return new Date().toISOString().split('T')[0];
    }
    
    if (typeof excelDate === 'number') {
        // Excel date number (days since 1900-01-01)
        const date = new Date((excelDate - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
    }
    
    if (typeof excelDate === 'string') {
        const date = new Date(excelDate);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    }
    
    return new Date().toISOString().split('T')[0];
}

/**
 * Create a Talenom voucher from grouped Esimerkkiseura transactions
 * @param {object} group - Grouped transaction data
 * @param {Object} accountMappingService - Account mapping service instance
 * @param {string} customSelite - Custom SELITE text to use for all rows (optional)
 * @param {string} customTosite - Custom TOSITE text to use for all rows (optional)
 * @returns {object} - Talenom voucher object
 */
function createTalenomVoucherFromEsimerkkiseura(group, accountMappingService = null, customSelite = '', customTosite = '') {
    try {
        const { invoiceNumber, date, transactions } = group;
        
        // Determine voucher number to use
        const voucherNumber = customTosite || invoiceNumber;
        
        // Calculate totals and create entries
        const voucherRows = [];
        let totalDebit = 0;
        let totalCredit = 0;
        
        transactions.forEach((transaction, index) => {
            const amount = parseFloat(transaction['Arvo']) || 0;
            const vatPercent = parseFloat(transaction['Alv %']) || 0;
            
            // Determine description to use
            const originalDescription = transaction['Nimike'] || transaction['Rivin tyyppi'] || `Debit ${voucherNumber}`;
            const description = customSelite || originalDescription;
            
            // Create debit entry
            if (transaction['Debet-tili']) {
                let debitAccountNumber = String(transaction['Debet-tili']).trim();
                
                // Apply account mapping for esimerkkiseura application
                if (accountMappingService) {
                    debitAccountNumber = accountMappingService.mapAccount('esimerkkiseura', debitAccountNumber);
                }
                
                const debitRow = {
                    accountNumber: debitAccountNumber,
                    accountName: getAccountName(debitAccountNumber),
                    debitAmount: amount,
                    creditAmount: 0,
                    vatPercent: vatPercent,
                    vatAmount: amount * (vatPercent / 100),
                    description: description,
                    projectCode: transaction['Projekti'] || transaction['PROJEKTI'] || '',
                    groupCode: transaction['Ryhmä'] || transaction['RYHMÄ'] || '',
                    invoiceNumber: voucherNumber,
                    rowType: transaction['Rivin tyyppi'] || 'Lasku'
                };
                voucherRows.push(debitRow);
                totalDebit += amount;
            }
            
            // Create credit entry
            if (transaction['Kredit-tili']) {
                let creditAccountNumber = String(transaction['Kredit-tili']).trim();
                
                // Apply account mapping for esimerkkiseura application
                if (accountMappingService) {
                    creditAccountNumber = accountMappingService.mapAccount('esimerkkiseura', creditAccountNumber);
                }
                
                const creditRow = {
                    accountNumber: creditAccountNumber,
                    accountName: getAccountName(creditAccountNumber),
                    debitAmount: 0,
                    creditAmount: amount,
                    vatPercent: vatPercent,
                    vatAmount: amount * (vatPercent / 100),
                    description: description,
                    projectCode: transaction['Projekti'] || transaction['PROJEKTI'] || '',
                    groupCode: transaction['Ryhmä'] || transaction['RYHMÄ'] || '',
                    invoiceNumber: voucherNumber,
                    rowType: transaction['Rivin tyyppi'] || 'Lasku'
                };
                voucherRows.push(creditRow);
                totalCredit += amount;
            }
        });
        
        // Create the main voucher structure
        const voucher = {
            voucherNumber: voucherNumber,
            voucherDate: date,
            voucherStateCID: "Draft",
            description: `Esimerkkiseura import - ${voucherNumber}`,
            totalDebit: totalDebit,
            totalCredit: totalCredit,
            isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
            voucherRows: voucherRows,
            source: "Esimerkkiseura Excel Import",
            importDate: new Date().toISOString(),
            originalTransactionCount: transactions.length
        };
        
        return voucher;
        
    } catch (error) {
        logger.error('Error creating voucher from Esimerkkiseura data:', error);
        logger.error('Error details:', {
            message: error.message,
            stack: error.stack,
            customSelite: customSelite,
            customTosite: customTosite
        });
        return null;
    }
}

/**
 * Get account name based on account number (simplified mapping)
 * @param {string|number} accountNumber - Account number
 * @returns {string} - Account name
 */
function getAccountName(accountNumber) {
    const accountMap = {
        '1700': 'Myyntisaamiset',
        '1910': 'Käteinen',
        '3012': 'Kurssitulot',
        '5011': 'Vuokrakulut',
        '1500': 'Koneet ja kalusto',
        '2000': 'Ostovelat',
        '1600': 'Siirtosaamiset',
        '2900': 'Siirtovelat'
    };
    
    return accountMap[String(accountNumber)] || `Tili ${accountNumber}`;
}

/**
 * Process Excel file in Esimerkkiseura format
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {string} fileName - Original file name
 * @param {Object} accountMappingService - Account mapping service instance
 * @param {string} sheetSelection - Which sheets to process: 'both', 'kirjanpito', or 'erittely'
 * @param {string} customSelite - Custom SELITE text to use for all rows (optional)
 * @param {string} customTosite - Custom TOSITE text to use for all rows (optional)
 * @returns {object} - Processing results
 */
function processEsimerkkiseuraExcel(fileBuffer, fileName, accountMappingService = null, sheetSelection = 'both', customSelite = '', customTosite = '') {
    try {
        logger.info(`Processing Esimerkkiseura Excel file: ${fileName}`);
        logger.info(`Sheet selection: ${sheetSelection}`);
        if (customSelite) {
            logger.info(`Using custom SELITE: "${customSelite}"`);
        }
        if (customTosite) {
            logger.info(`Using custom TOSITE: "${customTosite}"`);
        }
        
        // Read the workbook
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetNames = workbook.SheetNames;
        
        logger.info(`Found sheets: ${sheetNames.join(', ')}`);
        
        // Filter sheets based on selection
        let sheetsToProcess = sheetNames;
        if (sheetSelection === 'kirjanpito') {
            sheetsToProcess = sheetNames.filter(name => 
                name.toLowerCase() === 'kirjanpito'
            );
            logger.info(`Sheet selection: kirjanpito. Matching sheets: ${sheetsToProcess.join(', ') || 'none'}`);
        } else if (sheetSelection === 'erittely') {
            sheetsToProcess = sheetNames.filter(name => 
                name.toLowerCase() === 'erittely'
            );
            logger.info(`Sheet selection: erittely. Matching sheets: ${sheetsToProcess.join(', ') || 'none'}`);
        } else {
            logger.info(`Sheet selection: both. Processing all sheets: ${sheetsToProcess.join(', ')}`);
        }
        
        if (sheetsToProcess.length === 0) {
            logger.warn(`No sheets found matching selection: ${sheetSelection}. Available sheets: ${sheetNames.join(', ')}`);
            sheetsToProcess = sheetNames; // Fallback to all sheets
        }
        
        let allVouchers = [];
        const sheetResults = {};
        
        // Process each sheet
        sheetsToProcess.forEach(sheetName => {
            logger.info(`Processing sheet: ${sheetName}`);
            
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON with headers
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: ''
            });
            
            if (jsonData.length < 2) {
                logger.warn(`Sheet ${sheetName} has insufficient data`);
                return;
            }
            
            // Get headers from first row
            const headers = jsonData[0];
            
            // Convert remaining rows to objects
            const data = jsonData.slice(1).map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index] || '';
                });
                return obj;
            });
            
            // Transform the data
            const vouchers = transformEsimerkkiseuraToTalenomFormat(data, sheetName, accountMappingService, customSelite, customTosite);
            
            sheetResults[sheetName] = {
                originalRowCount: data.length,
                voucherCount: vouchers.length,
                vouchers: vouchers
            };
            
            allVouchers = allVouchers.concat(vouchers);
        });
        
        logger.info(`Total vouchers created: ${allVouchers.length}`);
        
        return {
            success: true,
            fileName: fileName,
            totalSheets: sheetsToProcess.length,
            totalVouchers: allVouchers.length,
            sheetResults: sheetResults,
            vouchers: allVouchers,
            processedAt: new Date().toISOString(),
            sheetSelection: sheetSelection
        };
        
    } catch (error) {
        logger.error('Error processing Esimerkkiseura Excel file:', error);
        throw error;
    }
}

/**
 * Generate Excel file from Esimerkkiseura vouchers in main application format
 * @param {Array} vouchers - Array of voucher objects
 * @param {string} originalFileName - Original file name for naming
 * @returns {Buffer} - Excel file buffer
 */
function generateEsimerkkiseuraExcel(vouchers, originalFileName) {
    try {
        const XLSX = require('xlsx');
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Flatten voucher data into rows for Excel using main application format
        const excelData = [];
        
        // Add headers matching main application format
        const headers = [
            'TILI',      // Account number
            'TOSITE',    // Voucher number
            'PVM',       // Date
            'BRUTTO',    // Gross amount (debit - credit)
            'SELITE',    // Description
            'KP',        // Cost center
            'KL',        // Cost type  
            'PROJ',      // Project
            'PLAJI',     // Project type
            'AVAIN'      // Match key
        ];
        excelData.push(headers);
        
        // Process each voucher
        vouchers.forEach(voucher => {
            voucher.voucherRows.forEach(row => {
                const debit = parseFloat(row.debitAmount) || 0;
                const credit = parseFloat(row.creditAmount) || 0;
                const brutto = debit - credit;
                
                // Format date from YYYY-MM-DD to DD.MM.YYYY
                let formattedDate = voucher.voucherDate || '';
                if (formattedDate && formattedDate.includes('-')) {
                    const parts = formattedDate.split('-');
                    if (parts.length === 3) {
                        formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                    }
                }
                
                const excelRow = [
                    row.accountNumber || '',                    // TILI
                    voucher.voucherNumber || '',               // TOSITE
                    formattedDate,                             // PVM
                    brutto,                                    // BRUTTO
                    row.description || '',                     // SELITE
                    '', // KP (cost center - not available in Esimerkkiseura)
                    '', // KL (cost type - not available in Esimerkkiseura)
                    row.projectCode || '',                     // PROJ
                    '', // PLAJI (project type - not available in Esimerkkiseura)
                    ''  // AVAIN (match key - not needed for Esimerkkiseura)
                ];
                excelData.push(excelRow);
            });
        });
        
        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        
        // Set column widths matching main application
        const columnWidths = [
            { wch: 8 },  // TILI
            { wch: 10 }, // TOSITE
            { wch: 12 }, // PVM
            { wch: 12 }, // BRUTTO
            { wch: 25 }, // SELITE
            { wch: 15 }, // KP
            { wch: 12 }, // KL
            { wch: 15 }, // PROJ
            { wch: 15 }, // PLAJI
            { wch: 20 }  // AVAIN
        ];
        worksheet['!cols'] = columnWidths;
        
        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Kirjanpitodata');
        
        // Generate Excel file buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        return buffer;
        
    } catch (error) {
        logger.error('Error generating Esimerkkiseura Excel file:', error);
        throw error;
    }
}

module.exports = {
    processEsimerkkiseuraExcel,
    transformEsimerkkiseuraToTalenomFormat,
    parseExcelDate,
    getAccountName,
    generateEsimerkkiseuraExcel
};