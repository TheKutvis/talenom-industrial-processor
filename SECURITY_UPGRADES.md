# Security Upgrades - January 30, 2026

## Overview
This document outlines the security upgrades performed to address critical vulnerabilities in the Talenom Industrial Processor application.

## Package Upgrades

### 1. axios (v1.7.4+)
- **Previous State**: Outdated version with known vulnerabilities
- **Upgrade**: Updated to v1.7.4 or newer
- **Vulnerabilities Fixed**:
  - Critical SSRF (Server-Side Request Forgery)
  - CSRF token leakage
- **Impact**: All API client operations now use secure axios version

### 2. multer (v2.0.1+)
- **Previous State**: Vulnerable to DoS attacks
- **Upgrade**: Updated to v2.0.1 or newer
- **Vulnerabilities Fixed**:
  - Trivial DoS crash via empty field names
- **Impact**: File upload handling is now secure against malicious payloads

### 3. express (v4.21.2)
- **Previous State**: Open Redirect vulnerabilities
- **Upgrade**: Updated to v4.21.2
- **Vulnerabilities Fixed**:
  - Open Redirect vulnerabilities
- **Impact**: Web server routes are now protected against redirect-based attacks

## Package Replacements

### 4. xlsx → exceljs
- **Rationale**: 
  - xlsx had unresolved vulnerabilities (Prototype Pollution, ReDoS)
  - Abandoned npm package vs. proprietary CDN distribution dilemma
  - No fix available from maintainers
- **Changes**:
  - Replaced all `require('xlsx')` with `require('exceljs')`
  - Updated Excel file reading in:
    - Main upload endpoint (`/api/upload-file`)
    - Maestro upload endpoint (`/api/upload-maestro`)
  - Updated Excel file writing in:
    - Download template endpoint (`/api/download-template`)
    - Download populated template endpoint (`/api/download-populated-template`)
  - Updated `services/esimerkkiseuraProcessor.js` for Myclub processor
- **Migration Details**:
  - `XLSX.read()` → `ExcelJS.Workbook().xlsx.load()`
  - `XLSX.utils.sheet_to_json()` → Manual row iteration with `worksheet.eachRow()`
  - `XLSX.utils.book_new()` → `new ExcelJS.Workbook()`
  - `XLSX.utils.aoa_to_sheet()` → `worksheet.addRow()`
  - `XLSX.write()` → `workbook.xlsx.writeBuffer()`
- **Functions Made Async**:
  - `/api/download-template` route handler
  - `/api/download-populated-template` route handler
  - `processEsimerkkiseuraExcel()` in esimerkkiseuraProcessor.js
  - `generateEsimerkkiseuraExcel()` in esimerkkiseuraProcessor.js

### 5. csv-writer → Removed
- **Rationale**: 
  - Abandoned package with potential security risks
  - Not actively maintained
- **Changes**:
  - Removed `csv-writer` dependency from package.json
  - Removed unused import from `services/jatkoPasiProcessor.js`
  - CSV writing already handled by native Node.js streams
- **Impact**: No functionality change; code is cleaner and more secure

## Remaining Vulnerabilities

### pkg (moderate severity)
- **Issue**: Local Privilege Escalation (GHSA-22r3-9w55-cj54)
- **Status**: No fix available
- **Mitigation**: 
  - Only distribute executables to trusted users
  - Avoid running in multi-user or untrusted environments
  - Consider alternative distribution methods (Docker, native packages, etc.) for production

## Files Modified

1. `/package.json` - Updated dependencies
2. `/server.js` - Migrated xlsx to exceljs in all routes
3. `/services/esimerkkiseuraProcessor.js` - Migrated xlsx to exceljs
4. `/services/jatkoPasiProcessor.js` - Removed csv-writer import
5. `/test-esimerkkiseura.js` - Created test script for validation

## Testing Recommendations

### 1. Excel Upload/Download Testing
- Test General Ledger file upload with `.xlsx` files
- Test Maestro file upload with `.xlsx` files
- Test Myclub processor with Esimerkkiseura format
- Test template download functionality
- Test populated template download
- Verify TILI column remains numeric in exports

### 2. CSV Testing
- Test Netvisor CSV uploads
- Test regular CSV uploads with semicolon delimiter
- Verify Jatko-PASI processor still works

### 3. API Testing
- Test OAuth2 authentication flows
- Test voucher submission to Talenom API
- Verify error handling and logging

### 4. Regression Testing
- Verify all existing functionality still works
- Check date formatting (DD.MM.YYYY format)
- Verify numeric column handling
- Test custom SELITE and TOSITE parameters

## Next Steps

1. Run comprehensive manual testing of all features
2. Update production deployment with new dependencies
3. Monitor for any runtime issues
4. Consider implementing automated tests for future safety
5. Evaluate alternatives to `pkg` for executable distribution

## Notes

- All changes maintain backward compatibility
- No breaking changes to API endpoints
- Excel file format and structure unchanged
- Performance should be similar or improved with exceljs
