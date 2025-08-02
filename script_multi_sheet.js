// Multi-Sheet Certificate Verifier Script
// This version fetches data from multiple sheets (Sheet1, Sheet2, Sheet3, etc.)

const CONFIG = {
    API_KEY: 'AIzaSyCiEgyS_hZLOPYfntM2b5imvAx9iIWBSHY',
    SHEET_ID: '1ia2pkU2Zx0IKF4XI4Os_pVZfdlFqb815IwkDmc9IBpc',
    SHEET_NAMES: ['Sheet1', 'Sheet2', 'Sheet3', 'Sheet4', 'Sheet5'], // Add more as needed
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};

// Cache management for multiple sheets
let multiSheetCache = {
    data: new Map(), // Map to store data for each sheet
    timestamp: null,
    
    isValid: function() {
        return this.timestamp && 
               (Date.now() - this.timestamp) < CONFIG.CACHE_DURATION;
    },
    
    set: function(allData) {
        this.data = allData;
        this.timestamp = Date.now();
    },
    
    clear: function() {
        this.data.clear();
        this.timestamp = null;
    },
    
    getSize: function() {
        let totalSize = 0;
        this.data.forEach(sheetData => {
            totalSize += sheetData.length;
        });
        return totalSize;
    }
};

// Loading state management
function showLoading(message = 'অনুসন্ধান করা হচ্ছে...') {
    const searchButton = document.getElementById('searchButton');
    const originalText = searchButton.innerHTML;
    searchButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message}`;
    searchButton.disabled = true;
    searchButton.dataset.originalText = originalText;
    
    // Show loading overlay if exists
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    const searchButton = document.getElementById('searchButton');
    const originalText = searchButton.dataset.originalText || '<i class="fas fa-search"></i> সার্চ করুন';
    searchButton.innerHTML = originalText;
    searchButton.disabled = false;
    
    // Hide loading overlay if exists
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Update progress for multiple sheets
function updateProgress(current, total, sheetName) {
    const progressDiv = document.getElementById('sheetProgress');
    const statusSpan = document.getElementById('sheetStatus');
    const currentSheetSpan = document.getElementById('currentSheet');
    
    if (progressDiv && statusSpan) {
        progressDiv.style.display = 'block';
        statusSpan.textContent = `${current}/${total}`;
        if (currentSheetSpan) {
            currentSheetSpan.textContent = sheetName;
        }
    }
    
    console.log(`Processing ${sheetName}: ${current}/${total}`);
}

// Exponential backoff retry mechanism
async function retryWithBackoff(fn, maxRetries = CONFIG.MAX_RETRIES) {
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            return await fn();
        } catch (error) {
            retries++;
            
            if (retries === maxRetries) {
                throw error;
            }
            
            const delay = CONFIG.RETRY_DELAY * Math.pow(2, retries - 1) + Math.random() * 1000;
            console.log(`Retry ${retries}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Get all available sheets in the spreadsheet
