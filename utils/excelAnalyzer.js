const XLSX = require('xlsx');
const logger = require('./logger');

/**
 * Analyze Excel file structure and content
 * @param {string} filePath - Path to the Excel file
 * @returns {object} Analysis results
 */
function analyzeExcelFile(filePath) {
    try {
        logger.info(`Analyzing Excel file: ${filePath}`);
        
        // Read the workbook
        const workbook = XLSX.readFile(filePath);
        
        // Get sheet names
        const sheetNames = workbook.SheetNames;
        logger.info(`Found ${sheetNames.length} sheets: ${sheetNames.join(', ')}`);
        
        const analysis = {
            fileName: filePath.split('/').pop(),
            sheetNames: sheetNames,
            sheets: {}
        };
        
        // Analyze each sheet
        sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Get the range of the sheet
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            
            // Extract headers (first row)
            const headers = [];
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
                const cell = worksheet[cellAddress];
                headers.push(cell ? cell.v : '');
            }
            
            // Extract first few rows of data
            const sampleData = [];
            const maxSampleRows = Math.min(5, range.e.r + 1); // Get first 5 rows or all if less
            
            for (let row = range.s.r; row < maxSampleRows; row++) {
                const rowData = {};
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    const cell = worksheet[cellAddress];
                    const header = headers[col - range.s.c] || `Col_${col}`;
                    rowData[header] = cell ? cell.v : '';
                }
                sampleData.push(rowData);
            }
            
            analysis.sheets[sheetName] = {
                range: `${XLSX.utils.encode_cell(range.s)}:${XLSX.utils.encode_cell(range.e)}`,
                totalRows: range.e.r + 1,
                totalCols: range.e.c + 1,
                headers: headers,
                sampleData: sampleData
            };
        });
        
        return analysis;
        
    } catch (error) {
        logger.error('Error analyzing Excel file:', error);
        throw error;
    }
}

module.exports = {
    analyzeExcelFile
};