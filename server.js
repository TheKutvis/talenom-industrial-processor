const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ApiClient = require('./services/apiClient');
const logger = require('./utils/logger');
const AccountMappingService = require('./services/accountMappingService');
const JatkoPasiProcessor = require('./services/jatkoPasiProcessor');
const i18nService = require('./services/i18nService');

const app = express();
const PORT = process.env.PORT || 3000;

// Store processed data for template generation
let lastProcessedData = null;
let lastTransformedData = null;
let lastProcessedFileName = null;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Serve audio files from root directory
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (path.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the Esimerkkiseura sub-application
app.get('/esimerkkiseura', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'esimerkkiseura.html'));
});

// Serve the Jatko-PASI processor
app.get('/jatko-pasi', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jatko-pasi.html'));
});

// File upload configuration
const storage = multer.memoryStorage();

// File filter for main application (CSV and Excel)
const mainFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/csv',
    'text/plain', // CSV files often detected as text/plain
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  // Also check file extension
  const fileExtension = file.originalname.toLowerCase().split('.').pop();
  const allowedExtensions = ['csv', 'xlsx', 'xls'];
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'), false);
  }
};

// File filter for Esimerkkiseura (Excel only)
const esimerkkiseuraFileFilter = (req, file, cb) => {
  logger.info(`Esimerkkiseura file upload - MIME type: ${file.mimetype}, Original name: ${file.originalname}`);
  
  const allowedTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream' // Allow this for files that aren't properly detected by curl
  ];
  
  // Check file extension as additional validation
  const fileExtension = file.originalname.toLowerCase().split('.').pop();
  const allowedExtensions = ['xlsx', 'xls'];
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    logger.info('File type validation passed');
    cb(null, true);
  } else {
    logger.error(`File type validation failed. Received: ${file.mimetype}, Extension: ${fileExtension}, Expected MIME: ${allowedTypes.join(', ')}, Expected extensions: ${allowedExtensions.join(', ')}`);
    cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are supported for Esimerkkiseura format'), false);
  }
};

// Main application upload configuration
const upload = multer({
  storage: storage,
  fileFilter: mainFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Esimerkkiseura upload configuration
const uploadEsimerkkiseura = multer({
  storage: storage,
  fileFilter: esimerkkiseuraFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// File filter for Jatko-PASI (CSV files)
const jatkoPasiFileFilter = (req, file, cb) => {
  logger.info(`Jatko-PASI file upload - MIME type: ${file.mimetype}, Original name: ${file.originalname}`);
  
  const allowedTypes = [
    'text/csv',
    'text/plain', // CSV files often detected as text/plain
    'application/csv'
  ];
  
  // Check file extension as additional validation
  const fileExtension = file.originalname.toLowerCase().split('.').pop();
  const allowedExtensions = ['csv'];
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    logger.info('Jatko-PASI file type validation passed');
    cb(null, true);
  } else {
    logger.error(`Jatko-PASI file type validation failed. Received: ${file.mimetype}, Extension: ${fileExtension}, Expected MIME: ${allowedTypes.join(', ')}, Expected extensions: ${allowedExtensions.join(', ')}`);
    cb(new Error('Invalid file type. Only CSV files (.csv) are supported for Jatko-PASI format'), false);
  }
};

// Jatko-PASI upload configuration
const uploadJatkoPasi = multer({
  storage: storage,
  fileFilter: jatkoPasiFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize API client
const apiClient = new ApiClient();

// Initialize i18n
async function initializeI18n() {
  try {
    await i18nService.init();
    logger.info('🌍 Internationalization system initialized');
    
    // Add i18n middleware
    app.use(i18nService.getMiddleware());
    
  } catch (error) {
    logger.error('Failed to initialize i18n:', error);
  }
}

// Translation API routes
app.get('/api/translations/:lng/:ns', (req, res) => {
  const { lng, ns } = req.params;
  const i18n = i18nService.getInstance();
  
  try {
    const translations = i18n.getResourceBundle(lng, ns);
    res.json(translations || {});
  } catch (error) {
    logger.error('Error fetching translations:', error);
    res.status(404).json({ error: 'Translations not found' });
  }
});

// Initialize i18n before starting server
initializeI18n();

// Routes

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve original page for backup
app.get('/original', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index-old.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Test endpoint for debugging
app.get('/api/test', (req, res) => {
  logger.info('GET Test endpoint hit');
  res.json({ success: true, message: 'GET Test endpoint working' });
});

app.post('/api/test', (req, res) => {
  logger.info('POST Test endpoint hit');
  res.json({ success: true, message: 'POST Test endpoint working' });
});

// Get general ledger events
app.post('/api/general-ledger-events', async (req, res) => {
  try {
    const { organizationNumber, ...queryParams } = req.body;
    
    if (!organizationNumber) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Organization number is required'
      });
    }

    logger.info(`Fetching general ledger events for organization: ${organizationNumber}`);
    
    const result = await apiClient.getGeneralLedgerEvents(organizationNumber, queryParams);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching general ledger events:', error);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || error.message || 'Internal server error';
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.response?.data?.code,
      telemetryId: error.response?.data?.telemetryId,
      timestamp: new Date().toISOString()
    });
  }
});

// Get account balances
app.post('/api/account-balances', async (req, res) => {
  try {
    const { organizationNumber, date, accountNumbers, language } = req.body;
    
    if (!organizationNumber || !date || !accountNumbers) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Organization number, date, and account numbers are required'
      });
    }

    logger.info(`Fetching account balances for organization: ${organizationNumber}`);
    
    const result = await apiClient.getAccountBalances(organizationNumber, { date, accountNumbers, language });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching account balances:', error);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || error.message || 'Internal server error';
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.response?.data?.code,
      telemetryId: error.response?.data?.telemetryId,
      timestamp: new Date().toISOString()
    });
  }
});

