# Authentication Setup

By default, authentication is **disabled**. The tool works out of the box
without any identity provider.

## Enabling OIDC Authentication

To protect the tool behind an OIDC provider (Auth0, Keycloak, Azure AD, etc.):

### 1. API Side

Set these environment variables (or in `config.toml`):

```bash
AUTH_DISABLED=0  # or remove AUTH_DISABLED entirely
```

In `config.toml` (or `default.toml`):

```toml
[auth]
require_auth = true
issuer = "https://your-issuer.example.com"
audience = "your-client-id"
jwks_url = "https://your-issuer.example.com/.well-known/jwks.json"
algorithms = ["RS256"]
```

### 2. WebUI Side

Edit `webui/config.js` (copy from `config.template.js`):

```javascript
oidc: {
    enabled: true,
    clientId: 'your-client-id',
    redirectUri: getRedirectUri(),
    issuer: 'https://your-issuer.example.com',
    authorizationEndpoint: 'https://your-issuer.example.com/authorize',
    tokenEndpoint: 'https://your-issuer.example.com/oauth/token',
    userInfoEndpoint: 'https://your-issuer.example.com/userinfo',
    scope: 'openid profile email',
    responseType: 'code',
    allowLocalhost: true
}
```

### Provider Examples

#### Auth0

```javascript
oidc: {
    enabled: true,
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    issuer: 'https://YOUR_DOMAIN.auth0.com',
    authorizationEndpoint: 'https://YOUR_DOMAIN.auth0.com/authorize',
    tokenEndpoint: 'https://YOUR_DOMAIN.auth0.com/oauth/token',
    userInfoEndpoint: 'https://YOUR_DOMAIN.auth0.com/userinfo',
    // ...
}
```

#### Keycloak

```javascript
oidc: {
    enabled: true,
    clientId: 'pptx-tool',
    issuer: 'https://keycloak.example.com/realms/myrealm',
    authorizationEndpoint: 'https://keycloak.example.com/realms/myrealm/protocol/openid-connect/auth',
    tokenEndpoint: 'https://keycloak.example.com/realms/myrealm/protocol/openid-connect/token',
    userInfoEndpoint: 'https://keycloak.example.com/realms/myrealm/protocol/openid-connect/userinfo',
    // ...
}
```

#### Azure AD (Entra ID)

```javascript
oidc: {
    enabled: true,
    clientId: 'YOUR_APP_CLIENT_ID',
    issuer: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0',
    authorizationEndpoint: 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    // ...
}
```
