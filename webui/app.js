// Flag to track if auth was just completed
window.authJustCompleted = sessionStorage.getItem('auth_just_completed') === 'true';
if (window.authJustCompleted) {
    console.log('🔄 User just completed authentication - will update UI after DOM loads');
    sessionStorage.removeItem('auth_just_completed');
}

// Check for OAuth callback parameters on page load (legacy support)
(function checkOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    const code = urlParams.get('code') || hashParams.get('code');
    const error = urlParams.get('error') || hashParams.get('error');

    if (code || error) {
        console.log('🔄 OAuth callback detected, processing...');

        // Wait for oidcAuth to be ready
        const waitForAuth = setInterval(() => {
            if (window.oidcAuth) {
                clearInterval(waitForAuth);
                console.log('✓ oidcAuth is ready, handling callback...');

                window.oidcAuth.handleCallback()
                    .then(() => {
                        console.log('✓ Authentication complete');

                        // Remove OAuth parameters from URL
                        window.history.replaceState({}, document.title, window.location.pathname);

                        // Force UI update
                        console.log('🔄 Triggering UI update after callback...');
                        if (typeof updateAuthUI === 'function') {
                            // Try immediately
                            updateAuthUI();

                            // And retry after a short delay to ensure DOM is ready
                            setTimeout(updateAuthUI, 500);
                        }
                    })
                    .catch(err => {
                        console.error('❌ Auth callback failed:', err);
                        // Show error in UI if possible
                        if (typeof showError === 'function') {
                            showError('Authentication failed: ' + err.message);
                        }
                    });
            }
        }, 50);
    }
})();

// Environment detection
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// API Configuration
// Use configuration from config.js (window.APP_CONFIG)
let API = window.APP_CONFIG ? window.APP_CONFIG.api.defaultEndpoint : 'http://localhost:8000';

// Initialize endpoints from config if available
const API_ENDPOINTS = window.APP_CONFIG ? window.APP_CONFIG.api.endpoints : {
    scripts: 'http://localhost:8000',
    v2: 'http://localhost:8001',
    custom: 'http://localhost:8002'
};

let file = null;
let output = null;

let uploadZone, selectBtn, fileInput, fileInfo, fileName, consent, processBtn, skipTextBoxes;
let uploadCard, progressCard, resultsCard, errorCard;
let status, progress, scoreBefore, scoreAfter, scoreImprove, details;
let downloadBtn, resetBtn, retryBtn, errorMsg;
let apiStatus, apiStatusText;

// API Settings elements
let apiScripts, apiV2, apiCustom, customEndpoint, customUrl, testConnection, connectionStatus;
let settingsCard;

// Auth UI elements
let loginBtn, logoutBtn, authSection, userProfile, userName, userEmail, authNotice;

// Authentication helper function
function getAuthHeaders() {
    const headers = {
        'Accept': 'application/json'
    };

    if (window.APP_CONFIG && window.APP_CONFIG.oidc && window.APP_CONFIG.oidc.enabled !== false) {
        if (window.oidcAuth && window.oidcAuth.isAuthenticated()) {
            const authHeader = window.oidcAuth.getAuthorizationHeader();
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }
        }
    }

    return headers;
}

