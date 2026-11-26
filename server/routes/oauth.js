import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  buildAuthUser,
  createRequireAuth,
  hashSessionToken,
  normalizeResourceUri,
  requireAiAccess,
} from '../middleware/auth.js';
import { applyExternalApiCors, createRateLimiter } from '../middleware/security.js';
import { resolveBaseUrl } from '../services/diagramService.js';

const AUTH_CODE_PREFIX = 'fbc_';
const CLIENT_ID_PREFIX = 'fb_cli_';
const CLIENT_SECRET_PREFIX = 'fbs_';
const DEFAULT_SCOPE = 'mcp:tools';
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const FORBIDDEN_REDIRECT_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

/**
 * Constant-time UTF-8 string comparison to prevent timing side-channels.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqualString(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validate an OAuth 2.1 redirect URI (RFC 6749 + RFC 8252):
 * - Allows HTTPS URLs
 * - Allows HTTP loopback URLs (localhost, 127.0.0.1, [::1]) for desktop/CLI MCP clients
 * - Allows safe custom URI schemes for native desktop apps (excluding dangerous schemes)
 * - Strictly forbids URL fragments (#...) and credentials in URL
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidRedirectUri(raw) {
  if (typeof raw !== 'string' || raw.length < 4 || raw.length > 2048) return false;
  if (raw.includes('#') || /\s/.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (FORBIDDEN_REDIRECT_SCHEMES.has(protocol)) return false;
    if (parsed.username || parsed.password) return false;

    if (protocol === 'https:') {
      return Boolean(parsed.hostname);
    }
    if (protocol === 'http:') {
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    }
    // Custom native app schemes (e.g. cursor://, vscode://) must match RFC 3986 scheme syntax
    return /^[a-z][a-z0-9+.-]*:$/.test(protocol);
  } catch {
    return false;
  }
}

/**
 * Extract human-readable host/scheme label for the OAuth consent UI.
 * @param {string} redirectUri
 * @returns {string}
 */
function describeRedirectTarget(redirectUri) {
  try {
    const parsed = new URL(redirectUri);
    return parsed.host || parsed.protocol.replace(/:$/, '');
  } catch {
    return redirectUri;
  }
}

/**
 * Verify that an optional RFC 8707 `resource` indicator targets this FlowBoard server.
 * @param {string | undefined} rawResource
 * @param {string} baseUrl
 * @returns {{ ok: boolean, normalized: string | null }}
 */
function validateResourceIndicator(rawResource, baseUrl) {
  if (!rawResource || !rawResource.trim()) {
    return { ok: true, normalized: `${baseUrl}/api/mcp` };
  }
  const normalized = normalizeResourceUri(rawResource);
  const expectedMcp = normalizeResourceUri(`${baseUrl}/api/mcp`);
  const expectedOrigin = normalizeResourceUri(baseUrl);
  if (!normalized || !expectedMcp || !expectedOrigin) {
    return { ok: false, normalized: null };
  }
  if (normalized === expectedMcp || normalized === expectedOrigin) {
    return { ok: true, normalized: expectedMcp };
  }
  return { ok: false, normalized: null };
}

/**
 * Build RFC 9728 OAuth 2.0 Protected Resource Metadata for FlowBoard MCP.
 * @param {string} baseUrl
 */
export function buildProtectedResourceMetadata(baseUrl) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [DEFAULT_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'FlowBoard MCP Server',
    resource_documentation: `${baseUrl}/llms.txt`,
  };
}

/**
 * Build RFC 8414 OAuth 2.0 Authorization Server Metadata for FlowBoard MCP.
 * @param {string} baseUrl
 */
export function buildAuthorizationServerMetadata(baseUrl) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [DEFAULT_SCOPE],
    service_documentation: `${baseUrl}/llms.txt`,
  };
}

/**
 * Parse RFC 6749 HTTP Basic client credentials if present.
 * @param {import('express').Request} req
 * @returns {{ clientId: string, clientSecret: string } | null}
 */
function extractBasicClientCredentials(req) {
  const header = req.get('Authorization');
  if (!header || !/^Basic\s+/i.test(header)) return null;
  const encoded = header.replace(/^Basic\s+/i, '').trim();
  try {
    const decoded = atob(encoded);
    const sep = decoded.indexOf(':');
    if (sep <= 0) return null;
    const rawId = decoded.slice(0, sep);
    const rawSecret = decoded.slice(sep + 1);
    return {
      clientId: decodeURIComponent(rawId),
      clientSecret: decodeURIComponent(rawSecret),
    };
  } catch {
    return null;
  }
}

