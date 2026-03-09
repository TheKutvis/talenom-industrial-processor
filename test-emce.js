// Quick test: parse GL EMce.xlsx using JSZip + XML (no xlsx dependency)
const JSZip = require('jszip');
const fs = require('fs');

async function test() {
  const buf = fs.readFileSync('/Users/ankut/Projects/Uusi murska/GL EMce.xlsx');
  const zip = await JSZip.loadAsync(buf);

  // Read shared strings raw
  const ssXml = await zip.file('xl/sharedStrings.xml').async('string');
  console.log('SharedStrings first 2000 chars:', ssXml.substring(0, 2000));

  // Read sheet1 first 3000 chars
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  console.log('\nSheet1 first 5000 chars:', sheetXml.substring(0, 5000));
  
  // Find first occurrence of "Tili" in sheet
  const tiliIdx = sheetXml.indexOf('Tili');
  if (tiliIdx >= 0) {
    console.log('\nFirst "Tili" at offset', tiliIdx);
    console.log('Context:', sheetXml.substring(Math.max(0, tiliIdx - 200), tiliIdx + 400));
  } else {
    console.log('\n"Tili" NOT found in sheet1.xml');
    // Check shared strings
    const tiliIdx2 = ssXml.indexOf('Tili');
    if (tiliIdx2 >= 0) {
      console.log('"Tili" found in sharedStrings at offset', tiliIdx2);
      console.log('Context:', ssXml.substring(Math.max(0, tiliIdx2 - 200), tiliIdx2 + 400));
    } else {
      console.log('"Tili" NOT found in sharedStrings.xml either');
    }
  }
}

test().catch(e => console.error(e));