// Update UI based on auth state
function updateAuthUI() {
    // If OIDC is disabled, skip auth entirely and enable uploads
    if (window.APP_CONFIG && window.APP_CONFIG.oidc && window.APP_CONFIG.oidc.enabled === false) {
        const authSection = document.getElementById('authSection');
        const userProfile = document.getElementById('userProfile');
        const authNotice = document.getElementById('authNotice');
        const uploadCard = document.getElementById('uploadCard');
        if (authSection) authSection.style.display = 'none';
        if (userProfile) userProfile.style.display = 'none';
        if (authNotice) authNotice.style.display = 'none';
        if (uploadCard) {
            uploadCard.style.opacity = '1';
            uploadCard.style.pointerEvents = 'auto';
        }
        return;
    }

    if (!window.oidcAuth) {
        console.warn('Auth not loaded yet, retrying in 100ms...');
        setTimeout(updateAuthUI, 100);
        return;
    }

    // Re-fetch elements if they are missing (in case called before DOMContentLoaded)
    authSection = document.getElementById('authSection');
    userProfile = document.getElementById('userProfile');
    userName = document.getElementById('userName');
    userEmail = document.getElementById('userEmail');
    authNotice = document.getElementById('authNotice');
    uploadCard = document.getElementById('uploadCard');
    settingsCard = document.querySelector('.settings-card');
    loginBtn = document.getElementById('loginBtn');
    logoutBtn = document.getElementById('logoutBtn');

    if (!authSection || !userProfile || !authNotice || !uploadCard) {
        console.warn('Auth UI elements not ready yet, retrying in 100ms...');
        setTimeout(updateAuthUI, 100);
        return;
    }

    const isAuthenticated = window.oidcAuth.isAuthenticated();
    console.log('=== updateAuthUI called ===');
    console.log('Is Authenticated:', isAuthenticated);
    console.log('authSection:', authSection);
    console.log('userProfile:', userProfile);
    console.log('loginBtn:', loginBtn);
    console.log('logoutBtn:', logoutBtn);

    if (isAuthenticated) {
        console.log('✓ User is authenticated - showing profile');
        // Show user profile, hide login button
        if (loginBtn) {
            loginBtn.style.display = 'none';
            console.log('  - Hidden login button');
        }
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-block';
            console.log('  - Shown logout button');
        }
        authSection.style.display = 'none';
        userProfile.style.display = 'block';
        authNotice.style.display = 'none';
        console.log('  - Updated section visibility');

        // Display user info
        const userInfo = window.oidcAuth.getUserInfo();
        console.log('User Info:', userInfo);

        if (userInfo) {
            userName.textContent = userInfo.name || 'User';
            userEmail.textContent = userInfo.email || '';
            console.log('  - Set user name:', userInfo.name);
            console.log('  - Set user email:', userInfo.email);
        }

        // Enable upload functionality and settings
        uploadCard.style.opacity = '1';
        uploadCard.style.pointerEvents = 'auto';

        if (settingsCard && IS_LOCALHOST) {
            settingsCard.style.display = 'block';
        }
        console.log('  - Enabled upload functionality');
    } else {
        console.log('✗ User is NOT authenticated - showing login button');
        // Show login button, hide profile
        if (loginBtn) {
            loginBtn.style.display = 'inline-block';
            console.log('  - Shown login button');
        }
        if (logoutBtn) {
            logoutBtn.style.display = 'none';
            console.log('  - Hidden logout button');
        }
        authSection.style.display = 'flex';  // Use flex to maintain layout
        userProfile.style.display = 'none';
        authNotice.style.display = 'block';
        console.log('  - Updated section visibility');

        // Disable upload functionality and settings
        uploadCard.style.opacity = '0.5';
        uploadCard.style.pointerEvents = 'none';

        if (settingsCard) {
            settingsCard.style.display = 'none';
        }
        console.log('  - Disabled upload functionality');
    }
    console.log('=== updateAuthUI complete ===');
}

// Handle login
async function handleLogin() {
    console.log('Login button clicked');
    if (window.oidcAuth) {
        await window.oidcAuth.login();
    } else {
        console.error('Auth not available');
        alert('Authentication system not loaded. Please refresh the page.');
    }
}

// Handle logout
function handleLogout() {
    console.log('Logout button clicked');
    if (window.oidcAuth) {
        window.oidcAuth.logout();
        // Don't reload immediately - update UI first
        updateAuthUI();
        // Clear any stored state
        file = null;
        output = null;
        window.resultBlob = null;
        if (fileInput) fileInput.value = '';
        if (consent) consent.checked = false;
        if (fileInfo) fileInfo.classList.remove('show');
        // Reset to upload card
        if (uploadCard) uploadCard.classList.remove('hidden');
        if (progressCard) progressCard.classList.add('hidden');
        if (resultsCard) resultsCard.classList.add('hidden');
        if (errorCard) errorCard.classList.add('hidden');
    }
}

// API Selection and Configuration
function updateAPI() {
    const selectedApi = document.querySelector('input[name="apiVersion"]:checked').value;

    if (selectedApi === 'custom') {
        API = customUrl.value.trim();
        customEndpoint.classList.add('show');
    } else {
        API = API_ENDPOINTS[selectedApi];
        customEndpoint.classList.remove('show');
    }

    console.log('API updated to:', API);

    // Save preference to localStorage
    localStorage.setItem('preferredAPI', selectedApi);
    if (selectedApi === 'custom') {
        localStorage.setItem('customAPIUrl', API);
    }

    // Update API status indicator
    apiStatusText.textContent = `API: ${API.replace('http://localhost:', 'Port ')}`;

    // Check health of new API
    checkAPIHealth();
}

function loadAPIPreferences() {
    // Single API endpoint, nothing to load
}

