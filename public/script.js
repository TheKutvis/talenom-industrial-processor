// Global state
let currentResults = null;
let currentTab = 'general-ledger';

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator');
const loadingOverlay = document.getElementById('loadingOverlay');
const resultsSection = document.getElementById('resultsSection');
const resultsContent = document.getElementById('resultsContent');
const toastContainer = document.getElementById('toastContainer');

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    console.log('Initializing app...');
    setupEventListeners();
    setupFileUpload();
    setDefaultDates();
    updateStatus('ready', 'Ready');
    
    // Additional setup for file upload button using event delegation
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'browseFileBtn') {
            console.log('Browse button clicked via delegation');
            e.preventDefault();
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.click();
            }
        }
        
        // Test connection button (fallback)
        if (e.target && e.target.id === 'testConnectionBtn') {
            console.log('Test connection button clicked via delegation');
            e.preventDefault();
            testConnection();
        }
        
        // Clear file button (fallback)
        if (e.target && e.target.id === 'clearFileBtn') {
            console.log('Clear file button clicked via delegation');
            e.preventDefault();
            clearFileUpload();
        }
    });
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    // Form submissions
    document.getElementById('generalLedgerForm').addEventListener('submit', handleGeneralLedgerSubmit);
    document.getElementById('accountBalancesForm').addEventListener('submit', handleAccountBalancesSubmit);
    document.getElementById('chartAccountsForm').addEventListener('submit', handleChartAccountsSubmit);
    document.getElementById('fileUploadForm').addEventListener('submit', handleFileUploadSubmit);

    // Clear form buttons
    const clearFormButtons = document.querySelectorAll('[data-clear-form]');
    console.log('Found clear form buttons:', clearFormButtons.length);
    clearFormButtons.forEach(button => {
        button.addEventListener('click', function() {
            const formId = this.dataset.clearForm;
            console.log('Clear form button clicked for:', formId);
            clearForm(formId);
        });
    });

    // Test connection button
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    console.log('Test connection button found:', !!testConnectionBtn);
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', function() {
            console.log('Test connection button event listener triggered');
            testConnection();
        });
    } else {
        console.warn('Test connection button not found in DOM');
    }

    // Clear file button
    const clearFileBtn = document.getElementById('clearFileBtn');
    console.log('Clear file button found:', !!clearFileBtn);
    if (clearFileBtn) {
        clearFileBtn.addEventListener('click', function() {
            console.log('Clear file button event listener triggered');
            clearFileUpload();
        });
    } else {
        console.warn('Clear file button not found in DOM');
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Escape key to close results
        if (e.key === 'Escape') {
            hideResults();
        }
        // Ctrl/Cmd + Enter to submit active form
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const activeForm = document.querySelector('.tab-content.active form');
            if (activeForm) {
                e.preventDefault();
                activeForm.dispatchEvent(new Event('submit'));
            }
        }
    });
}

function setupFileUpload() {
    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupFileUpload);
        return;
    }

    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseButton = document.getElementById('browseFileBtn');
    const submitButton = document.getElementById('processFileBtn');

    // Debug: Check if elements exist
    console.log('File upload elements:', { 
        fileUploadArea: !!fileUploadArea, 
        fileInput: !!fileInput, 
        browseButton: !!browseButton, 
        submitButton: !!submitButton 
    });

    if (!browseButton || !fileInput) {
        console.error('Required elements not found, retrying...');
        setTimeout(setupFileUpload, 500);
        return;
    }

    // Remove any existing event listeners
    const newBrowseButton = browseButton.cloneNode(true);
    browseButton.parentNode.replaceChild(newBrowseButton, browseButton);

    // Click to browse (both area and button)
    if (fileUploadArea) {
        fileUploadArea.addEventListener('click', () => {
            console.log('Upload area clicked');
            fileInput.click();
        });
    }
    
    newBrowseButton.addEventListener('click', (e) => {
        console.log('Browse button clicked');
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', function() {
        console.log('File input changed, files:', this.files.length);
        if (this.files.length > 0) {
            console.log('Selected file:', this.files[0].name);
            handleFileSelection(this.files[0]);
        }
    });

    // Drag and drop
    fileUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    });

    fileUploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
    });

    fileUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelection(files[0]);
        }
    });

    function handleFileSelection(file) {
        if (file) {
            const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
            const validExtensions = ['.csv', '.xlsx', '.xls'];
            
            if (validTypes.includes(file.type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
                if (fileUploadArea) {
                    fileUploadArea.classList.add('file-selected');
                    fileUploadArea.querySelector('.file-upload-text').textContent = `Selected: ${file.name}`;
                    fileUploadArea.querySelector('.file-upload-subtext').textContent = `Size: ${formatFileSize(file.size)}`;
                }
                
                // Enable the process button
                const processBtn = document.getElementById('processFileBtn');
                if (processBtn) {
                    processBtn.disabled = false;
                }
                
                console.log('File selected:', file.name, file.size);
            } else {
                showToast('error', 'Invalid File Type', 'Please select a CSV or Excel file.');
                clearFileUpload();
            }
        }
    }
}