async function getAvailableSheets() {
    try {
        const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}?key=${CONFIG.API_KEY}&fields=sheets.properties.title`;
        
        const response = await retryWithBackoff(async () => {
            const res = await fetch(metadataUrl);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.json();
        });

        const availableSheets = response.sheets.map(sheet => sheet.properties.title);
        console.log('Available sheets:', availableSheets);
        
        return availableSheets;
        
    } catch (error) {
        console.error('Error getting sheet metadata:', error);
        // Fallback to predefined sheet names
        return CONFIG.SHEET_NAMES;
    }
}

// Fetch data from a single sheet
async function fetchSheetData(sheetName) {
    const range = `${sheetName}!A:G`; // Get all data from columns A to G
    const encodedRange = encodeURIComponent(range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodedRange}?key=${CONFIG.API_KEY}&majorDimension=ROWS`;

    try {
        const response = await retryWithBackoff(async () => {
            console.log(`Fetching data from ${sheetName} with URL: ${url}`);
            const res = await fetch(url, {
                headers: {
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'Certificate-Verifier-MultiSheet (gzip)'
                }
            });
            
            console.log(`Response status for ${sheetName}: ${res.status}`);
            
            if (!res.ok) {
                if (res.status === 400) {
                    // Sheet might not exist, return empty array
                    console.log(`Sheet "${sheetName}" not found or empty`);
                    return { values: [] };
                }
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
            return res.json();
        });

        console.log(`API Response for ${sheetName}:`, response);

        // Skip header row (index 0) and return data rows
        const data = response.values ? response.values.slice(1) : [];
        console.log(`Fetched ${data.length} rows from ${sheetName}`);
        
        return data;
        
    } catch (error) {
        console.error(`Error fetching data from ${sheetName}:`, error);
        return []; // Return empty array if sheet fails to load
    }
}

// Fetch data from all available sheets
async function fetchAllSheetsData() {
    // Check cache first
    if (multiSheetCache.isValid() && multiSheetCache.data.size > 0) {
        console.log('Using cached multi-sheet data');
        return multiSheetCache.data;
    }

    console.log('Fetching fresh data from multiple sheets');
    showLoading('একাধিক শীট থেকে ডেটা লোড করা হচ্ছে...');

    try {
        // Get available sheets
        const availableSheets = await getAvailableSheets();
        const allSheetData = new Map();
        
        // Fetch data from each sheet
        for (let i = 0; i < availableSheets.length; i++) {
            const sheetName = availableSheets[i];
            updateProgress(i + 1, availableSheets.length, sheetName);
            
            const sheetData = await fetchSheetData(sheetName);
            
            if (sheetData.length > 0) {
                allSheetData.set(sheetName, sheetData);
                console.log(`Successfully loaded ${sheetData.length} records from ${sheetName}`);
            }
            
            // Small delay between requests to avoid rate limiting
            if (i < availableSheets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Cache the data
        multiSheetCache.set(allSheetData);
        
        const totalRecords = multiSheetCache.getSize();
        console.log(`Total records loaded from ${allSheetData.size} sheets: ${totalRecords}`);
        
        return allSheetData;

    } catch (error) {
        console.error('Error fetching multi-sheet data:', error);
        throw error;
    } finally {
        hideLoading();
    }
}

// Search across all sheets
async function searchCertificate() {
    const admitNumber = document.getElementById('admitNumber').value.trim();
    
    if (!admitNumber) {
        showError('অনুগ্রহ করে একটি এ্যাডমিট নাম্বার লিখুন।');
        return;
    }

    try {
        const allSheetsData = await fetchAllSheetsData();
        
        if (allSheetsData.size === 0) {
            showError('কোনো ডেটা পাওয়া যায়নি। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
            return;
        }

        // Search across all sheets
        let foundResult = null;
        let foundInSheet = null;

        for (const [sheetName, sheetData] of allSheetsData) {
            const result = sheetData.find(row => 
                row[0] && row[0].toString().trim() === admitNumber
            );
            
            if (result) {
                foundResult = result;
                foundInSheet = sheetName;
                break;
            }
        }

        if (foundResult) {
            displayResult({
                admitNumber: foundResult[0] || '',
                studentName: foundResult[1] || '',
                fatherName: foundResult[2] || '',
                motherName: foundResult[3] || '',
                institution: foundResult[4] || '',
                course: foundResult[5] || '',
                result: foundResult[6] || ''
            }, foundInSheet);
        } else {
            const totalRecords = multiSheetCache.getSize();
            showError(`এই এ্যাডমিট নাম্বারের কোনো তথ্য পাওয়া যায়নি। ${multiSheetCache.data.size}টি শীটে মোট ${totalRecords}টি রেকর্ড অনুসন্ধান করা হয়েছে।`);
        }

    } catch (error) {
        console.error('Search error:', error);
        
        let errorMessage = 'একটি ত্রুটি ঘটেছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন।';
        
        if (error.message.includes('429')) {
            errorMessage = 'অনেক বেশি অনুরোধ। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
        } else if (error.message.includes('403')) {
            errorMessage = 'API অ্যাক্সেস সমস্যা। অনুগ্রহ করে পরে আবার চেষ্টা করুন।';
        } else if (error.message.includes('404')) {
            errorMessage = 'Google Sheet খুঁজে পাওয়া যায়নি। অনুগ্রহ করে Sheet ID পরীক্ষা করুন।';
        }
        
        showError(errorMessage);
    }
}

// Display result with sheet information
function displayResult(data, sheetName) {
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    
    resultContent.innerHTML = `
        <div class="sheet-info">
            <i class="fas fa-table"></i>
            <span>পাওয়া গেছে: <strong>${sheetName}</strong> শীটে</span>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-id-card"></i>
                এ্যাডমিট নাম্বার
            </div>
            <div class="result-value">${data.admitNumber}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-user"></i>
                পরীক্ষার্থীর নাম
            </div>
            <div class="result-value">${data.studentName}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-male"></i>
                বাবার নাম
            </div>
            <div class="result-value">${data.fatherName}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-female"></i>
                মায়ের নাম
            </div>
            <div class="result-value">${data.motherName}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-university"></i>
                প্রতিষ্ঠান
            </div>
            <div class="result-value">${data.institution}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-book"></i>
                কোর্স
            </div>
            <div class="result-value">${data.course}</div>
        </div>
        
        <div class="result-item">
            <div class="result-label">
                <i class="fas fa-trophy"></i>
                রেজাল্ট
            </div>
            <div class="result-value result-grade">${data.result}</div>
        </div>
    `;
    
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    
    resultContent.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>তথ্য পাওয়া যায়নি</h3>
            <p>${message}</p>
            <button onclick="newSearch()" class="retry-button">
                <i class="fas fa-redo"></i> পুনরায় চেষ্টা করুন
            </button>
        </div>
    `;
    
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function newSearch() {
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('admitNumber').value = '';
    document.getElementById('admitNumber').focus();
}

function printResult() {
    window.print();
}

function downloadResult() {
    const resultContent = document.getElementById('resultContent');
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>সার্টিফিকেট ভেরিফিকেশন রিপোর্ট</title>
            <style>
                body { font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 20px; }
                .result-item { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
                .result-label { font-weight: bold; }
                .result-value { margin-top: 5px; }
                .sheet-info { background: #e3f2fd; padding: 10px; margin-bottom: 15px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>সার্টিফিকেট ভেরিফিকেশন রিপোর্ট</h1>
            ${resultContent.innerHTML}
            <p><small>ডাউনলোডের তারিখ: ${new Date().toLocaleDateString('bn-BD')}</small></p>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// Cache management functions
function clearCache() {
    multiSheetCache.clear();
    console.log('Multi-sheet cache cleared');
}

function getCacheStatus() {
    if (multiSheetCache.isValid()) {
        const age = Math.round((Date.now() - multiSheetCache.timestamp) / 1000);
        const totalRecords = multiSheetCache.getSize();
        return `Cache valid (${age}s old, ${multiSheetCache.data.size} sheets, ${totalRecords} records)`;
    }
    return 'Cache empty or expired';
}

// Get statistics about loaded data
function getDataStatistics() {
    if (!multiSheetCache.isValid()) {
        return 'No data loaded';
    }
    
    const stats = {
        totalSheets: multiSheetCache.data.size,
        totalRecords: multiSheetCache.getSize(),
        sheetsInfo: []
    };
    
    multiSheetCache.data.forEach((data, sheetName) => {
        stats.sheetsInfo.push({
            name: sheetName,
            records: data.length
        });
    });
    
    return stats;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    const admitInput = document.getElementById('admitNumber');
    const searchButton = document.getElementById('searchButton');
    
    // Enter key support
    admitInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchCertificate();
        }
    });
    
    // Search button click
    searchButton.addEventListener('click', searchCertificate);
    
    // Auto-focus on input
    admitInput.focus();
    
    // Add cache status to console for debugging
    console.log('Multi-Sheet Certificate Verifier loaded');
    console.log('Cache status:', getCacheStatus());
    
    // Optional: Add a debug panel (for admin use)
    if (window.location.search.includes('debug=1')) {
        const debugPanel = document.createElement('div');
        debugPanel.style.cssText = 'position:fixed;top:10px;right:10px;background:#f0f0f0;padding:10px;border:1px solid #ccc;z-index:1000;font-size:12px;';
        debugPanel.innerHTML = `
            <button onclick="clearCache()">Clear Cache</button>
            <button onclick="console.log(getCacheStatus())">Cache Status</button>
            <button onclick="console.log(getDataStatistics())">Data Stats</button>
        `;
        document.body.appendChild(debugPanel);
    }
});

// Export functions for debugging
window.certificateVerifier = {
    searchCertificate,
    clearCache,
    getCacheStatus,
    getDataStatistics,
    fetchAllSheetsData
};