// Get chart of accounts
app.post('/api/chart-of-accounts', async (req, res) => {
  try {
    const { organizationNumber, fromDate, toDate, language } = req.body;
    
    if (!organizationNumber) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Organization number is required'
      });
    }

    logger.info(`Fetching chart of accounts for organization: ${organizationNumber}`);
    
    const result = await apiClient.getChartOfAccounts(organizationNumber, { fromDate, toDate, language });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching chart of accounts:', error);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || error.message || 'Internal server error';
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.response?.data?.code,
      telemetryId: error.response?.data?.telemetryId,
      timestamp: new Date().toISOString()
    });
  }
});

// Validate CSV data structure for Finnish accounting format
function validateAccountingData(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('No data found in file');
  }

  // Expected Finnish accounting columns
  const requiredColumns = ['Tili', 'Nimi', 'Päiväys', 'Tositelaji', 'Tosite', 'ALV-%', 'ALV(EUR)', 'Debet', 'Kredit', 'Selite'];
  const optionalColumns = ['ALV-tunnus', 'Saldo', 'Kustannuspaikat'];
  
  // Check first row for required columns
  const firstRow = rawData[0];
  const availableColumns = Object.keys(firstRow);
  
  console.log('Available columns:', availableColumns);
  console.log('Required columns:', requiredColumns);
  
  // Check if we have the minimum required columns
  const missingRequired = requiredColumns.filter(col => !availableColumns.includes(col));
  
  if (missingRequired.length > 0) {
    throw new Error(`Invalid file format. Missing required columns: ${missingRequired.join(', ')}. Expected Finnish accounting CSV with columns: ${requiredColumns.join(', ')}`);
  }

  // Validate that we have actual accounting data (check account numbers)
  let validAccountingRows = 0;
  const sampleRows = rawData.slice(0, Math.min(5, rawData.length)); // Check first 5 rows
  
  for (const row of sampleRows) {
    const accountNumber = String(row['Tili'] || '').trim();
    const debit = String(row['Debet'] || '0').replace(',', '.').replace('-', '0');
    const credit = String(row['Kredit'] || '0').replace(',', '.').replace('-', '0');
    const description = String(row['Selite'] || '').trim();
    
    // Check if this looks like accounting data
    if (accountNumber.match(/^\d{4}$/) && // 4-digit account number
        (parseFloat(debit) > 0 || parseFloat(credit) > 0) && // Has monetary amounts
        description.length > 0) { // Has description
      validAccountingRows++;
    }
  }
  
  if (validAccountingRows === 0) {
    throw new Error('File does not contain valid Finnish accounting data. Expected 4-digit account numbers, monetary amounts, and transaction descriptions.');
  }
  
  console.log(`Validation passed: ${validAccountingRows}/${sampleRows.length} rows contain valid accounting data`);
  return true;
}

