// OIDC Authentication Module
// Supports Authorization Code flow with PKCE for secure authentication

// Get configuration from config.js or fallback to localStorage
function getAuthConfig() {
    const config = window.APP_CONFIG?.oidc || {};

    return {
        issuer: config.issuer || '',
        authorizationEndpoint: config.authorizationEndpoint || '',
        tokenEndpoint: config.tokenEndpoint || '',
        userInfoEndpoint: config.userInfoEndpoint || '',
        jwksUri: config.jwksUri || '',
        clientId: config.clientId || localStorage.getItem('oidc_client_id') || '',
        // Client Secret removed for Public Client flow
        redirectUri: config.redirectUri || (window.location.origin + '/callback.html'),
        scope: config.scope || 'openid profile email',
        responseType: config.responseType || 'code',
        allowLocalhost: config.allowLocalhost !== false
    };
}

const AUTH_CONFIG = getAuthConfig();

// Log configuration at startup
console.log('=== OIDC Configuration ===');
console.log('Issuer:', AUTH_CONFIG.issuer);
console.log('Authorization Endpoint:', AUTH_CONFIG.authorizationEndpoint);
console.log('Token Endpoint:', AUTH_CONFIG.tokenEndpoint);
console.log('UserInfo Endpoint:', AUTH_CONFIG.userInfoEndpoint);
console.log('Client ID:', AUTH_CONFIG.clientId);
console.log('Redirect URI:', AUTH_CONFIG.redirectUri);
console.log('Scope:', AUTH_CONFIG.scope);
console.log('Response Type:', AUTH_CONFIG.responseType);
console.log('=============================');

class OIDCAuth {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.idToken = null;
        this.userInfo = null;
        this.tokenExpiry = null;

