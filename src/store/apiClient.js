const CSRF_HEADER = { 'X-Requested-With': 'FlowBoard' };

/**
 * Execute JSON API request with session credentials and CSRF protection header.
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function requestJson(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...CSRF_HEADER,
    ...(options.headers || {}),
  };

  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Terjadi kesalahan saat menghubungi server.');
    /** @type {any} */ (error).status = response.status;
    throw error;
  }
  return payload;
}

export const apiClient = {
  getMe() {
    return requestJson('/api/auth/me', { method: 'GET' });
  },
  register(data) {
    return requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  login(data) {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  logout() {
    return requestJson('/api/auth/logout', { method: 'POST' });
  },
  listBoards() {
    return requestJson('/api/boards', { method: 'GET' });
  },
  createBoard(data) {
    return requestJson('/api/boards', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getBoard(id) {
    return requestJson(`/api/boards/${encodeURIComponent(id)}`, { method: 'GET' });
  },
  updateBoard(id, data) {
    return requestJson(`/api/boards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteBoard(id) {
    return requestJson(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  listApiKeys() {
    return requestJson('/api/keys', { method: 'GET' });
  },
  createApiKey(name) {
    return requestJson('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  deleteApiKey(id) {
    return requestJson(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getPublicDraft(id) {
    return requestJson(`/api/public/drafts/${encodeURIComponent(id)}`, { method: 'GET' });
  },
  createPublicDraft(data) {
    return requestJson('/api/public/drafts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getOAuthAuthorizeInfo(search) {
    const query = search.startsWith('?') ? search : `?${search}`;
    return requestJson(`/api/oauth/authorize/info${query}`, { method: 'GET' });
  },
  submitOAuthDecision(data) {
    return requestJson('/api/oauth/authorize/decision', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  listOAuthConnections() {
    return requestJson('/api/oauth/connections', { method: 'GET' });
  },
  revokeOAuthConnection(id) {
    return requestJson(`/api/oauth/connections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
