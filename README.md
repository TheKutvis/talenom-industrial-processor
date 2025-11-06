# Talenom General Ledger Client

A modern Node.js client application for the Talenom General Ledger API with an industrial-style web interface. This application allows you to query general ledger events, account balances, chart of accounts, and process CSV/Excel files through a user-friendly web dashboard.

![Industrial Dashboard](https://img.shields.io/badge/UI-Industrial%20Theme-blue) ![Node.js](https://img.shields.io/badge/Node.js-v16+-green) ![Express](https://img.shields.io/badge/Express-4.18+-red) ![OAuth2](https://img.shields.io/badge/Auth-OAuth2-purple)

## 🚀 Features

### API Integration
- **General Ledger Events**: Query voucher rows with full pagination support
- **Account Balances**: Retrieve accumulated balances for specific accounts and dates
- **Chart of Accounts**: Get utilized bookkeeping accounts for time periods
- **OAuth2 Authentication**: Secure client credentials flow authentication
- **Comprehensive Error Handling**: Robust error handling with user-friendly messages

### File Processing
- **CSV Support**: Parse and process CSV files
- **Excel Support**: Handle .xlsx and .xls files
- **Drag & Drop**: Modern file upload interface
- **Data Validation**: File type and size validation

### User Interface
- **Industrial Dark Theme**: Modern, professional dark UI
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Status**: Live connection and operation status indicators
- **Toast Notifications**: User-friendly success/error notifications
- **Data Export**: Export results as JSON files
- **Loading States**: Clear loading indicators and progress feedback

### Developer Features
- **Comprehensive Logging**: Structured logging with Winston
- **Rate Limiting**: Built-in API rate limiting
- **Security Headers**: Helmet.js security middleware
- **Health Checks**: API connectivity monitoring
- **Hot Reload**: Development mode with nodemon

## 📋 Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **NPM**: Version 7.0.0 or higher
- **Talenom API Access**: Valid subscription key and OAuth2 credentials

## ⚡ Quick Start

### 1. Clone or Download

Download the project files to your local machine.

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` file with your credentials:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Talenom API Configuration
SUBSCRIPTION_KEY=your_subscription_key_here

# OAuth2 Configuration
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
TOKEN_ENDPOINT=https://login.microsoftonline.com/common/oauth2/v2.0/token
SCOPE=https://apim.talenom.com/.default
```

### 4. Start the Application

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

### 5. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

## 🔧 Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUBSCRIPTION_KEY` | Talenom API subscription key | `abc123def456...` |
| `CLIENT_ID` | OAuth2 client ID | `12345678-1234-1234-1234-123456789012` |
| `CLIENT_SECRET` | OAuth2 client secret | `your-secret-value` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `TOKEN_ENDPOINT` | OAuth2 token endpoint | Microsoft default |
| `SCOPE` | OAuth2 scope | `https://apim.talenom.com/.default` |

## 📖 API Endpoints

### General Ledger Events
- **Endpoint**: `GET /v1/general-ledger-events/{organizationNumber}`
- **Parameters**:
  - `organizationNumber` (required): Organization number (e.g., "1234567-8")
  - `pageIndex` (required): Page index starting from 0
  - `pageSize` (required): Number of records per page (1-10000)
  - `fromDate` (optional): Start date (YYYY-MM-DD)
  - `toDate` (optional): End date (YYYY-MM-DD)
  - `accountNumbers` (optional): Comma-separated account numbers
  - `category` (optional): Voucher category filter
  - `language` (optional): Response language (en, fi, sv)

### Account Balances
- **Endpoint**: `GET /v1/account-balances/{organizationNumber}`
- **Parameters**:
  - `organizationNumber` (required): Organization number
  - `date` (required): Balance date (YYYY-MM-DD)
  - `accountNumbers` (required): Comma-separated account numbers
  - `language` (optional): Response language (en, fi, sv)

### Chart of Accounts
- **Endpoint**: `GET /v1/chart-of-accounts/used-accounts/{organizationNumber}`
- **Parameters**:
  - `organizationNumber` (required): Organization number
  - `fromDate` (optional): Start date (YYYY-MM-DD)
  - `toDate` (optional): End date (YYYY-MM-DD)
  - `language` (optional): Response language (en, fi, sv)

## 🎨 User Interface Guide

### Navigation Tabs
1. **General Ledger Events**: Query voucher transaction data
2. **Account Balances**: Get account balance information
3. **Chart of Accounts**: Retrieve account listings
4. **File Processing**: Upload and process CSV/Excel files

### Using the Forms

#### General Ledger Events
1. Enter the organization number (required)
2. Set pagination parameters (page index and size)
3. Optionally set date range and filters
4. Click "Fetch Events" to retrieve data

#### Account Balances
1. Enter organization number (required)
2. Select the balance date (required)
3. Enter account numbers (comma-separated, required)
4. Select language preference
5. Click "Get Balances"

#### File Processing
1. Drag and drop a CSV or Excel file, or click to browse
2. File validation happens automatically
3. Click "Process File" to parse and display data
4. Results show the parsed data in table and JSON format

### Results and Export
- Results appear in an expandable section below the form
- View data in both table and JSON formats
- Export results as JSON files using the "Export JSON" button
- Close results with the "Close" button or Escape key

## 🛠️ Development

### Project Structure
```
talenom-general-ledger-client/
├── server.js                 # Main application server
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
├── README.md                # This file
├── public/                  # Static web assets
│   ├── index.html           # Main HTML page
│   ├── styles.css           # CSS styles
│   └── script.js            # Client-side JavaScript
├── services/                # Backend services
│   └── apiClient.js         # Talenom API client
├── utils/                   # Utility modules
│   └── logger.js            # Winston logger configuration
└── logs/                    # Application logs (created automatically)
    ├── combined.log         # All logs
    ├── error.log            # Error logs only
    ├── exceptions.log       # Uncaught exceptions
    └── rejections.log       # Unhandled promise rejections
```

### Available Scripts

```bash
# Start in development mode with auto-reload
npm run dev

# Start in production mode
npm start

# Install dependencies
npm install
```

### Adding New Features

1. **Backend Routes**: Add new routes in `server.js`
2. **API Methods**: Extend `services/apiClient.js` for new API endpoints
3. **UI Components**: Add new tabs/forms in `public/index.html`
4. **Styling**: Update styles in `public/styles.css`
5. **Client Logic**: Add JavaScript functions in `public/script.js`

## 🔒 Security Features

- **Helmet.js**: Security headers for XSS and other attacks
- **Rate Limiting**: Prevents API abuse
- **CORS Configuration**: Controlled cross-origin requests
- **Input Validation**: Server-side parameter validation
- **File Upload Security**: Type and size restrictions
- **OAuth2 Token Management**: Automatic token refresh and secure storage

## 📊 Logging and Monitoring

### Log Files
- `logs/combined.log`: All application logs
- `logs/error.log`: Error-level logs only
- `logs/exceptions.log`: Uncaught exceptions
- `logs/rejections.log`: Unhandled promise rejections

### Log Levels
- `error`: Critical errors requiring attention
- `warn`: Warning conditions
- `info`: General information messages
- `debug`: Detailed debugging information

### Health Check
Access the health check endpoint:
```
GET /health
```

Returns API connectivity status and authentication state.

## 🚨 Error Handling

### Common Errors and Solutions

#### Authentication Errors (401)
- **Cause**: Invalid OAuth2 credentials or expired token
- **Solution**: Verify `CLIENT_ID` and `CLIENT_SECRET` in `.env` file

#### Access Denied (403)
- **Cause**: Insufficient API permissions
- **Solution**: Check API subscription and organization access rights

#### Rate Limiting (429)
- **Cause**: Too many requests in short time
- **Solution**: Wait before retrying, consider reducing request frequency

#### Connection Errors
- **Cause**: Network issues or API downtime
- **Solution**: Check internet connection and API status

### Debug Mode
Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## 🔄 API Response Formats

### General Ledger Events Response
```json
{
  "currentPage": 0,
  "pageCount": 5,
  "pageSize": 100,
  "rowCount": 450,
  "results": [
    {
      "id": "uuid",
      "accountNumber": "3000",
      "description": "Invoice description",
      "credit": 0,
      "debet": 100,
      "vatIncludedAmount": 124,
      "voucherDate": "2023-12-31",
      "category": "eSalesInvoice"
    }
  ]
}
```

### Account Balances Response
```json
[
  {
    "account": "1701",
    "saldo": 15000.50
  },
  {
    "account": "3000", 
    "saldo": -5400.25
  }
]
```

### Chart of Accounts Response
```json
[
  {
    "number": "1701",
    "name": "Bank Account"
  },
  {
    "number": "3000",
    "name": "Sales Revenue"
  }
]
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

For issues and questions:

1. **API Issues**: Contact Talenom Integration Services
   - Email: integraatiot@talenom.fi
   - URL: https://integration.talenom.fi/

2. **Application Issues**: Check the logs and error messages
   - Enable debug logging for detailed information
   - Check the browser console for client-side errors

## 🔮 Future Enhancements

- **Voucher Management**: Add voucher creation and management features
- **Batch Processing**: Support for bulk operations
- **Data Visualization**: Charts and graphs for financial data
- **Export Formats**: Additional export formats (CSV, Excel, PDF)
- **Scheduled Queries**: Automated data fetching and reporting
- **Advanced Filtering**: More sophisticated query builders
- **Multi-tenant Support**: Support for multiple organizations

---

**Built with ⚡ by the Talenom Integration Team**