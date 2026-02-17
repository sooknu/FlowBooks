import jwt from 'jsonwebtoken';

// In-memory cache for OIDC discovery
let discoveryCache: any = null;
let discoveryCacheUrl: string | null = null;
let discoveryCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function discoverEndpoints(baseUrl: string) {
  const now = Date.now();
  if (discoveryCache && discoveryCacheUrl === baseUrl && now - discoveryCacheTime < CACHE_TTL) {
    return discoveryCache;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);
  }

  const config = await res.json();
  const endpoints = {
    authorization_endpoint: config.authorization_endpoint,
    token_endpoint: config.token_endpoint,
    userinfo_endpoint: config.userinfo_endpoint,
  };

  discoveryCache = endpoints;
  discoveryCacheUrl = baseUrl;
  discoveryCacheTime = now;

  return endpoints;
}

export function buildAuthorizationUrl({ authEndpoint, clientId, callbackUrl, state, nonce }: { authEndpoint: string; clientId: string; callbackUrl: string; state: string; nonce: string }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'openid email profile',
    state,
    nonce,
  });

  return `${authEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ tokenEndpoint, code, clientId, clientSecret, callbackUrl }: { tokenEndpoint: string; code: string; clientId: string; clientSecret: string; callbackUrl: string }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { id_token: data.id_token, access_token: data.access_token };
}

export function decodeIdToken(idToken: string, nonce: string) {
  const decoded: any = jwt.decode(idToken);

  if (!decoded) {
    throw new Error('Failed to decode ID token');
  }

  if (decoded.nonce !== nonce) {
    throw new Error('ID token nonce mismatch');
  }

  if (decoded.exp && decoded.exp < Date.now() / 1000) {
    throw new Error('ID token expired');
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    name: decoded.name || decoded.preferred_username || null,
  };
}

export async function fetchUserInfo(userinfoEndpoint: string, accessToken: string) {
  const res = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Userinfo request failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    sub: data.sub,
    email: data.email,
    name: data.name || data.preferred_username || null,
  };
}
