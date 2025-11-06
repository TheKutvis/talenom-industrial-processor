const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const logger = require('../utils/logger');

class JatkoPasiProcessor {
  constructor() {
    this.name = 'Jatko-PASI Processor';
  }

  /**
   * Process Jatko-PASI files - read tire POIS file and add data to POLO PASI file
   * @param {string} workspaceDir - Directory containing the files
   * @returns {Promise<Object>} Processing result
   */
  async processFiles(workspaceDir) {
    try {
      logger.info('Starting Jatko-PASI processing');

      // Find the tire POIS file
      const files = fs.readdirSync(workspaceDir);
      const tireFile = files.find(file => file.includes('44841_tire') && file.includes('_POIS'));
      const pasiFile = files.find(file => file.includes('44841TPM') && file.includes('_POLO_PASI'));

      if (!tireFile) {
        throw new Error('Could not find 44841_tire*_POIS file in workspace');
      }

      if (!pasiFile) {
        throw new Error('Could not find 44841TPM*_POLO_PASI file in workspace');
      }

      logger.info(`Found tire file: ${tireFile}`);
      logger.info(`Found PASI file: ${pasiFile}`);

      const tireFilePath = path.join(workspaceDir, tireFile);
      const pasiFilePath = path.join(workspaceDir, pasiFile);

      // Read the tire POIS file and extract data after ;;;
      const tireData = await this.readTireFile(tireFilePath);
      
      // Read the existing PASI file
      const pasiData = await this.readPasiFile(pasiFilePath);

      // Merge the data
      const mergedData = this.mergeData(tireData, pasiData);

      // Write the updated PASI file
      const outputPath = path.join(workspaceDir, `updated_${pasiFile}`);
      await this.writePasiFile(outputPath, mergedData);

      logger.info(`Jatko-PASI processing completed. Output saved to: updated_${pasiFile}`);

      return {
        success: true,
        message: 'Jatko-PASI processing completed successfully',
        inputFiles: {
          tireFile: tireFile,
          pasiFile: pasiFile
        },
        outputFile: `updated_${pasiFile}`,
        processedRecords: mergedData.length
      };

    } catch (error) {
      logger.error('Error in Jatko-PASI processing:', error);
      throw error;
    }
  }

  /**
   * Read tire POIS file and extract relevant data
   * @param {string} filePath - Path to tire file
   * @returns {Promise<Array>} Extracted data
   */
  async readTireFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      stream
        .pipe(csv({ 
          separator: ';',
          headers: false,
          skipEmptyLines: true
        }))
        .on('data', (row) => {
          try {
            // Convert row object to array of values
            const values = Object.values(row);
            
            // The structure appears to be: 44841;;148;10.06.2024;08.11;06.10.2025;21.10.2025;K;K;U;;;705;P;0,00
            // We want the number after ;;; (index 12 in the split)
            const rowData = values.join(';');
            const parts = rowData.split(';');
            
            if (parts.length >= 13) {
              const id = parts[2]; // 148, 204, etc.
              const numberAfterSemicolons = parts[12]; // 705, 101, etc.
              
              results.push({
                id: id,
                additionalNumber: numberAfterSemicolons,
                originalRow: rowData
              });
            }
          } catch (error) {
            logger.warn('Error parsing tire file row:', error);
          }
        })
        .on('end', () => {
          logger.info(`Read ${results.length} records from tire file`);
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Read existing PASI file
   * @param {string} filePath - Path to PASI file
   * @returns {Promise<Array>} PASI data
   */
  async readPasiFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      stream
        .pipe(csv({ 
          separator: ';',
          headers: false,
          skipEmptyLines: true
        }))
        .on('data', (row) => {
          try {
            // Convert row object to array of values
            const values = Object.values(row);
            const rowData = values.join(';');
            const parts = rowData.split(';');
            
            if (parts.length >= 6) {
              results.push({
                id: parts[0], // 148, 204, etc.
                originalRow: rowData,
                parts: parts
              });
            }
          } catch (error) {
            logger.warn('Error parsing PASI file row:', error);
          }
        })
        .on('end', () => {
          logger.info(`Read ${results.length} records from PASI file`);
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Merge tire data with PASI data
   * @param {Array} tireData - Data from tire file
   * @param {Array} pasiData - Data from PASI file
   * @returns {Array} Merged data
   */
  mergeData(tireData, pasiData) {
    const tireMap = new Map();
    
    // Create a map of tire data by ID
    tireData.forEach(item => {
      tireMap.set(item.id, item.additionalNumber);
    });

    // Add tire data to PASI records
    const mergedData = pasiData.map(pasiItem => {
      const additionalNumber = tireMap.get(pasiItem.id);
      
      if (additionalNumber) {
        // Add the additional number to the end of the row
        return `${pasiItem.originalRow};${additionalNumber}`;
      } else {
        // If no matching tire data, keep original
        return pasiItem.originalRow;
      }
    });

    return mergedData;
  }

  /**
   * Write merged data to output file
   * @param {string} outputPath - Path for output file
   * @param {Array} data - Data to write
   * @returns {Promise<void>}
   */
  async writePasiFile(outputPath, data) {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
      
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      // Write each row
      data.forEach(row => {
        writeStream.write(row + '\n');
      });

      writeStream.end();
    });
  }
}

module.exports = JatkoPasiProcessor;