/**
 * Build safe redirect URL with OAuth response parameters appended.
 * @param {string} redirectUri
 * @param {Record<string, string | undefined>} params
 * @returns {string}
 */
function buildRedirectWithParams(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      url.searchParams.set(key, val);
    }
  }
  return url.toString();
}

const RegisterClientSchema = z.object({
  client_name: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : 'MCP Client'),
    z.string().min(1).max(256),
  ),
  redirect_uris: z
    .array(z.string().trim())
    .min(1, 'redirect_uris wajib berisi minimal 1 URI.')
    .max(20, 'Maksimal 20 redirect_uris per klien.'),
  grant_types: z.array(z.string().trim()).max(10).optional(),
  response_types: z.array(z.string().trim()).max(10).optional(),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .optional()
    .default('none'),
  scope: z.string().trim().max(1024).optional(),
});

const AuthorizeParamsSchema = z.object({
  client_id: z.string().trim().min(1, 'client_id wajib diisi.').max(512),
  redirect_uri: z.string().trim().min(1, 'redirect_uri wajib diisi.').max(2048),
  response_type: z.literal('code'),
  code_challenge: z
    .string()
    .trim()
    .regex(PKCE_PATTERN, 'code_challenge PKCE tidak valid (harus 43-128 karakter base64url).'),
  code_challenge_method: z.literal('S256'),
  // Real-world AI connectors (Claude.ai, ChatGPT, Gemini) often pass encrypted JWT/JWE `state` > 512 chars
  state: z.string().max(4096).optional().default(''),
  scope: z.string().max(1024).optional().default(DEFAULT_SCOPE),
  resource: z.string().max(2048).optional(),
});

const AuthorizeDecisionSchema = AuthorizeParamsSchema.extend({
  decision: z.enum(['approve', 'deny']),
});

/**
 * Load and verify an OAuth client record plus exact redirect_uri membership.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} clientId
 * @param {string} redirectUri
 */
async function loadAndVerifyClient(db, clientId, redirectUri) {
  const row = /** @type {{ client_id: string, client_name: string, redirect_uris_json: string, token_endpoint_auth_method: string, client_secret_hash: string | null } | undefined} */ (
    await db.get(
      `SELECT client_id, client_name, redirect_uris_json, token_endpoint_auth_method, client_secret_hash
       FROM oauth_clients
       WHERE client_id = ?`,
      [clientId],
    )
  );
  if (!row) {
    return { error: 'Klien OAuth tidak terdaftar.', status: 400 };
  }

  /** @type {string[]} */
  let redirectUris = [];
  try {
    redirectUris = JSON.parse(row.redirect_uris_json);
  } catch {
    redirectUris = [];
  }

  if (!redirectUris.includes(redirectUri)) {
    return { error: 'redirect_uri tidak cocok dengan daftar yang terdaftar pada klien.', status: 400 };
  }

  return { client: row };
}

/**
 * Create public `.well-known` OAuth 2.1 metadata discovery router (RFC 9728 & RFC 8414).
 */
export function createOAuthWellKnownRouter() {
  const router = express.Router();
  router.use(applyExternalApiCors);

  router.get('/oauth-protected-resource', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    return res.status(200).json(buildProtectedResourceMetadata(baseUrl));
  });

  // RFC 9728 path-scoped discovery for `/api/mcp`
  router.get('/oauth-protected-resource/api/mcp', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    return res.status(200).json(buildProtectedResourceMetadata(baseUrl));
  });

  router.get('/oauth-authorization-server', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    return res.status(200).json(buildAuthorizationServerMetadata(baseUrl));
  });

  router.get('/openid-configuration', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    return res.status(200).json(buildAuthorizationServerMetadata(baseUrl));
  });

  return router;
}

/**
 * Create OAuth 2.1 + Dynamic Client Registration router mounted at `/api/oauth`.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ enableRateLimit?: boolean }} [options]
 */