// Transform CSV/Excel data to Talenom voucher format
function transformToTalenomFormat(rawData) {
  const vouchers = [];
  
  rawData.forEach((row, index) => {
    // Debug: Log the structure of each row
    console.log(`Row ${index}:`, JSON.stringify(row, null, 2));
    
    // Extract data directly from CSV columns (csv-parser handles semicolon separation)
    let accountNumber = String(row['Tili'] || '1000').trim();
    const description = String(row['Selite'] || 'Transaction').trim();
    const date = String(row['Päiväys'] || new Date().toISOString().split('T')[0]).trim();
    
    // Apply account mapping for main application
    accountNumber = accountMappingService.mapAccount('main', accountNumber);
    
    // Handle Finnish decimal format (comma instead of dot) and clean string values
    const debitStr = String(row['Debet'] || '0').replace(',', '.').replace('-', '0');
    const creditStr = String(row['Kredit'] || '0').replace(',', '.').replace('-', '0');
    const vatAmountStr = String(row['ALV(EUR)'] || '0').replace(',', '.');
    
    const debitAmount = parseFloat(debitStr) || 0;
    const creditAmount = parseFloat(creditStr) || 0;
    const vatAmount = parseFloat(vatAmountStr) || 0;
    
    // Parse VAT percentage (remove % sign and handle Finnish decimal format)
    const vatPercentageStr = String(row['ALV-%'] || '0').replace('%', '').replace(' ', '').replace(',', '.');
    const vatPercentage = parseFloat(vatPercentageStr) || 0;
    
    const referenceNumber = String(row['Tosite'] || `REF${String(index + 1).padStart(3, '0')}`).trim();
    const costCenter = String(row['Kustannuspaikat'] || '').trim();
    
    // Calculate amounts - use the larger of debit/credit as the main amount
    const netAmount = Math.max(debitAmount, creditAmount);
    const vatIncludedAmount = netAmount + vatAmount;
    
    console.log(`Parsed values for row ${index}:`, {
      accountNumber,
      description,
      date,
      debitAmount,
      creditAmount,
      netAmount,
      vatAmount,
      vatPercentage,
      referenceNumber,
      costCenter
    });
    
    // Create Talenom voucher format
    const voucher = {
      id: null,
      tryAccept: true,
      generateMissingDimensionValues: false,
      denyCreationOfLedgerItems: false,
      categoryCID: "Receipts",
      voucherStateCID: "Draft",
      voucherNumber: null,
      voucherDate: date,
      invoiceNumber: referenceNumber,
      referenceNumber: referenceNumber,
      description: description,
      customerComment: null,
      customerCommentToAccounting: null,
      accountingComment: null,
      vatIncludedAmount: vatIncludedAmount,
      vatAmount: vatAmount,
      postings: [{
        id: null,
        accountNumber: accountNumber,
        vatPercentage: vatPercentage > 0 ? vatPercentage : null,
        isReadOnly: false,
        description: description,
        vatIncludedAmount: vatIncludedAmount,
        matchKey: null, // Don't auto-populate matchKey from CSV data
        costCenter: costCenter || null,
        costType: null,
        project: null, // Keep project separate from cost center
        projectType: null // Don't automatically populate from Tositelaji
      }],
      acceptor: null,
      preventVatPeeling: false,
      preventVoucherAutomation: false,
      voucherImageBase64Str: null,
      voucherDetail: {
        rows: [{
          description: description,
          vatIncludedAmount: netAmount,
          vatAmount: vatAmount,
          vatPercentage: vatPercentage
        }],
        others: [],
        payments: [],
        dimensions: costCenter ? [{
          totalAmount: netAmount,
          dimensionPercentage: null,
          costCenter: costCenter,
          costType: null,
          project: null, // Keep project separate from cost center
          projectType: null // Don't automatically populate
        }] : [],
        sender: null,
        receiver: null,
        invoiceDate: date,
        dueDate: null,
        deliveryDate: null,
        deliveryPeriodStart: null,
        deliveryPeriodEnd: null,
        sellerDetail: null,
        vatIncludedAmount: vatIncludedAmount,
        vatAmount: vatAmount,
        creatorName: null,
        paymentDate: null,
        paymentMessage: null,
        originalPaymentCurrencyCode: "EUR",
        originalPaymentVatIncludedAmount: vatIncludedAmount,
        costType: null,
        vatIncludedAmountGeneralVat: vatPercentage === 24 ? vatIncludedAmount : 0,
        vatIncludedAmountLower1Vat: vatPercentage === 14 ? vatIncludedAmount : 0,
        vatIncludedAmountLower2Vat: vatPercentage === 10 ? vatIncludedAmount : 0,
        vatIncludedAmountZeroVat: vatPercentage === 0 ? vatIncludedAmount : 0,
        vatIncludedAmountReverseVat: 0,
        vatIncludedAmountMargin: 0,
        vatExcludedAmount: netAmount,
        vatExcludedAmountGeneralVat: vatPercentage === 24 ? netAmount : 0,
        vatExcludedAmountLower1Vat: vatPercentage === 14 ? netAmount : 0,
        vatExcludedAmountLower2Vat: vatPercentage === 10 ? netAmount : 0,
        vatExcludedAmountZeroVat: vatPercentage === 0 ? netAmount : 0,
        vatExcludedAmountReverseVat: 0,
        vatExcludedAmountMargin: 0,
        vatAmountGeneralVat: vatPercentage === 24 ? vatAmount : 0,
        vatAmountLower1Vat: vatPercentage === 14 ? vatAmount : 0,
        vatAmountLower2Vat: vatPercentage === 10 ? vatAmount : 0,
        vatAmountZeroVat: 0,
        vatAmountReverseVat: 0,
        vatAmountMargin: 0,
        paymentCardNumberLastDigits: null,
        paymentTransactionType: null,
        senderBusinessId: null,
        senderVatId: null,
        senderStreetAddress: null,
        senderPostalCode: null,
        senderPostalCity: null,
        senderBankAccountNumber: null,
        receiverBusinessId: null,
        receiverVatId: null,
        receiverStreetAddress: null,
        receiverPostalCode: null,
        receiverPostalCity: null,
        receiverBankAccountNumber: null,
        deliveryStreetAddress: null,
        deliveryPostalCode: null,
        deliveryPostalCity: null
      }
    };
    
    vouchers.push(voucher);
  });
  
  return vouchers;
}

