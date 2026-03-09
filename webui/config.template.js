// WebUI Configuration
// Copy this file to config.js and update with your settings

function getRedirectUri() {
    return window.location.origin + '/';
}

function getApiEndpoint() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8001';
    }
    // Same-origin fallback (when WebUI and API share a host or use a reverse proxy)
    return '';
}

window.APP_CONFIG = {
    // OIDC Configuration (disabled by default)
    // To enable, set enabled: true and fill in your OIDC provider details.
    // See docs/authentication.md for Auth0, Keycloak, and Azure AD examples.
    oidc: {
        enabled: false,
        clientId: '',
        redirectUri: getRedirectUri(),
        issuer: '',
        authorizationEndpoint: '',
        tokenEndpoint: '',
        userInfoEndpoint: '',
        jwksUri: '',
        scope: 'openid profile email',
        responseType: 'code',
        allowLocalhost: true
    },

    // API Configuration
    api: {
        defaultEndpoint: getApiEndpoint(),
        endpoints: {
            v2: getApiEndpoint()
        }
    }
};

console.log('[OK] App configuration loaded');