async function testAPIConnection(endpoint = null) {
    const testUrl = endpoint || API;
    connectionStatus.innerHTML = `<span class="endpoint-status testing">🔍 Testing ${testUrl}...</span>`;

    try {
        const res = await fetch(`${testUrl}/health`, {
            method: 'GET',
            headers: getAuthHeaders(),
            timeout: 5000
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const health = await res.json();

        if (health.status === 'healthy') {
            const version = health.version || 'Unknown';
            const features = health.config ? Object.keys(health.config).length : 0;
            connectionStatus.innerHTML = `<span class="endpoint-status success">✅ Connected to API v${version} (${features} features configured)</span>`;
            return true;
        } else {
            connectionStatus.innerHTML = `<span class="endpoint-status error">❌ API returned unhealthy status: ${health.status}</span>`;
            return false;
        }
    } catch (error) {
        console.error('Connection test failed:', error);
        connectionStatus.innerHTML = `<span class="endpoint-status error">❌ Connection failed: ${error.message}</span>`;
        return false;
    }
}

// Health check function
async function checkAPIHealth(showErrorDialog = false) {
    try {
        console.log('Checking API health at', `${API}/health`);

        // Update UI to checking state
        apiStatus.className = 'api-status checking';
        apiStatusText.textContent = 'Checking API...';

        const res = await fetch(`${API}/health`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const health = await res.json();
        console.log('API Health Response:', health);

        if (health.status === 'healthy') {
            console.log('✓ API is healthy and ready');

            // Show version-specific info
            const version = health.version || 'Unknown';
            const port = API.includes(':8001') ? '8001 (V2 TOML)' : API.includes(':8000') ? '8000 (Scripts)' : API.split(':').pop();

            // Update UI to healthy state
            apiStatus.className = 'api-status healthy';
            // Show full API URL for better visibility
            apiStatusText.textContent = `API Connected: ${API}`;

            return true;
        } else {
            console.warn('⚠ API health check returned non-healthy status:', health.status);

            // Update UI to error state
            apiStatus.className = 'api-status error';
            apiStatusText.textContent = 'API Unhealthy';

            return false;
        }
    } catch (error) {
        console.error('✗ API health check failed:', error);
        console.error('  Make sure the API server is running on', API);

        // Update UI to error state
        apiStatus.className = 'api-status error';
        apiStatusText.textContent = 'API Offline';

        // Only show error dialog if requested (not on background checks)
        if (showErrorDialog) {
            showError(`Cannot connect to API server at ${API}. Please ensure the server is running.`);
        }

        return false;
    }
}

// Wait for DOM and Rivet to be ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Rivet
    if (typeof Rivet !== 'undefined') {
        Rivet.init();
    }

    // Get DOM elements
    uploadZone = document.getElementById('uploadZone');
    selectBtn = document.getElementById('selectBtn');
    fileInput = document.getElementById('fileInput');
    fileInfo = document.getElementById('fileInfo');
    fileName = document.getElementById('fileName');
    consent = document.getElementById('consent');
    skipTextBoxes = document.getElementById('skipTextBoxes');
    processBtn = document.getElementById('processBtn');
    uploadCard = document.getElementById('uploadCard');
    progressCard = document.getElementById('progressCard');
    resultsCard = document.getElementById('resultsCard');
    errorCard = document.getElementById('errorCard');
    status = document.getElementById('status');
    progress = document.getElementById('progress');
    scoreBefore = document.getElementById('scoreBefore');
    scoreAfter = document.getElementById('scoreAfter');
    scoreImprove = document.getElementById('scoreImprove');
    details = document.getElementById('details');
    downloadBtn = document.getElementById('downloadBtn');
    resetBtn = document.getElementById('resetBtn');
    retryBtn = document.getElementById('retryBtn');
    errorMsg = document.getElementById('errorMsg');
    apiStatus = document.getElementById('apiStatus');
    apiStatusText = document.getElementById('apiStatusText');

    settingsCard = document.querySelector('.settings-card');

    // Auth elements
    loginBtn = document.getElementById('loginBtn');
    logoutBtn = document.getElementById('logoutBtn');
    authSection = document.getElementById('authSection');
    userProfile = document.getElementById('userProfile');
    userName = document.getElementById('userName');
    userEmail = document.getElementById('userEmail');
    authNotice = document.getElementById('authNotice');

    console.log('App initialized');
    console.log('DOM elements check:');
    console.log('- selectBtn:', selectBtn);
    console.log('- fileInput:', fileInput);
    console.log('- fileInfo:', fileInfo);
    console.log('- fileName:', fileName);
    console.log('- consent:', consent);
    console.log('- processBtn:', processBtn);
    console.log('- apiStatus:', apiStatus);
    console.log('- apiStatusText:', apiStatusText);

    // Auth event listeners
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Initialize auth UI - with special handling for just-completed auth
    console.log('Calling initial updateAuthUI...');
    
    // Use requestAnimationFrame to ensure DOM is fully painted before updating
    requestAnimationFrame(() => {
        updateAuthUI();
        
        // If auth was just completed, force multiple updates to ensure UI reflects logged-in state
        if (window.authJustCompleted) {
            console.log('🔄 Auth just completed - forcing multiple UI updates...');
            requestAnimationFrame(() => {
                console.log('🔄 Update #1 (next frame)');
                updateAuthUI();
            });
            setTimeout(() => {
                console.log('🔄 Update #2 (100ms)');
                updateAuthUI();
            }, 100);
            setTimeout(() => {
                console.log('🔄 Update #3 (300ms)');
                updateAuthUI();
            }, 300);
            setTimeout(() => {
                console.log('🔄 Update #4 (500ms - final)');
                updateAuthUI();
            }, 500);
        }
    });

    selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Select button clicked');
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        console.log('File input changed');
        handleFile();
    });

    consent.addEventListener('change', () => {
        console.log('Consent checkbox changed to:', consent.checked);
        updateBtn();
    });

    processBtn.addEventListener('click', process);
    downloadBtn.addEventListener('click', download);
    resetBtn.addEventListener('click', reset);
    retryBtn.addEventListener('click', reset);

    // Duplicate button event listeners for convenience
    document.getElementById('downloadBtnTop').addEventListener('click', download);
    document.getElementById('resetBtnTop').addEventListener('click', reset);

    // Set API endpoint display
    const apiEndpointDisplay = document.getElementById('apiEndpointDisplay');
    if (apiEndpointDisplay) {
        apiEndpointDisplay.textContent = API;
    }

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFile();
        }
    });

    // Check if marked.js loaded
    console.log('Markdown library check:');
    console.log('- marked available:', typeof marked !== 'undefined');
    console.log('- marked.parse available:', typeof marked !== 'undefined' && typeof marked.parse === 'function');
    if (typeof marked !== 'undefined') {
        console.log('- marked version check passed');
    } else {
        console.error('⚠️ marked.js NOT loaded - markdown rendering will not work!');
    }

    // Environment-based UI configuration
    console.log('Environment:', IS_LOCALHOST ? 'Localhost' : 'Production');

    if (!IS_LOCALHOST) {
        // Hide settings card when not running locally
        if (settingsCard) {
            settingsCard.style.display = 'none';
        }
        console.log('Settings card hidden (not localhost)');
    }

    // Load saved API preferences first
    loadAPIPreferences();

    // Check API health on startup
    const isHealthy = await checkAPIHealth();

    if (!isHealthy) {
        console.warn('API is not available. Some features may not work.');
        // Disable process button until API is available
        processBtn.disabled = true;
        processBtn.title = 'API server is not available';
    }

    // Recheck health every 30 seconds
    setInterval(async () => {
        console.log('Periodic health check...');
        await checkAPIHealth();
    }, 30000);

    function handleFile() {
        console.log('handleFile called');
        file = fileInput.files[0];
        console.log('Selected file:', file);

        if (!file) {
            console.log('No file selected');
            return;
        }

        if (!file.name.endsWith('.pptx')) {
            console.log('Invalid file type:', file.name);
            showError('Please select a PowerPoint file (.pptx)');
            return;
        }

        if (file.size > 500 * 1024 * 1024) {
            console.log('File too large:', file.size);
            showError('File too large (max 500MB)');
            return;
        }

        const size = file.size < 1024 ? file.size + ' B' :
            file.size < 1024 * 1024 ? (file.size / 1024).toFixed(1) + ' KB' :
                (file.size / (1024 * 1024)).toFixed(1) + ' MB';

        console.log('Setting fileName to:', `${file.name} (${size})`);
        console.log('fileName element:', fileName);
        console.log('fileInfo element:', fileInfo);

        fileName.textContent = `${file.name} (${size})`;
        fileInfo.classList.add('show');
        console.log('fileInfo classes:', fileInfo.className);

        updateBtn();
    }

    function updateBtn() {
        const hasFile = !!file;
        const hasConsent = consent.checked;
        const shouldEnable = hasFile && hasConsent;

        console.log('updateBtn - hasFile:', hasFile, 'hasConsent:', hasConsent, 'shouldEnable:', shouldEnable);

        processBtn.disabled = !shouldEnable;

        console.log('processBtn.disabled is now:', processBtn.disabled);
    }

    async function process() {
        if (!file || !consent.checked) {
            console.warn('Process called without file or consent');
            return;
        }

        // Check authentication
        if (window.APP_CONFIG && window.APP_CONFIG.oidc && window.APP_CONFIG.oidc.enabled !== false && window.oidcAuth && !window.oidcAuth.isAuthenticated()) {
            showError('Please sign in to process files');
            return;
        }

        console.log('Starting processing for file:', file.name);

        uploadCard.classList.add('hidden');
        progressCard.classList.remove('hidden');

        // Generate a task ID for progress tracking
        const taskId = crypto.randomUUID().substring(0, 8);

        const form = new FormData();
        form.append('file', file);
        form.append('task_id', taskId);

        // Add processing options
        if (skipTextBoxes && skipTextBoxes.checked) {
            form.append('skip_text_boxes', 'true');
        }

        let progressPollInterval = null;
        try {
            console.log('Uploading file to API... (task:', taskId, ')');
            status.textContent = 'Uploading...';
            updateProgress(5);

            const startTime = Date.now();

            // Prepare headers with auth
            const headers = {};
            if (window.oidcAuth && window.oidcAuth.isAuthenticated()) {
                const authHeader = window.oidcAuth.getAuthorizationHeader();
                if (authHeader) {
                    headers['Authorization'] = authHeader;
                }
            }

            // Start polling for progress
            progressPollInterval = setInterval(async () => {
                try {
                    const progRes = await fetch(`${API}/progress/${taskId}`);
                    if (progRes.ok) {
                        const prog = await progRes.json();
                        if (prog.status === 'processing' && prog.total_slides > 0) {
                            const pct = Math.min(90, Math.round((prog.current_slide / prog.total_slides) * 85) + 10);
                            updateProgress(pct);
                            const elapsed = prog.elapsed_seconds || 0;
                            const remaining = prog.estimated_remaining_seconds || 0;
                            status.textContent = `Processing slide ${prog.current_slide} of ${prog.total_slides}` +
                                (remaining > 5 ? ` (~${Math.round(remaining)}s remaining)` : '');
                        }
                    }
                } catch (e) {
                    // Ignore polling errors
                }
            }, 2000);

            // Use the FAST endpoint for quicker processing (no scoring/reports)
            const res = await fetch(`${API}/process-powerpoint-fast`, {
                method: 'POST',
                body: form,
                headers: headers
            });

            // Stop polling once we get a response
            clearInterval(progressPollInterval);

            console.log('Processing complete. Status:', res.status);
            updateProgress(92);
            status.textContent = 'Finalizing...';

            if (!res.ok) {
                console.error('API returned error status:', res.status);

                // Handle authentication errors
                if (res.status === 401) {
                    console.error('Authentication failed');
                    if (window.oidcAuth) {
                        window.oidcAuth.logout();
                    }
                    showError('Authentication expired. Please sign in again.');
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                    return;
                }

                const text = await res.text();
                console.error('Error response:', text);
                let errorMsg = 'Processing failed';
                try {
                    const err = JSON.parse(text);
                    errorMsg = err.detail || errorMsg;
                } catch {
                    errorMsg = text || errorMsg;
                }
                throw new Error(errorMsg);
            }

            console.log('Receiving processed data...');
            updateProgress(60);
            status.textContent = 'Generating alt-text with AI...';

            // The API now returns JSON with file and markdown report
            const data = await res.json();
            console.log('Received JSON response:', {
                filename: data.filename,
                fileSize: data.file_size,
                processingTime: data.processing_time,
                stats: data.stats,
                hasMarkdown: !!data.markdown_report,
                markdownLength: data.markdown_report ? data.markdown_report.length : 0
            });
            console.log('Markdown preview (first 200 chars):', data.markdown_report ? data.markdown_report.substring(0, 200) : 'NO MARKDOWN');

            // Add processing info to the report
            if (data.markdown_report) {
                const processingInfo = `
> [!NOTE]
> **Processing Information**
> * **API Endpoint:** ${API}
> * **Time:** ${new Date().toLocaleString()}
> * **Mode:** Fast Processing
`;
                data.markdown_report = processingInfo + '\n\n' + data.markdown_report;
            }

            updateProgress(90);
            status.textContent = 'Finalizing...';

            const elapsedTime = data.processing_time || ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Processing completed in ${elapsedTime}s`);

            // Decode base64 file
            console.log('Decoding base64 file data...');
            const binaryString = atob(data.file_base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Store as blob for download
            output = data.filename || file.name.replace('.pptx', '_alt-text.pptx');
            window.resultBlob = new Blob([bytes], {
                type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            });

            console.log('File blob created. Size:', window.resultBlob.size);

            updateProgress(100);
            status.textContent = 'Complete!';

            // Display stats
            const slideCount = data.stats.slide_titles || 0;
            const altCount = data.stats.alt_texts || 0;
            const decCount = data.stats.decorative_elements || 0;

            console.log('Setting scoreBefore to:', slideCount);
            console.log('Setting scoreAfter to:', altCount);
            console.log('Setting scoreImprove to:', decCount);

            scoreBefore.textContent = `${slideCount}`;
            scoreAfter.textContent = `${altCount}`;
            scoreImprove.textContent = `${decCount}`;

            // Display markdown report - with enhanced debugging
            setTimeout(() => {
                const detailsElement = document.getElementById('details');
                console.log('Details element found:', detailsElement !== null);
                console.log('Details element visible:', detailsElement ? window.getComputedStyle(detailsElement).display : 'N/A');

                const markdownText = data.markdown_report || 'No report available - processing may have completed without generating a report.';
                console.log('Markdown text length:', markdownText.length);
                console.log('Markdown preview (first 200 chars):', markdownText.substring(0, 200));

                if (detailsElement) {
                    // Render markdown as HTML using marked.js
                    try {
                        if (typeof marked !== 'undefined') {
                            console.log('marked library available:', typeof marked);
                            // Try marked.parse (v4+) or marked() for older versions
                            const htmlContent = marked.parse ? marked.parse(markdownText) : marked(markdownText);
                            console.log('Markdown parsed successfully. HTML length:', htmlContent.length);
                            detailsElement.innerHTML = htmlContent;
                            console.log('✓ Markdown rendered as HTML');
                        } else {
                            console.warn('✗ marked.js library not loaded, displaying as plain text');
                            detailsElement.textContent = markdownText;
                        }
                    } catch (error) {
                        console.error('Error rendering markdown:', error);
                        detailsElement.textContent = markdownText;
                    }
                    console.log('✓ Details element content set successfully');
                } else {
                    console.error('✗ Details element not found in DOM!');
                }

                // Show results after markdown rendering
                progressCard.classList.add('hidden');
                resultsCard.classList.remove('hidden');
            }, 500);

        } catch (e) {
            console.error('Processing error:', e);
            if (progressPollInterval) clearInterval(progressPollInterval);
            showError(e.message || 'Processing error');
        }
    }

    function updateProgress(pct) {
        progress.style.width = `${pct}%`;
    }

    function showResults(data) {
        progressCard.classList.add('hidden');
        resultsCard.classList.remove('hidden');

        scoreBefore.textContent = `${data.before_score}%`;
        scoreAfter.textContent = `${data.after_score}%`;
        scoreImprove.textContent = `+${data.improvement}%`;
        details.textContent = data.markdown_report || JSON.stringify(data, null, 2);
    }

    async function download() {
        if (!output || !window.resultBlob) {
            console.error('Download attempted with no file available');
            showError('No file available to download');
            return;
        }

        try {
            console.log('Starting download:', output);
            const url = URL.createObjectURL(window.resultBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = output;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('Download initiated successfully');
        } catch (e) {
            console.error('Download error:', e);
            showError('Download failed');
        }
    }

    function showError(msg) {
        console.error('Showing error:', msg);
        uploadCard.classList.add('hidden');
        progressCard.classList.add('hidden');
        resultsCard.classList.add('hidden');
        errorCard.classList.remove('hidden');
        errorMsg.textContent = msg;
    }

    function reset() {
        console.log('Resetting application state');
        file = null;
        output = null;
        window.resultBlob = null;
        fileInput.value = '';
        consent.checked = false;
        fileInfo.classList.remove('show');

        uploadCard.classList.remove('hidden');
        progressCard.classList.add('hidden');
        resultsCard.classList.add('hidden');
        errorCard.classList.add('hidden');

        updateProgress(0);
        updateBtn();

        // Ensure auth UI is correct (re-enables upload card if logged in)
        updateAuthUI();

        console.log('Application reset complete');
    }

}); // End DOMContentLoaded