export function createOAuthRouter(db, options = {}) {
  const router = express.Router();
  const requireAuth = createRequireAuth(db);

  const registerLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    enabled: options.enableRateLimit !== false,
  });
  const tokenLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    enabled: options.enableRateLimit !== false,
  });

  // Fallback redirect if an OAuth client opens `/api/oauth/authorize` directly
  router.get('/authorize', (req, res) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query || {})) {
      if (typeof value === 'string') {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    return res.redirect(302, qs ? `/oauth/authorize?${qs}` : '/oauth/authorize');
  });

  // RFC 7591 Dynamic Client Registration (public, CORS-enabled, rate-limited)
  router.post('/register', applyExternalApiCors, registerLimit, async (req, res, next) => {
    try {
      const parsed = RegisterClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: parsed.error.issues[0]?.message || 'Metadata klien OAuth tidak valid.',
        });
      }

      const {
        client_name: clientName,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: authMethod,
      } = parsed.data;

      for (const uri of redirectUris) {
        if (!isValidRedirectUri(uri)) {
          return res.status(400).json({
            error: 'invalid_redirect_uri',
            error_description: `redirect_uri tidak valid atau tidak aman: ${uri}`,
          });
        }
      }

      const grantTypes = ['authorization_code', 'refresh_token'];
      const responseTypes = ['code'];
      const clientId = `${CLIENT_ID_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
      const rawSecret =
        authMethod === 'none'
          ? null
          : `${CLIENT_SECRET_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
      const secretHash = rawSecret ? hashSessionToken(rawSecret) : null;
      const now = new Date();
      const issuedAt = Math.floor(now.getTime() / 1000);

      await db.run(
        `INSERT INTO oauth_clients (
           client_id, client_secret_hash, client_name, redirect_uris_json,
           token_endpoint_auth_method, grant_types_json, response_types_json, scope, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientId,
          secretHash,
          clientName,
          JSON.stringify(redirectUris),
          authMethod,
          JSON.stringify(grantTypes),
          JSON.stringify(responseTypes),
          DEFAULT_SCOPE,
          now.toISOString(),
        ],
      );

      return res.status(201).json({
        client_id: clientId,
        ...(rawSecret ? { client_secret: rawSecret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: issuedAt,
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: grantTypes,
        response_types: responseTypes,
        token_endpoint_auth_method: authMethod,
        scope: DEFAULT_SCOPE,
      });
    } catch (err) {
      return next(err);
    }
  });

  // Session-authenticated endpoint for the React OAuth consent page to inspect & validate parameters
  router.get('/authorize/info', requireAuth, async (req, res, next) => {
    try {
      const parsed = AuthorizeParamsSchema.safeParse({
        client_id: typeof req.query.client_id === 'string' ? req.query.client_id : '',
        redirect_uri: typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '',
        response_type: typeof req.query.response_type === 'string' ? req.query.response_type : '',
        code_challenge: typeof req.query.code_challenge === 'string' ? req.query.code_challenge : '',
        code_challenge_method:
          typeof req.query.code_challenge_method === 'string'
            ? req.query.code_challenge_method
            : '',
        state: typeof req.query.state === 'string' ? req.query.state : '',
        scope: typeof req.query.scope === 'string' ? req.query.scope : DEFAULT_SCOPE,
        resource: typeof req.query.resource === 'string' ? req.query.resource : undefined,
      });

      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Parameter otorisasi OAuth tidak lengkap atau tidak valid.',
        });
      }

      const baseUrl = resolveBaseUrl(req);
      const resourceCheck = validateResourceIndicator(parsed.data.resource, baseUrl);
      if (!resourceCheck.ok) {
        return res.status(400).json({
          error: 'Parameter resource OAuth tidak menunjuk ke server FlowBoard MCP ini.',
        });
      }

      const verified = await loadAndVerifyClient(
        db,
        parsed.data.client_id,
        parsed.data.redirect_uri,
      );
      if (verified.error || !verified.client) {
        return res.status(verified.status || 400).json({ error: verified.error });
      }

      return res.status(200).json({
        client: {
          clientId: verified.client.client_id,
          clientName: verified.client.client_name,
          redirectUri: parsed.data.redirect_uri,
          redirectHost: describeRedirectTarget(parsed.data.redirect_uri),
        },
        scope: DEFAULT_SCOPE,
        resource: resourceCheck.normalized,
        state: parsed.data.state,
        user: req.user,
      });
    } catch (err) {
      return next(err);
    }
  });

  // Session-authenticated + CSRF-protected consent decision (approve or deny)
  router.post('/authorize/decision', requireAuth, async (req, res, next) => {
    try {
      const parsed = AuthorizeDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Permintaan otorisasi OAuth tidak valid.',
        });
      }

      const data = parsed.data;
      const baseUrl = resolveBaseUrl(req);
      const resourceCheck = validateResourceIndicator(data.resource, baseUrl);
      if (!resourceCheck.ok) {
        return res.status(400).json({
          error: 'Parameter resource OAuth tidak valid untuk server ini.',
        });
      }

      const verified = await loadAndVerifyClient(db, data.client_id, data.redirect_uri);
      if (verified.error || !verified.client) {
        return res.status(verified.status || 400).json({ error: verified.error });
      }

      if (data.decision === 'deny') {
        const redirectTo = buildRedirectWithParams(data.redirect_uri, {
          error: 'access_denied',
          error_description: 'Pengguna menolak izin akses FlowBoard MCP.',
          state: data.state,
        });
        return res.status(200).json({ redirectTo });
      }

      if (!req.user?.hasAiAccess) {
        return res.status(403).json({
          code: 'PRO_REQUIRED',
          error: 'Koneksi MCP via OAuth khusus untuk akun FlowBoard Pro.',
        });
      }

      const rawCode = `${AUTH_CODE_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
      const codeHash = hashSessionToken(rawCode);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS).toISOString();

      await db.run(
        `INSERT INTO oauth_auth_codes (
           code_hash, client_id, user_id, redirect_uri, scope, resource,
           code_challenge, code_challenge_method, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          codeHash,
          verified.client.client_id,
          req.user.id,
          data.redirect_uri,
          DEFAULT_SCOPE,
          resourceCheck.normalized,
          data.code_challenge,
          data.code_challenge_method,
          expiresAt,
          now.toISOString(),
        ],
      );

      const redirectTo = buildRedirectWithParams(data.redirect_uri, {
        code: rawCode,
        state: data.state,
      });
      return res.status(200).json({ redirectTo });
    } catch (err) {
      return next(err);
    }
  });

  // RFC 6749 Token Endpoint (authorization_code + PKCE S256, and refresh_token with rotation)
  router.post('/token', applyExternalApiCors, tokenLimit, async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');

      const body = /** @type {Record<string, unknown>} */ (
        req.body && typeof req.body === 'object' ? req.body : {}
      );
      const basicCreds = extractBasicClientCredentials(req);
      const grantType = typeof body.grant_type === 'string' ? body.grant_type.trim() : '';
      const clientId =
        basicCreds?.clientId || (typeof body.client_id === 'string' ? body.client_id.trim() : '');
      const clientSecret =
        basicCreds?.clientSecret ||
        (typeof body.client_secret === 'string' ? body.client_secret : '');

      if (!clientId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id wajib disertakan.',
        });
      }

      const clientRow = /** @type {{ client_id: string, client_secret_hash: string | null, token_endpoint_auth_method: string } | undefined} */ (
        await db.get(
          `SELECT client_id, client_secret_hash, token_endpoint_auth_method
           FROM oauth_clients
           WHERE client_id = ?`,
          [clientId],
        )
      );
      if (!clientRow) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Klien OAuth tidak dikenal.',
        });
      }

      if (clientRow.token_endpoint_auth_method !== 'none') {
        if (!clientSecret || !clientRow.client_secret_hash) {
          return res.status(401).json({
            error: 'invalid_client',
            error_description: 'client_secret wajib disertakan.',
          });
        }
        const providedHash = hashSessionToken(clientSecret);
        if (!safeEqualString(providedHash, clientRow.client_secret_hash)) {
          return res.status(401).json({
            error: 'invalid_client',
            error_description: 'Kredensial klien OAuth tidak valid.',
          });
        }
      }

      const baseUrl = resolveBaseUrl(req);

      if (grantType === 'authorization_code') {
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
        const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier.trim() : '';
        const resourceParam = typeof body.resource === 'string' ? body.resource.trim() : undefined;

        if (!code || !redirectUri || !codeVerifier) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Parameter code, redirect_uri, dan code_verifier (PKCE) wajib diisi.',
          });
        }
        if (codeVerifier.length < 43 || codeVerifier.length > 128) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'code_verifier PKCE tidak valid.',
          });
        }

        const codeHash = hashSessionToken(code);
        const codeRow = /** @type {{ code_hash: string, client_id: string, user_id: string, redirect_uri: string, scope: string, resource: string | null, code_challenge: string, code_challenge_method: string, expires_at: string, used_at: string | null } | undefined} */ (
          await db.get('SELECT * FROM oauth_auth_codes WHERE code_hash = ?', [codeHash])
        );

        if (!codeRow) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code tidak valid.',
          });
        }

        // Single-use replay detection: revoke existing tokens for this client+user if code is replayed
        if (codeRow.used_at) {
          await db.run(
            'UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL',
            [new Date().toISOString(), codeRow.client_id, codeRow.user_id],
          );
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code sudah pernah digunakan.',
          });
        }

        if (new Date(codeRow.expires_at).getTime() <= Date.now()) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code sudah kedaluwarsa.',
          });
        }

        if (codeRow.client_id !== clientId || codeRow.redirect_uri !== redirectUri) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'client_id atau redirect_uri tidak cocok dengan authorization code.',
          });
        }

        if (resourceParam) {
          const resCheck = validateResourceIndicator(resourceParam, baseUrl);
          if (!resCheck.ok || (codeRow.resource && resCheck.normalized !== codeRow.resource)) {
            return res.status(400).json({
              error: 'invalid_target',
              error_description: 'Parameter resource tidak cocok dengan otorisasi awal.',
            });
          }
        }

        const expectedChallenge = crypto
          .createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
        if (!safeEqualString(expectedChallenge, codeRow.code_challenge)) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Verifikasi PKCE code_verifier gagal.',
          });
        }

        await db.run('UPDATE oauth_auth_codes SET used_at = ? WHERE code_hash = ?', [
          new Date().toISOString(),
          codeHash,
        ]);

        const userRow = /** @type {{ id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null } | undefined} */ (
          await db.get('SELECT id, name, email, plan, plan_expires_at FROM users WHERE id = ?', [
            codeRow.user_id,
          ])
        );
        if (!userRow || !buildAuthUser(userRow).hasAiAccess) {
          return res.status(403).json({
            error: 'access_denied',
            error_description: 'Akun ini tidak memiliki akses FlowBoard Pro aktif.',
          });
        }

        const issued = await issueTokenPair(db, {
          clientId,
          userId: userRow.id,
          scope: codeRow.scope || DEFAULT_SCOPE,
          resource: codeRow.resource || `${baseUrl}/api/mcp`,
        });

        return res.status(200).json(issued);
      }

      if (grantType === 'refresh_token') {
        const refreshToken =
          typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
        if (!refreshToken || !refreshToken.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'refresh_token tidak valid.',
          });
        }

        const refreshHash = hashSessionToken(refreshToken);
        const tokenRow = /** @type {{ id: string, client_id: string, user_id: string, scope: string, resource: string | null, refresh_expires_at: string | null, revoked_at: string | null } | undefined} */ (
          await db.get('SELECT * FROM oauth_tokens WHERE refresh_token_hash = ?', [refreshHash])
        );

        if (!tokenRow || tokenRow.revoked_at || tokenRow.client_id !== clientId) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'refresh_token tidak valid atau sudah dicabut.',
          });
        }

        if (
          tokenRow.refresh_expires_at &&
          new Date(tokenRow.refresh_expires_at).getTime() <= Date.now()
        ) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'refresh_token sudah kedaluwarsa.',
          });
        }

        const userRow = /** @type {{ id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null } | undefined} */ (
          await db.get('SELECT id, name, email, plan, plan_expires_at FROM users WHERE id = ?', [
            tokenRow.user_id,
          ])
        );
        if (!userRow || !buildAuthUser(userRow).hasAiAccess) {
          await db.run('UPDATE oauth_tokens SET revoked_at = ? WHERE id = ?', [
            new Date().toISOString(),
            tokenRow.id,
          ]);
          return res.status(403).json({
            error: 'access_denied',
            error_description: 'Akses FlowBoard Pro akun ini sudah tidak aktif.',
          });
        }

        // Rotate refresh token: revoke previous pair before issuing new pair
        await db.run('UPDATE oauth_tokens SET revoked_at = ? WHERE id = ?', [
          new Date().toISOString(),
          tokenRow.id,
        ]);

        const issued = await issueTokenPair(db, {
          clientId,
          userId: userRow.id,
          scope: tokenRow.scope || DEFAULT_SCOPE,
          resource: tokenRow.resource || `${baseUrl}/api/mcp`,
        });

        return res.status(200).json(issued);
      }

      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Hanya grant_type authorization_code dan refresh_token yang didukung.',
      });
    } catch (err) {
      return next(err);
    }
  });

  // RFC 7009 Token Revocation
  router.post('/revoke', applyExternalApiCors, tokenLimit, async (req, res, next) => {
    try {
      const body = /** @type {Record<string, unknown>} */ (
        req.body && typeof req.body === 'object' ? req.body : {}
      );
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (token) {
        const tokenHash = hashSessionToken(token);
        const now = new Date().toISOString();
        await db.run(
          `UPDATE oauth_tokens
           SET revoked_at = ?
           WHERE (access_token_hash = ? OR refresh_token_hash = ?) AND revoked_at IS NULL`,
          [now, tokenHash, tokenHash],
        );
      }
      return res.status(200).json({ revoked: true });
    } catch (err) {
      return next(err);
    }
  });

  // Session-authenticated connected apps manager for FlowBoard UI
  router.get('/connections', requireAuth, requireAiAccess, async (req, res, next) => {
    try {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ error: 'Autentikasi diperlukan.' });
      }
      const nowIso = new Date().toISOString();
      const rows = /** @type {Array<{ id: string, client_id: string, client_name: string, redirect_uris_json: string, scope: string, created_at: string, last_used_at: string | null, expires_at: string, refresh_expires_at: string | null }>} */ (
        await db.all(
          `SELECT t.id, t.client_id, c.client_name, c.redirect_uris_json, t.scope, t.created_at, t.last_used_at, t.expires_at, t.refresh_expires_at
           FROM oauth_tokens t
           JOIN oauth_clients c ON c.client_id = t.client_id
           WHERE t.user_id = ?
             AND t.revoked_at IS NULL
             AND (t.refresh_expires_at IS NULL OR t.refresh_expires_at > ?)
           ORDER BY t.created_at DESC
           LIMIT 50`,
          [authUser.id, nowIso],
        )
      );

      return res.status(200).json({
        connections: rows.map((row) => {
          let firstRedirect = '';
          try {
            const parsed = JSON.parse(row.redirect_uris_json);
            if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
              firstRedirect = parsed[0];
            }
          } catch {
            firstRedirect = '';
          }
          return {
            id: row.id,
            clientId: row.client_id,
            clientName: row.client_name,
            redirectHost: firstRedirect ? describeRedirectTarget(firstRedirect) : '',
            scope: row.scope,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            expiresAt: row.expires_at,
          };
        }),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/connections/:id', requireAuth, requireAiAccess, async (req, res, next) => {
    try {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ error: 'Autentikasi diperlukan.' });
      }
      const row = /** @type {{ id: string, user_id: string } | undefined} */ (
        await db.get('SELECT id, user_id FROM oauth_tokens WHERE id = ? AND revoked_at IS NULL', [
          req.params.id,
        ])
      );
      if (!row) {
        return res.status(404).json({ error: 'Koneksi aplikasi AI tidak ditemukan.' });
      }
      if (row.user_id !== authUser.id) {
        return res.status(403).json({ error: 'Anda tidak memiliki izin mencabut koneksi ini.' });
      }
      await db.run('UPDATE oauth_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?', [
        new Date().toISOString(),
        row.id,
        authUser.id,
      ]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

/**
 * Generate and persist an OAuth 2.1 access + refresh token pair (storing only SHA-256 hashes).
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ clientId: string, userId: string, scope: string, resource: string }} params
 */
async function issueTokenPair(db, { clientId, userId, scope, resource }) {
  const id = crypto.randomUUID();
  const accessToken = `${OAUTH_ACCESS_TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  const refreshToken = `${OAUTH_REFRESH_TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString();

  await db.run(
    `INSERT INTO oauth_tokens (
       id, client_id, user_id, access_token_hash, refresh_token_hash,
       scope, resource, expires_at, refresh_expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      clientId,
      userId,
      hashSessionToken(accessToken),
      hashSessionToken(refreshToken),
      scope,
      resource,
      accessExpiresAt,
      refreshExpiresAt,
      now.toISOString(),
    ],
  );

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refreshToken,
    scope,
  };
}
