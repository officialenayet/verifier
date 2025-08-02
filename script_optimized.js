// Optimized Certificate Verifier Script for Large Datasets
// This version includes pagination, caching, and performance optimizations

const CONFIG = {
    API_KEY: 'AIzaSyCiEgyS_hZLOPYfntM2b5imvAx9iIWBSHY',
    SHEET_ID: '1ia2pkU2Zx0IKF4XI4Os_pVZfdlFqb815IwkDmc9IBpc',
    SHEET_NAME: 'Sheet1',
    BATCH_SIZE: 1000, // Process data in batches of 1000 rows
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes cache
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000 // 1 second initial delay
};

// Cache management
let dataCache = {
    data: null,
    timestamp: null,
    isValid: function() {
        return this.data && this.timestamp && 
               (Date.now() - this.timestamp) < CONFIG.CACHE_DURATION;
    },
    set: function(data) {
        this.data = data;
        this.timestamp = Date.now();
    },
    clear: function() {
        this.data = null;
        this.timestamp = null;
    }
};

// Loading state management
function showLoading() {
    const searchButton = document.getElementById('searchButton');
    const originalText = searchButton.innerHTML;
    searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> অনুসন্ধান করা হচ্ছে...';
    searchButton.disabled = true;
    searchButton.dataset.originalText = originalText;
}

function hideLoading() {
    const searchButton = document.getElementById('searchButton');
    const originalText = searchButton.dataset.originalText || '<i class="fas fa-search"></i> সার্চ করুন';
    searchButton.innerHTML = originalText;
    searchButton.disabled = false;
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
            
            // Exponential backoff with jitter
            const delay = CONFIG.RETRY_DELAY * Math.pow(2, retries - 1) + Math.random() * 1000;
            console.log(`Retry ${retries}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Optimized data fetching with pagination
async function fetchAllData() {
    // Check cache first
    if (dataCache.isValid()) {
        console.log('Using cached data');
        return dataCache.data;
    }

    console.log('Fetching fresh data from Google Sheets');
    showLoading();

    try {
        // First, get the sheet metadata to determine the actual data range
        const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}?key=${CONFIG.API_KEY}&fields=sheets.properties`;
        
        const metadataResponse = await retryWithBackoff(async () => {
            const response = await fetch(metadataUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        });

        // Get the actual row count (this is an approximation)
        const sheet = metadataResponse.sheets.find(s => s.properties.title === CONFIG.SHEET_NAME);
        const maxRows = sheet ? sheet.properties.gridProperties.rowCount : 1000;

        console.log(`Sheet has approximately ${maxRows} rows`);

        // Fetch data in batches to handle large datasets
        let allData = [];
        let startRow = 2; // Start from row 2 (after header)
        let hasMoreData = true;

        while (hasMoreData && startRow <= maxRows) {
            const endRow = Math.min(startRow + CONFIG.BATCH_SIZE - 1, maxRows);
            const range = `${CONFIG.SHEET_NAME}!A${startRow}:G${endRow}`;
            
            console.log(`Fetching batch: ${range}`);

            const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}&majorDimension=ROWS`;

            const batchData = await retryWithBackoff(async () => {
                const response = await fetch(batchUrl, {
                    headers: {
                        'Accept-Encoding': 'gzip',
                        'User-Agent': 'Certificate-Verifier (gzip)'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response.json();
            });

            if (batchData.values && batchData.values.length > 0) {
                allData = allData.concat(batchData.values);
                startRow = endRow + 1;
                
                // If we got less data than expected, we've reached the end
                if (batchData.values.length < CONFIG.BATCH_SIZE) {
                    hasMoreData = false;
                }
            } else {
                hasMoreData = false;
            }

            // Add a small delay between batches to avoid rate limiting
            if (hasMoreData) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`Total rows fetched: ${allData.length}`);

        // Cache the data
        dataCache.set(allData);
        
        return allData;

    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    } finally {
        hideLoading();
    }
}

// Optimized search function
async function searchCertificate() {
    const admitNumber = document.getElementById('admitNumber').value.trim();
    
    if (!admitNumber) {
        showError('অনুগ্রহ করে একটি এ্যাডমিট নাম্বার লিখুন।');
        return;
    }

    try {
        const data = await fetchAllData();
        
        if (!data || data.length === 0) {
            showError('কোনো ডেটা পাওয়া যায়নি। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
            return;
        }

        // Search for the admit number in the data
        const result = data.find(row => row[0] && row[0].toString().trim() === admitNumber);

        if (result) {
            displayResult({
                admitNumber: result[0] || '',
                studentName: result[1] || '',
                fatherName: result[2] || '',
                motherName: result[3] || '',
                institution: result[4] || '',
                course: result[5] || '',
                result: result[6] || ''
            });
        } else {
            showError('এই এ্যাডমিট নাম্বারের কোনো তথ্য পাওয়া যায়নি। অনুগ্রহ করে নাম্বারটি পুনরায় পরীক্ষা করুন।');
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

// Display functions (same as original)
function displayResult(data) {
    const resultSection = document.getElementById('resultSection');
    const resultContent = document.getElementById('resultContent');
    
    resultContent.innerHTML = `
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
    dataCache.clear();
    console.log('Cache cleared');
}

function getCacheStatus() {
    if (dataCache.isValid()) {
        const age = Math.round((Date.now() - dataCache.timestamp) / 1000);
        return `Cache valid (${age}s old, ${dataCache.data.length} records)`;
    }
    return 'Cache empty or expired';
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
    console.log('Certificate Verifier loaded with optimizations');
    console.log('Cache status:', getCacheStatus());
    
    // Optional: Add a cache refresh button (for admin use)
    if (window.location.search.includes('debug=1')) {
        const debugPanel = document.createElement('div');
        debugPanel.style.cssText = 'position:fixed;top:10px;right:10px;background:#f0f0f0;padding:10px;border:1px solid #ccc;z-index:1000;';
        debugPanel.innerHTML = `
            <button onclick="clearCache()">Clear Cache</button>
            <button onclick="console.log(getCacheStatus())">Cache Status</button>
        `;
        document.body.appendChild(debugPanel);
    }
});

// Export functions for debugging
window.certificateVerifier = {
    searchCertificate,
    clearCache,
    getCacheStatus,
    fetchAllData
};