function setDefaultDates() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Set default dates for General Ledger Events
    document.getElementById('fromDate').value = formatDate(firstDayOfMonth);
    document.getElementById('toDate').value = formatDate(lastDayOfMonth);

    // Set default date for Account Balances
    document.getElementById('balanceDate').value = formatDate(today);

    // Set default dates for Chart of Accounts
    document.getElementById('chartFromDate').value = formatDate(firstDayOfMonth);
    document.getElementById('chartToDate').value = formatDate(lastDayOfMonth);
}

// Tab Management
function switchTab(tabName) {
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    currentTab = tabName;
    hideResults();
}

// Form Handlers
async function handleGeneralLedgerSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Convert numeric fields
    data.pageIndex = parseInt(data.pageIndex);
    data.pageSize = parseInt(data.pageSize);
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
        if (!data[key]) delete data[key];
    });

    try {
        showLoading();
        updateStatus('loading', 'Fetching general ledger events...');
        
        const response = await fetch('/api/general-ledger-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        displayResults(result.data, 'General Ledger Events');
        showToast('success', 'Success', `Retrieved ${result.data.results?.length || 0} events`);
        updateStatus('success', 'Data retrieved successfully');
        
    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

async function handleAccountBalancesSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
        if (!data[key]) delete data[key];
    });

    try {
        showLoading();
        updateStatus('loading', 'Fetching account balances...');
        
        const response = await fetch('/api/account-balances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        displayResults(result.data, 'Account Balances');
        showToast('success', 'Success', `Retrieved balances for ${result.data.length} accounts`);
        updateStatus('success', 'Data retrieved successfully');
        
    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

async function handleChartAccountsSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
        if (!data[key]) delete data[key];
    });

    try {
        showLoading();
        updateStatus('loading', 'Fetching chart of accounts...');
        
        const response = await fetch('/api/chart-of-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        displayResults(result.data, 'Chart of Accounts');
        showToast('success', 'Success', `Retrieved ${result.data.length} accounts`);
        updateStatus('success', 'Data retrieved successfully');
        
    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

async function handleFileUploadSubmit(e) {
    e.preventDefault();
    
    console.log('File upload form submitted');
    
    const fileInput = document.getElementById('fileInput');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('error', 'No File Selected', 'Please select a file before processing.');
        return;
    }
    
    const file = fileInput.files[0];
    console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    // Create FormData manually to ensure proper file handling
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('FormData created, sending request...');

    try {
        showLoading();
        updateStatus('loading', 'Processing file...');
        
        console.log('Making fetch request to /api/upload-file');
        
        const response = await fetch('/api/upload-file', {
            method: 'POST',
            body: formData
        });
        
        console.log('Response received:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response text:', errorText);
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Upload result:', result);

        displayResults(result.data, `File Processing Results - ${result.fileName}`);
        showToast('success', 'Success', `Processed ${result.rowCount} rows from ${result.fileName}`);
        updateStatus('success', 'File processed successfully');
        
    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

// Results Display
function displayResults(data, title) {
    currentResults = { data, title };
    
    const html = `
        <div class="results-metadata">
            <h4>${title}</h4>
            <p class="text-muted">Retrieved at: ${new Date().toLocaleString()}</p>
        </div>
        ${generateResultsHTML(data)}
    `;
    
    resultsContent.innerHTML = html;
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function generateResultsHTML(data) {
    if (!data) {
        return '<p class="text-muted">No data received</p>';
    }

    if (Array.isArray(data) && data.length === 0) {
        return '<p class="text-muted">No results found</p>';
    }

    // For paginated results (General Ledger Events)
    if (data.results) {
        return `
            <div class="pagination-info">
                <p><strong>Page:</strong> ${data.currentPage + 1} of ${data.pageCount}</p>
                <p><strong>Total Records:</strong> ${data.rowCount}</p>
                <p><strong>Page Size:</strong> ${data.pageSize}</p>
            </div>
            <div class="results-json">${JSON.stringify(data, null, 2)}</div>
        `;
    }

    // For array results
    if (Array.isArray(data)) {
        const table = generateTable(data);
        return `
            <div class="results-summary">
                <p><strong>Total Records:</strong> ${data.length}</p>
            </div>
            ${table}
            <div class="results-json">${JSON.stringify(data, null, 2)}</div>
        `;
    }

    // For single object results
    return `<div class="results-json">${JSON.stringify(data, null, 2)}</div>`;
}

function generateTable(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return '';
    }

    const keys = Object.keys(data[0]);
    const maxRows = 100; // Limit table rows for performance
    const displayData = data.slice(0, maxRows);

    let html = '<table class="results-table">';
    
    // Header
    html += '<thead><tr>';
    keys.forEach(key => {
        html += `<th>${escapeHtml(key)}</th>`;
    });
    html += '</tr></thead>';
    
    // Body
    html += '<tbody>';
    displayData.forEach(row => {
        html += '<tr>';
        keys.forEach(key => {
            const value = row[key];
            const displayValue = value !== null && value !== undefined ? String(value) : '';
            html += `<td title="${escapeHtml(displayValue)}">${escapeHtml(truncateText(displayValue, 50))}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    if (data.length > maxRows) {
        html += `<p class="text-muted">Showing first ${maxRows} rows of ${data.length} total records</p>`;
    }

    return html;
}

// Utility Functions
function clearForm(formId) {
    const form = document.getElementById(formId);
    form.reset();
    setDefaultDates(); // Reset dates to defaults
    hideResults();
}

function clearFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const submitButton = document.getElementById('processFileBtn');
    
    fileInput.value = '';
    fileUploadArea.classList.remove('file-selected');
    fileUploadArea.querySelector('.file-upload-text').textContent = 'Drag & drop your CSV or Excel file here';
    fileUploadArea.querySelector('.file-upload-subtext').textContent = 'or click to browse';
    submitButton.disabled = true;
}

// Test connection function
async function testConnection() {
    console.log('=== Testing connection START ===');
    
    // Show loading indicator
    updateStatus('loading', 'Testing connection...');
    
    try {
        console.log('Making fetch request to /api/test');
        const response = await fetch('/api/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ test: true })
        });
        
        console.log('Test response received:', response.status, response.statusText);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Test result:', result);
            showToast('success', 'Connection Test', 'Server connection is working!');
            updateStatus('success', 'Connection test successful');
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Connection test failed:', error);
        showToast('error', 'Connection Test Failed', error.message);
        updateStatus('error', 'Connection test failed');
    }
    
    console.log('=== Testing connection END ===');
}

function exportResults() {
    if (!currentResults) return;
    
    const blob = new Blob([JSON.stringify(currentResults.data, null, 2)], {
        type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentResults.title.replace(/\s+/g, '_')}_${formatDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('success', 'Exported', 'Results exported as JSON file');
}

function hideResults() {
    resultsSection.style.display = 'none';
    currentResults = null;
}

function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function updateStatus(type, message) {
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');
    
    statusText.textContent = message;
    
    // Remove all status classes
    statusDot.classList.remove('status-ready', 'status-loading', 'status-success', 'status-error');
    
    // Add appropriate class
    statusDot.classList.add(`status-${type}`);
    
    // Reset to ready after success/error
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            updateStatus('ready', 'Ready');
        }, 3000);
    }
}

function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function handleError(error) {
    console.error('API Error:', error);
    
    let title = 'Request Failed';
    let message = error.message || 'An unexpected error occurred';
    
    // Handle specific error types
    if (error.message.includes('fetch')) {
        title = 'Connection Error';
        message = 'Unable to connect to the server. Please check your connection and try again.';
    } else if (error.message.includes('401')) {
        title = 'Authentication Error';
        message = 'Invalid credentials. Please check your OAuth2 configuration.';
    } else if (error.message.includes('403')) {
        title = 'Access Denied';
        message = 'You do not have permission to access this resource.';
    } else if (error.message.includes('404')) {
        title = 'Not Found';
        message = 'The requested resource was not found.';
    } else if (error.message.includes('429')) {
        title = 'Rate Limited';
        message = 'Too many requests. Please wait a moment before trying again.';
    }
    
    showToast('error', title, message);
    updateStatus('error', 'Request failed');
}

// Helper Functions
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Add CSS for status indicators
const style = document.createElement('style');
style.textContent = `
    .status-ready { background: var(--accent-primary); }
    .status-loading { background: var(--accent-warning); animation: pulse 1s infinite; }
    .status-success { background: var(--accent-primary); }
    .status-error { background: var(--accent-danger); }
    .results-metadata h4 { color: var(--text-primary); margin-bottom: 8px; }
    .results-metadata .text-muted { color: var(--text-muted); margin-bottom: 20px; }
    .pagination-info { background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 20px; }
    .pagination-info p { margin-bottom: 4px; color: var(--text-secondary); }
    .results-summary { background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 20px; }
    .results-summary p { color: var(--text-secondary); font-weight: 500; }
`;
document.head.appendChild(style);