// Upload and parse CSV/Excel files
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  logger.info('Upload request received');
  logger.info('Request headers:', JSON.stringify(req.headers));
  logger.info('Request file:', req.file ? 'File received' : 'No file');
  
  try {
    if (!req.file) {
      logger.error('No file in request');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded'
      });
    }

    const buffer = req.file.buffer;
    const originalName = req.file.originalname;
    let data = [];

    logger.info(`Processing uploaded file: ${originalName}`);

    if (originalName.endsWith('.csv')) {
      // Parse CSV with semicolon separator (Finnish CSV format)
      const csvString = buffer.toString('utf8');
      data = await new Promise((resolve, reject) => {
        const results = [];
        const Readable = require('stream').Readable;
        const csvStream = new Readable();
        csvStream.push(csvString);
        csvStream.push(null);
        
        csvStream
          .pipe(csv({ separator: ';' }))
          .on('data', (row) => results.push(row))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      // Parse Excel from buffer
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
    }

    // Validate that the data contains proper Finnish accounting structure
    validateAccountingData(data);

    // Transform data to Talenom format
    const transformedData = transformToTalenomFormat(data);
    
    // Store processed data for template download
    lastProcessedData = data; // Store original data in template format
    lastTransformedData = transformedData; // Store transformed JSON data
    lastProcessedFileName = originalName.replace(/\.[^/.]+$/, '') + '_processed.xlsx';

    res.json({
      success: true,
      data: transformedData,
      rawData: data, // Keep original for debugging
      fileName: originalName,
      rowCount: transformedData.length,
      timestamp: new Date().toISOString(),
      hasProcessedTemplate: true // Indicate template is available
    });

  } catch (error) {
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    logger.error('Error processing uploaded file:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded file',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Download populated template endpoint
app.get('/api/download-populated-template', (req, res) => {
  try {
    logger.info('Populated template download request received');
    
    if (!lastProcessedData || lastProcessedData.length === 0 || !lastTransformedData) {
      return res.status(404).json({
        success: false,
        error: 'No processed data available',
        message: 'Please process a file first before downloading the populated template'
      });
    }
    
    // Transform data to the new Finnish accounting format using JSON data as primary source
    const formattedData = lastTransformedData.map((transformedRow, index) => {
      // Get corresponding raw data for BRUTTO calculation
      const rawRow = lastProcessedData[index];
      const debet = parseFloat(String(rawRow['Debet'] || '0').replace(',', '.')) || 0;
      const kredit = parseFloat(String(rawRow['Kredit'] || '0').replace(',', '.')) || 0;
      const brutto = debet - kredit;
      
      // Extract data from JSON structure
      const accountingEntry = transformedRow.postings && transformedRow.postings[0];
      const voucherDetail = transformedRow.voucherDetail;
      const dimension = voucherDetail && voucherDetail.dimensions && voucherDetail.dimensions[0];
      
      // Log the structure for debugging (first row only)
      if (index === 0) {
        logger.info('Sample JSON structure for Excel mapping:', {
          accountingEntry: accountingEntry ? {
            accountNumber: accountingEntry.accountNumber,
            costCenter: accountingEntry.costCenter,
            costType: accountingEntry.costType,
            project: accountingEntry.project,
            projectType: accountingEntry.projectType,
            matchKey: accountingEntry.matchKey
          } : null,
          voucherInfo: {
            voucherNumber: transformedRow.voucherNumber,
            voucherDate: transformedRow.voucherDate,
            description: transformedRow.description,
            invoiceNumber: transformedRow.invoiceNumber
          },
          dimension: dimension ? {
            costCenter: dimension.costCenter,
            costType: dimension.costType,
            project: dimension.project,
            projectType: dimension.projectType
          } : null
        });
      }
      
      return {
        'TILI': String(accountingEntry?.accountNumber || '').trim(),
        'TOSITE': String(transformedRow.voucherNumber || transformedRow.invoiceNumber || transformedRow.referenceNumber || '').trim(),
        'PVM': String(transformedRow.voucherDate || '').trim(),
        'BRUTTO': brutto,
        'SELITE': String(transformedRow.description || '').trim(),
        'KP': String(accountingEntry?.costCenter || dimension?.costCenter || '').trim(),
        'KL': String(accountingEntry?.costType || dimension?.costType || '').trim(),
        'PROJ': String(accountingEntry?.project || dimension?.project || '').trim(),
        'PLAJI': String(accountingEntry?.projectType || dimension?.projectType || '').trim(),
        'AVAIN': String(accountingEntry?.matchKey || '').trim(),
        'KONSYR': '' // Empty as requested
      };
    });
    
    // Create workbook and worksheet with formatted data
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    
    // Set column widths optimized for the new format
    const columnWidths = [
      { wch: 8 },   // TILI
      { wch: 12 },  // TOSITE
      { wch: 12 },  // PVM
      { wch: 15 },  // BRUTTO
      { wch: 35 },  // SELITE
      { wch: 15 },  // KP
      { wch: 12 },  // KL
      { wch: 15 },  // PROJ
      { wch: 15 },  // PLAJI
      { wch: 20 },  // AVAIN
      { wch: 10 }   // KONSYR
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kirjanpitodata');
    
    // Generate Excel file buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${lastProcessedFileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    
    logger.info(`Populated template file sent: ${lastProcessedFileName}`);
    res.send(buffer);
    
  } catch (error) {
    logger.error('Error generating populated template file:', error);
    res.status(500).json({
      success: false,
      error: 'Populated template generation failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Template download endpoint
app.get('/api/download-template', (req, res) => {
  try {
    logger.info('Template download request received');
    
    // Define the required columns and sample data
    const requiredColumns = ['Tili', 'Nimi', 'Päiväys', 'Tositelaji', 'Tosite', 'ALV-%', 'ALV(EUR)', 'Debet', 'Kredit', 'Selite'];
    
    // Create sample data with Finnish accounting format
    const sampleData = [
      {
        'Tili': '1702',
        'Nimi': 'Myyntisaamiset',
        'Päiväys': '1.1.2025',
        'Tositelaji': 'Myyntilasku',
        'Tosite': '1',
        'ALV-%': '24 %',
        'ALV(EUR)': '240',
        'Debet': '1240',
        'Kredit': '0',
        'Selite': 'Tuotteiden myynti'
      },
      {
        'Tili': '3000',
        'Nimi': 'Liikevaihto',
        'Päiväys': '1.1.2025',
        'Tositelaji': 'Myyntilasku',
        'Tosite': '1',
        'ALV-%': '24 %',
        'ALV(EUR)': '240',
        'Debet': '0',
        'Kredit': '1000',
        'Selite': 'Tuotteiden myynti'
      },
      {
        'Tili': '2939',
        'Nimi': 'Arvonlisäverovelka',
        'Päiväys': '1.1.2025',
        'Tositelaji': 'Myyntilasku',
        'Tosite': '1',
        'ALV-%': '24 %',
        'ALV(EUR)': '240',
        'Debet': '0',
        'Kredit': '240',
        'Selite': 'Tuotteiden myynti ALV'
      }
    ];
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Set column widths for better readability
    const columnWidths = [
      { wch: 8 },   // Tili
      { wch: 20 },  // Nimi
      { wch: 12 },  // Päiväys
      { wch: 15 },  // Tositelaji
      { wch: 8 },   // Tosite
      { wch: 8 },   // ALV-%
      { wch: 10 },  // ALV(EUR)
      { wch: 12 },  // Debet
      { wch: 12 },  // Kredit
      { wch: 30 }   // Selite
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kirjanpitodata');
    
    // Generate Excel file buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename="mallitiedosto_tuonti.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    
    logger.info('Template file generated successfully');
    res.send(buffer);
    
  } catch (error) {
    logger.error('Error generating template file:', error);
    res.status(500).json({
      success: false,
      error: 'Template generation failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Esimerkkiseura Excel upload endpoint
app.post('/api/upload-esimerkkiseura', uploadEsimerkkiseura.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please select an Excel file to upload'
      });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    
    logger.info(`Esimerkkiseura file upload started: ${originalname}`, {
      size: `${(size / 1024).toFixed(1)} KB`,
      mimetype
    });

    // Validate file type (additional check - primary validation is in multer filter)
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream' // For files that aren't properly detected
    ];

    // Also check file extension
    const fileExtension = originalname.toLowerCase().split('.').pop();
    const allowedExtensions = ['xlsx', 'xls'];

    if (!allowedTypes.includes(mimetype) || !allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'Only Excel files (.xlsx, .xls) are supported for Esimerkkiseura format'
      });
    }

    // Process the Excel file using Esimerkkiseura processor
    const { processEsimerkkiseuraExcel, generateEsimerkkiseuraExcel } = require('./services/esimerkkiseuraProcessor');
    const result = await processEsimerkkiseuraExcel(buffer, originalname, accountMappingService);

    // Store processed data globally for download
    lastProcessedJsonData = result.vouchers;
    lastProcessedFileName = `esimerkkiseura_processed_${originalname.replace(/\.[^/.]+$/, '')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;

    const processingTime = Date.now() - startTime;
    
    logger.info('Esimerkkiseura file processed successfully', {
      fileName: originalname,
      totalVouchers: result.totalVouchers,
      totalSheets: result.totalSheets,
      processingTime: `${processingTime}ms`
    });

    // Check if Excel format is requested
    const format = req.query.format;
    if (format === 'excel') {
      try {
        // Generate Excel file
        const excelBuffer = generateEsimerkkiseuraExcel(result.vouchers, originalname);
        
        // Set response headers for Excel download
        const excelFileName = `esimerkkiseura_processed_${originalname.replace(/\.[^/.]+$/, '')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Length', excelBuffer.length);
        
        logger.info(`Esimerkkiseura Excel file generated: ${excelFileName}`);
        return res.send(excelBuffer);
        
      } catch (excelError) {
        logger.error('Error generating Esimerkkiseura Excel file:', excelError);
        return res.status(500).json({
          success: false,
          error: 'Excel generation failed',
          message: excelError.message,
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Default JSON response
    res.json({
      success: true,
      message: 'Esimerkkiseura Excel file processed successfully',
      fileName: originalname,
      totalSheets: result.totalSheets,
      totalVouchers: result.totalVouchers,
      sheetResults: result.sheetResults,
      data: result.vouchers,
      rowCount: result.totalVouchers,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Esimerkkiseura file processing failed:', {
      error: error.message,
      processingTime: `${processingTime}ms`,
      fileName: req.file?.originalname
    });

    res.status(500).json({
      success: false,
      error: 'File processing failed',
      message: error.message,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// Download Esimerkkiseura processed Excel file endpoint
app.get('/api/download-esimerkkiseura-excel', (req, res) => {
  try {
    logger.info('Esimerkkiseura Excel download request received');
    
    if (!lastProcessedJsonData || lastProcessedJsonData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No processed Esimerkkiseura data available',
        message: 'Please process an Esimerkkiseura Excel file first before downloading'
      });
    }

    // Generate Excel file
    const { generateEsimerkkiseuraExcel } = require('./services/esimerkkiseuraProcessor');
    const excelBuffer = generateEsimerkkiseuraExcel(lastProcessedJsonData, lastProcessedFileName || 'esimerkkiseura');
    
    // Set response headers for Excel download
    const downloadFileName = lastProcessedFileName || `esimerkkiseura_processed_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', excelBuffer.length);
    
    logger.info(`Esimerkkiseura Excel download sent: ${downloadFileName}`);
    res.send(excelBuffer);
    
  } catch (error) {
    logger.error('Error generating Esimerkkiseura Excel download:', error);
    res.status(500).json({
      success: false,
      error: 'Excel download failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Jatko-PASI processing endpoint
app.post('/api/process-jatko-pasi', uploadJatkoPasi.array('files'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
        message: 'Please select CSV files to upload for Jatko-PASI processing'
      });
    }

    logger.info(`Jatko-PASI processing started with ${req.files.length} files`);

    // Create a temporary workspace directory
    const workspaceDir = path.join(__dirname, 'temp', `jatko-pasi-${Date.now()}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    try {
      // Save uploaded files to workspace
      for (const file of req.files) {
        const filePath = path.join(workspaceDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);
        logger.info(`Saved file: ${file.originalname}`);
      }

      // Initialize and run Jatko-PASI processor
      const processor = new JatkoPasiProcessor();
      const result = await processor.processFiles(workspaceDir);

      const processingTime = Date.now() - startTime;
      
      logger.info('Jatko-PASI processing completed successfully', {
        processingTime: `${processingTime}ms`,
        outputFile: result.outputFile,
        processedRecords: result.processedRecords
      });

      res.json({
        success: true,
        message: result.message,
        inputFiles: result.inputFiles,
        outputFile: result.outputFile,
        processedRecords: result.processedRecords,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      });

    } finally {
      // Clean up temporary files (optional - keep for download)
      // fs.rmSync(workspaceDir, { recursive: true, force: true });
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Jatko-PASI processing failed:', {
      error: error.message,
      processingTime: `${processingTime}ms`,
      files: req.files?.map(f => f.originalname)
    });

    res.status(500).json({
      success: false,
      error: 'Jatko-PASI processing failed',
      message: error.message,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// Download Jatko-PASI result file endpoint
app.get('/api/download-jatko-pasi-result/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    logger.info(`Jatko-PASI download request for: ${filename}`);
    
    // Find the file in temp directories
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: 'The requested file could not be found'
      });
    }

    let filePath = null;
    const tempDirs = fs.readdirSync(tempDir).filter(item => 
      fs.statSync(path.join(tempDir, item)).isDirectory() && item.startsWith('jatko-pasi-')
    );

    for (const dir of tempDirs) {
      const possiblePath = path.join(tempDir, dir, filename);
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: 'The requested Jatko-PASI result file could not be found'
      });
    }

    // Set response headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    logger.info(`Jatko-PASI file download sent: ${filename}`);
    
  } catch (error) {
    logger.error('Error downloading Jatko-PASI result file:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send to Talenom API endpoint
app.post('/api/send-to-talenom', async (req, res) => {
  try {
    logger.info('Send to Talenom request received');
    
    const { organizationNumber, voucherData } = req.body;
    
    // Validate required parameters
    if (!organizationNumber) {
      return res.status(400).json({
        success: false,
        error: 'Organization number is required'
      });
    }
    
    if (!voucherData || !Array.isArray(voucherData) || voucherData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Voucher data is required and must be a non-empty array'
      });
    }
    
    logger.info(`Sending ${voucherData.length} vouchers to Talenom for organization: ${organizationNumber}`);
    
    // Initialize API client
    const ApiClient = require('./services/apiClient');
    const apiClient = new ApiClient();
    
    // Send vouchers to Talenom
    const result = await apiClient.sendVouchers(organizationNumber, voucherData);
    
    logger.info('Vouchers sent to Talenom successfully', {
      organizationNumber,
      vouchersCount: voucherData.length,
      result
    });
    
    res.json({
      success: true,
      message: 'Vouchers sent to Talenom successfully',
      organizationNumber,
      vouchersCount: voucherData.length,
      result
    });
    
  } catch (error) {
    logger.error('Error sending vouchers to Talenom:', {
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    
    // Handle specific API errors
    let statusCode = 500;
    let errorMessage = error.message;
    
    if (error.response) {
      statusCode = error.response.status || 500;
      errorMessage = error.response.data?.message || error.response.statusText || error.message;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: error.response?.data,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug OAuth2 configurations endpoint
app.get('/api/debug-oauth', async (req, res) => {
  try {
    logger.info('Debug OAuth2 configurations request received');
    
    const ApiClient = require('./services/apiClient');
    const apiClient = new ApiClient();
    
    const result = await apiClient.testOAuth2Configurations();
    
    if (result.success) {
      logger.info('Found working OAuth2 configuration:', result.config.name);
      res.json({
        success: true,
        message: 'Working OAuth2 configuration found',
        workingConfig: result.config,
        tokenInfo: {
          token_type: result.token.token_type,
          expires_in: result.token.expires_in
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No working OAuth2 configuration found',
        suggestion: 'Check the logs for detailed error information'
      });
    }
    
  } catch (error) {
    logger.error('Error testing OAuth2 configurations:', error);
    res.status(500).json({
      success: false,
      error: 'OAuth2 testing failed',
      message: error.message
    });
  }
});

// Initialize Account Mapping Service
const accountMappingService = new AccountMappingService();

// Account Mapping Configuration Endpoints

// Serve account configuration page
app.get('/account-config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account-config.html'));
});

// Get all account mappings and status
app.get('/api/account-mappings', async (req, res) => {
  try {
    logger.info('Get account mappings request received');
    
    const mappings = accountMappingService.getMappings();
    const status = accountMappingService.getStatus();
    
    res.json({
      success: true,
      mappings: mappings,
      status: status
    });
    
  } catch (error) {
    logger.error('Error getting account mappings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Add account mapping
app.post('/api/account-mappings', async (req, res) => {
  try {
    const { app, sourceAccount, targetAccount } = req.body;
    
    if (!app || !sourceAccount || !targetAccount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: app, sourceAccount, targetAccount'
      });
    }
    
    if (!['main', 'esimerkkiseura'].includes(app)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid app. Must be "main" or "esimerkkiseura"'
      });
    }
    
    logger.info(`Adding account mapping for ${app}: ${sourceAccount} -> ${targetAccount}`);
    
    accountMappingService.addMapping(app, sourceAccount, targetAccount);
    
    res.json({
      success: true,
      message: `Account mapping added for ${app}`
    });
    
  } catch (error) {
    logger.error('Error adding account mapping:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Remove account mapping
app.delete('/api/account-mappings', async (req, res) => {
  try {
    const { app, sourceAccount } = req.body;
    
    if (!app || !sourceAccount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: app, sourceAccount'
      });
    }
    
    if (!['main', 'esimerkkiseura'].includes(app)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid app. Must be "main" or "esimerkkiseura"'
      });
    }
    
    logger.info(`Removing account mapping for ${app}: ${sourceAccount}`);
    
    accountMappingService.removeMapping(app, sourceAccount);
    
    res.json({
      success: true,
      message: `Account mapping removed for ${app}`
    });
    
  } catch (error) {
    logger.error('Error removing account mapping:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Clear all account mappings
app.post('/api/account-mappings/clear', async (req, res) => {
  try {
    logger.info('Clearing all account mappings');
    
    accountMappingService.setMappings({ main: {}, esimerkkiseura: {} });
    
    res.json({
      success: true,
      message: 'All account mappings cleared'
    });
    
  } catch (error) {
    logger.error('Error clearing account mappings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Export account mappings to Excel
app.get('/api/account-mappings/export', (req, res) => {
  try {
    logger.info('Exporting account mappings to Excel');
    
    const mappings = accountMappingService.getMappings();
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData = [];
    
    // Add headers
    excelData.push(['Application', 'Old Account', 'Old Account Name', 'New Account', 'New Account Name']);
    
    // Add main application mappings
    if (mappings.main) {
      Object.entries(mappings.main).forEach(([source, target]) => {
        excelData.push(['Main Application', source, `Account ${source}`, target, `Account ${target}`]);
      });
    }
    
    // Add esimerkkiseura mappings
    if (mappings.esimerkkiseura) {
      Object.entries(mappings.esimerkkiseura).forEach(([source, target]) => {
        excelData.push(['Esimerkkiseura', source, `Account ${source}`, target, `Account ${target}`]);
      });
    }
    
    // If no mappings, add example rows
    if (excelData.length === 1) {
      excelData.push(['Main Application', '1700', 'Equipment - Original', '1702', 'Equipment - Modified']);
      excelData.push(['Esimerkkiseura', '3000', 'Revenue - Standard', '3100', 'Revenue - Premium']);
      excelData.push(['Main Application', '2500', 'Expenses - General', '2550', 'Expenses - Specific']);
    }
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Application
      { wch: 15 }, // Old Account
      { wch: 25 }, // Old Account Name
      { wch: 15 }, // New Account
      { wch: 25 }  // New Account Name
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Account Mappings');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers
    const fileName = `account-mappings-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', excelBuffer.length);
    
    logger.info(`Account mappings Excel export sent: ${fileName}`);
    res.send(excelBuffer);
    
  } catch (error) {
    logger.error('Error exporting account mappings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Import account mappings from Excel
app.post('/api/account-mappings/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please select an Excel file to upload'
      });
    }

    const { originalname, buffer, mimetype } = req.file;
    
    logger.info(`Account mappings import started: ${originalname}`);

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream'
    ];

    const fileExtension = originalname.toLowerCase().split('.').pop();
    const allowedExtensions = ['xlsx', 'xls'];

    if (!allowedTypes.includes(mimetype) || !allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'Only Excel files (.xlsx, .xls) are supported'
      });
    }

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format',
        message: 'Excel file must contain at least a header row and one data row'
      });
    }
    
    // Process the data
    const headers = data[0];
    const requiredHeaders = ['Application', 'Old Account', 'New Account'];
    
    // Check if required headers exist (case-insensitive)
    const headerMap = {};
    headers.forEach((header, index) => {
      const normalizedHeader = String(header).trim();
      if (normalizedHeader.toLowerCase().includes('application') || normalizedHeader.toLowerCase().includes('app')) {
        headerMap.application = index;
      } else if (normalizedHeader.toLowerCase().includes('old account') && !normalizedHeader.toLowerCase().includes('name')) {
        headerMap.oldAccount = index;
      } else if (normalizedHeader.toLowerCase().includes('old account name') || normalizedHeader.toLowerCase().includes('old account description')) {
        headerMap.oldAccountName = index;
      } else if (normalizedHeader.toLowerCase().includes('new account') && !normalizedHeader.toLowerCase().includes('name')) {
        headerMap.newAccount = index;
      } else if (normalizedHeader.toLowerCase().includes('new account name') || normalizedHeader.toLowerCase().includes('new account description')) {
        headerMap.newAccountName = index;
      }
    });
    
    if (headerMap.application === undefined || headerMap.oldAccount === undefined || headerMap.newAccount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format',
        message: 'Excel file must contain columns: Application, Old Account, New Account (Account name columns are optional)'
      });
    }
    
    // Process rows and build mappings
    const newMappings = { main: {}, esimerkkiseura: {} };
    let processedRows = 0;
    let skippedRows = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const application = String(row[headerMap.application] || '').trim().toLowerCase();
      const oldAccount = String(row[headerMap.oldAccount] || '').trim();
      const newAccount = String(row[headerMap.newAccount] || '').trim();
      const oldAccountName = String(row[headerMap.oldAccountName] || '').trim();
      const newAccountName = String(row[headerMap.newAccountName] || '').trim();
      
      if (!oldAccount || !newAccount) {
        skippedRows++;
        continue;
      }
      
      // Determine application type
      let appType;
      if (application.includes('main') || application.includes('primary')) {
        appType = 'main';
      } else if (application.includes('esimerkkiseura') || application.includes('esimerkki')) {
        appType = 'esimerkkiseura';
      } else {
        // Default to main if unclear
        appType = 'main';
      }
      
      newMappings[appType][oldAccount] = newAccount;
      processedRows++;
    }
    
    // Apply the new mappings
    accountMappingService.setMappings(newMappings);
    
    logger.info(`Account mappings imported successfully: ${processedRows} mappings processed, ${skippedRows} rows skipped`);
    
    res.json({
      success: true,
      message: `Successfully imported ${processedRows} account mappings`,
      details: {
        processedRows,
        skippedRows,
        mainMappings: Object.keys(newMappings.main).length,
        esimerkkiseuraMappings: Object.keys(newMappings.esimerkkiseura).length
      }
    });
    
  } catch (error) {
    logger.error('Error importing account mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import account mappings',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested resource was not found',
    timestamp: new Date().toISOString()
  });
});

// Create temp directory for Jatko-PASI processing
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  logger.info('Created temp directory for file processing');
}

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Talenom General Ledger Client started on port ${PORT}`);
  logger.info(`📊 Dashboard available at http://localhost:${PORT}`);
  
  if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    logger.warn('⚠️  OAuth2 credentials not configured. Please check your .env file.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;