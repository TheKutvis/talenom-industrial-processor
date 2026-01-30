const fs = require('fs');
const path = require('path');
const esimerkkiseura = require('./services/esimerkkiseuraProcessor');

async function testExcelProcessing() {
  const sampleFile = path.join(__dirname, 'test-data', 'sample.xlsx');
  if (!fs.existsSync(sampleFile)) {
    console.error('Sample Excel file not found:', sampleFile);
    return;
  }
  const fileBuffer = fs.readFileSync(sampleFile);
  const result = await esimerkkiseura.processEsimerkkiseuraExcel(fileBuffer, 'sample.xlsx');
  console.log('Process result:', result && result.success ? 'Success' : 'Failure');
  if (result && result.vouchers) {
    const outBuffer = await esimerkkiseura.generateEsimerkkiseuraExcel(result.vouchers, 'sample.xlsx');
    fs.writeFileSync(path.join(__dirname, 'test-data', 'output.xlsx'), outBuffer);
    console.log('Output Excel written to test-data/output.xlsx');
  }
}

testExcelProcessing().catch(console.error);