        // Load tokens from storage if available
        this.loadTokensFromStorage();
    }

    // Generate PKCE code verifier and challenge
    async generatePKCE() {
        // Generate random code verifier
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const codeVerifier = this.base64URLEncode(array);

        // Generate code challenge from verifier
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        const codeChallenge = this.base64URLEncode(new Uint8Array(digest));

        return { codeVerifier, codeChallenge };
    }

    // Base64 URL encoding helper
    base64URLEncode(buffer) {
        const base64 = btoa(String.fromCharCode.apply(null, buffer))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        return base64;
    }

    // Generate random state parameter
    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    // Initiate login flow
    async login() {
        try {
            const state = this.generateState();
            const nonce = this.generateState(); // Generate nonce for ID token validation

            // Check if we need PKCE (only for authorization code flow)
            const isCodeFlow = AUTH_CONFIG.responseType.includes('code');
            let params = {
                response_type: AUTH_CONFIG.responseType,
                client_id: AUTH_CONFIG.clientId,
                redirect_uri: AUTH_CONFIG.redirectUri,
                scope: AUTH_CONFIG.scope,
                state: state,
                nonce: nonce,
                response_mode: 'fragment'  // Required for implicit flow - tokens in URL hash
            };

            if (isCodeFlow) {
                // Generate and store PKCE parameters for code flow
                const { codeVerifier, codeChallenge } = await this.generatePKCE();
                sessionStorage.setItem('pkce_code_verifier', codeVerifier);
                params.code_challenge = codeChallenge;
                params.code_challenge_method = 'S256';

                console.log('💾 Using authorization code flow with PKCE');
            } else {
                console.log('💾 Using implicit flow (no PKCE needed)');
            }

            // Store state and nonce for callback validation
            sessionStorage.setItem('oidc_state', state);
            sessionStorage.setItem('oidc_nonce', nonce);

            console.log('💾 Stored in sessionStorage:', {
                state: state.substring(0, 10) + '...',
                nonce: nonce.substring(0, 10) + '...',
                flow: isCodeFlow ? 'code' : 'implicit'
            });

            // Build authorization URL
            const urlParams = new URLSearchParams(params);

            const authUrl = `${AUTH_CONFIG.authorizationEndpoint}?${urlParams.toString()}`;

            console.log('=== OIDC Authorization Request Debug ===');
            console.log('Authorization Endpoint:', AUTH_CONFIG.authorizationEndpoint);
            console.log('Client ID:', AUTH_CONFIG.clientId);
            console.log('Redirect URI:', AUTH_CONFIG.redirectUri);
            console.log('Response Type:', AUTH_CONFIG.responseType);
            console.log('Response Type (from params):', params.response_type);
            console.log('Scope:', AUTH_CONFIG.scope);
            console.log('Flow Type:', isCodeFlow ? 'Authorization Code' : 'Implicit');
            console.log('State:', state.substring(0, 10) + '...');
            console.log('');
            console.log('📋 All URL Parameters:');
            for (const [key, value] of urlParams.entries()) {
                console.log(`  ${key}: ${value}`);
            }
            console.log('');
            console.log('Full Auth URL:', authUrl);
            console.log('');
            console.log('⚠️  NOTE: Client secret is NOT sent in authorization request');
            console.log('⚠️  It will be used later during token exchange');
            console.log('========================================');

            // Copy URL to clipboard for debugging
            if (navigator.clipboard) {
                navigator.clipboard.writeText(authUrl).then(() => {
                    console.log('✓ Auth URL copied to clipboard');
                });
            }

            // Redirect to OIDC provider
            window.location.href = authUrl;

        } catch (error) {
            console.error('Login failed:', error);
            throw new Error('Failed to initiate login: ' + error.message);
        }
    }

    // Handle callback after successful authentication
    async handleCallback() {
        try {
            // Parse callback URL from both query string and hash fragment
            const urlParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(window.location.hash.substring(1));

            const code = urlParams.get('code') || hashParams.get('code');
            const state = urlParams.get('state') || hashParams.get('state');
            const error = urlParams.get('error') || hashParams.get('error');
            const id_token = hashParams.get('id_token'); // ID token comes in hash
            const access_token = hashParams.get('access_token'); // Access token comes in hash for implicit flow
            const expires_in = hashParams.get('expires_in');

            console.log('🔍 Callback parameters:', {
                code: code ? 'present' : 'missing',
                state: state ? state.substring(0, 10) + '...' : 'missing',
                id_token: id_token ? 'present' : 'missing',
                access_token: access_token ? 'present' : 'missing',
                error
            });

            // Check for errors
            if (error) {
                throw new Error(`Authentication error: ${error} - ${urlParams.get('error_description') || hashParams.get('error_description')}`);
            }

            // Validate state parameter (if we have one stored)
            const storedState = sessionStorage.getItem('oidc_state');
            console.log('🔍 State validation:', {
                received: state ? state.substring(0, 10) + '...' : 'none',
                stored: storedState ? storedState.substring(0, 10) + '...' : 'none',
                match: state === storedState
            });

            // Only validate state if we have one stored (means this is part of our flow)
            // If no stored state but we have tokens, it might be a page refresh after successful auth
            if (storedState && state !== storedState) {
                console.error('❌ State mismatch! Received:', state, 'Stored:', storedState);
                throw new Error('Invalid state parameter - possible CSRF attack');
            }

            if (!storedState && (access_token || code)) {
                console.warn('⚠️  No stored state found, but tokens present. Proceeding (might be page refresh).');
            }

            // Handle implicit flow (tokens in URL) or authorization code flow
            if (access_token && id_token) {
                console.log('✓ Implicit/Hybrid flow: tokens received directly');

                // Store tokens to class properties AND localStorage
                this.accessToken = access_token;
                this.idToken = id_token;
                this.tokenExpiry = Date.now() + (parseInt(expires_in) || 3600) * 1000;

                localStorage.setItem('oidc_access_token', access_token);
                localStorage.setItem('oidc_id_token', id_token);
                localStorage.setItem('oidc_token_expires_at', this.tokenExpiry.toString());

                // No refresh token in implicit flow
                console.log('⚠️  Note: Implicit flow does not provide refresh tokens');
                console.log('✓ Tokens stored successfully');

            } else if (code) {
                console.log('✓ Authorization code flow: exchanging code for tokens');
                // Exchange code for tokens
                await this.exchangeCodeForTokens(code);
            } else {
                throw new Error('No tokens or authorization code received');
            }

            // Clean up session storage
            sessionStorage.removeItem('oidc_state');
            sessionStorage.removeItem('pkce_code_verifier');

            // Extract user info from ID token (to avoid CORS issues with UserInfo endpoint)
            if (this.idToken) {
                try {
                    // Decode ID token (JWT format: header.payload.signature)
                    const payload = this.idToken.split('.')[1];
                    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));

                    // Build display name from available fields
                    let displayName = decoded.name;
                    if (!displayName && decoded.given_name && decoded.family_name) {
                        displayName = `${decoded.given_name} ${decoded.family_name}`;
                    } else if (!displayName && decoded.given_name) {
                        displayName = decoded.given_name;
                    } else if (!displayName) {
                        displayName = decoded.preferred_username || decoded.email || decoded.sub;
                    }

                    this.userInfo = {
                        sub: decoded.sub,
                        name: displayName,
                        email: decoded.email || decoded.preferred_username || decoded.sub,
                        preferred_username: decoded.preferred_username,
                        given_name: decoded.given_name,
                        family_name: decoded.family_name
                    };

                    localStorage.setItem('oidc_user_info', JSON.stringify(this.userInfo));
                    console.log('✓ User info extracted from ID token:', this.userInfo);
                } catch (err) {
                    console.warn('⚠️  Could not decode ID token, trying UserInfo endpoint:', err);
                    // Fall back to UserInfo endpoint (might have CORS issues)
                    await this.fetchUserInfo();
                }
            } else {
                // No ID token, try UserInfo endpoint
                await this.fetchUserInfo();
            }

            return true;

        } catch (error) {
            console.error('Callback handling failed:', error);
            throw error;
        }
    }

    // Exchange authorization code for tokens
    async exchangeCodeForTokens(code) {
        try {
            const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

            if (!codeVerifier) {
                throw new Error('PKCE code verifier not found');
            }

            // Prepare token request
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: AUTH_CONFIG.redirectUri,
                client_id: AUTH_CONFIG.clientId,
                code_verifier: codeVerifier
            });

            console.log('=== OIDC Token Exchange Request Debug ===');
            console.log('Token Endpoint:', AUTH_CONFIG.tokenEndpoint);
            console.log('Grant Type:', 'authorization_code');
            console.log('Authorization Code:', code);
            console.log('Redirect URI:', AUTH_CONFIG.redirectUri);
            console.log('Client ID:', AUTH_CONFIG.clientId);
            console.log('Code Verifier (PKCE):', codeVerifier);
            console.log('Request Body:', body.toString());
            console.log('=========================================');

            // Request tokens (Public Client - no Authorization header)
            console.log('=== Token Request (Public Client) ===');
            console.log('Token Endpoint:', AUTH_CONFIG.tokenEndpoint);

            const response = await fetch(AUTH_CONFIG.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('=== Token Exchange Error ===');
                console.error('Status:', response.status);
                console.error('Status Text:', response.statusText);
                console.error('Response Body:', errorText);
                console.error('============================');

                let errorData = {};
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    // Not JSON
                }

                throw new Error(`Token exchange failed: ${response.status} - ${errorData.error_description || errorData.error || response.statusText}`);
            }

            const tokens = await response.json();

            // Store tokens
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.idToken = tokens.id_token;

            // Calculate expiry time
            if (tokens.expires_in) {
                this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            }

            // Save to storage
            this.saveTokensToStorage();

            console.log('✓ Tokens obtained successfully');

        } catch (error) {
            console.error('Token exchange failed:', error);
            throw error;
        }
    }

    // Fetch user information
    async fetchUserInfo() {
        try {
            if (!this.accessToken) {
                throw new Error('No access token available');
            }

            const response = await fetch(AUTH_CONFIG.userInfoEndpoint, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`UserInfo request failed: ${response.status}`);
            }

            this.userInfo = await response.json();

            // Save to storage
            localStorage.setItem('oidc_user_info', JSON.stringify(this.userInfo));

            console.log('✓ User info retrieved:', this.userInfo);

            return this.userInfo;

        } catch (error) {
            console.error('Failed to fetch user info:', error);
            throw error;
        }
    }

    // Refresh access token using refresh token
    async refreshAccessToken() {
        try {
            if (!this.refreshToken) {
                throw new Error('No refresh token available');
            }

            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: AUTH_CONFIG.clientId
            });

            const response = await fetch(AUTH_CONFIG.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                // If refresh fails, user needs to re-authenticate
                this.logout();
                throw new Error('Token refresh failed - please log in again');
            }

            const tokens = await response.json();

            // Update tokens
            this.accessToken = tokens.access_token;
            if (tokens.refresh_token) {
                this.refreshToken = tokens.refresh_token;
            }
            if (tokens.id_token) {
                this.idToken = tokens.id_token;
            }

            // Update expiry
            if (tokens.expires_in) {
                this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            }

            // Save to storage
            this.saveTokensToStorage();

            console.log('✓ Access token refreshed');

            return this.accessToken;

        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.accessToken !== null && !this.isTokenExpired();
    }

    // Check if token is expired
    isTokenExpired() {
        if (!this.tokenExpiry) {
            return true;
        }
        // Add 60 second buffer
        return Date.now() >= (this.tokenExpiry - 60000);
    }

    // Get valid access token (refresh if needed)
    async getAccessToken() {
        if (!this.accessToken) {
            return null;
        }

        if (this.isTokenExpired() && this.refreshToken) {
            await this.refreshAccessToken();
        }

        return this.accessToken;
    }

    // Get user info
    getUserInfo() {
        return this.userInfo;
    }

    // Logout
    logout() {
        // Clear tokens
        this.accessToken = null;
        this.refreshToken = null;
        this.idToken = null;
        this.userInfo = null;
        this.tokenExpiry = null;

        // Clear storage
        localStorage.removeItem('oidc_access_token');
        localStorage.removeItem('oidc_refresh_token');
        localStorage.removeItem('oidc_id_token');
        localStorage.removeItem('oidc_token_expiry');
        localStorage.removeItem('oidc_user_info');
        sessionStorage.clear();

        console.log('✓ Logged out');
    }

    // Save tokens to local storage
    saveTokensToStorage() {
        if (this.accessToken) {
            localStorage.setItem('oidc_access_token', this.accessToken);
        }
        if (this.refreshToken) {
            localStorage.setItem('oidc_refresh_token', this.refreshToken);
        }
        if (this.idToken) {
            localStorage.setItem('oidc_id_token', this.idToken);
        }
        if (this.tokenExpiry) {
            localStorage.setItem('oidc_token_expiry', this.tokenExpiry.toString());
        }
    }

    // Load tokens from local storage
    loadTokensFromStorage() {
        this.accessToken = localStorage.getItem('oidc_access_token');
        this.refreshToken = localStorage.getItem('oidc_refresh_token');
        this.idToken = localStorage.getItem('oidc_id_token');

        const expiry = localStorage.getItem('oidc_token_expires_at');
        if (expiry) {
            this.tokenExpiry = parseInt(expiry);
        }

        const userInfoStr = localStorage.getItem('oidc_user_info');
        if (userInfoStr) {
            try {
                this.userInfo = JSON.parse(userInfoStr);
            } catch (e) {
                console.error('Failed to parse stored user info:', e);
            }
        }

        // If tokens are expired, clear them
        if (this.isTokenExpired()) {
            this.logout();
        }
    }

    // Set client ID (after app registration)
    setClientId(clientId) {
        AUTH_CONFIG.clientId = clientId;
        localStorage.setItem('oidc_client_id', clientId);
    }

    // Get authorization header for API calls
    getAuthorizationHeader() {
        // Prefer access token if it's a JWT; fall back to ID token otherwise
        if (this.accessToken) {
            if (this.accessToken.includes('.')) {
                return `Bearer ${this.accessToken}`;
            }
        }

        if (this.idToken) {
            return `Bearer ${this.idToken}`;
        }

        return null;
    }
}

// Export singleton instance
const oidcAuth = new OIDCAuth();

// Make it globally available
if (typeof window !== 'undefined') {
    window.oidcAuth = oidcAuth;
}
