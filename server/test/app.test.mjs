import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { readConfig } from '../config.mjs';
import { openStore } from '../store.mjs';

function data(name = 'База') {
  return { movements: [{ id: 1, name }], roots: [1], nodeOrder: [1],
    nodes: { 1: { id: 1, movementId: 1, parentId: null, beat: 1, length: 4 } } };
}
async function fixture(t, options = {}) {
  const config = readConfig({ PUBLIC_URL: 'http://localhost:8080', SESSION_SECRET: 'test-secret-longer-than-32-characters',
    SMTP_HOST: 'mail.example.test', SMTP_FROM: 'login@example.test', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    FRONTEND_URL: options.frontendUrl || '' });
  const db = openStore(':memory:'); let timestamp = Date.now(), claims = { sub: 'google-one', email: 'google@gmail.com', email_verified: true, name: 'Google' };
  const mail = [], tokens = [];
  const app = await createApp(config, { db, now: () => timestamp,
    sendCode: async (email, code) => { mail.push({ email, code }); if (options.mailFails) throw new Error('smtp secret must not leak'); },
    googleFetch: async (url, init) => { tokens.push({ url, init }); return { ok: true, json: async () => ({ id_token: 'signed-token' }) }; },
    verifyGoogle: async (token, nonce) => { assert.equal(token, 'signed-token'); assert.ok(nonce); return claims; } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); db.close(); });
  async function request(route, options = {}) {
    const response = await fetch(base + route, { method: options.method || 'GET', redirect: 'manual',
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json', Origin: config.origin } : {}),
        ...(options.login ? { Cookie: options.login.cookie, 'X-Account-ID': options.login.user.id, 'X-CSRF-Token': options.login.csrf } : {}), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text,
      body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
  }
  async function login(email) {
    const started = await request('/api/auth/email/start', { method: 'POST', body: { email } }); assert.equal(started.status, 200);
    const result = await request('/api/auth/email/verify', { method: 'POST', body: { challengeId: started.body.challengeId, code: mail.at(-1).code } });
    assert.equal(result.status, 200);
    return { ...result.body, cookie: result.headers.getSetCookie()[0].split(';')[0] };
  }
  return { request, login, db, mail, tokens, config, advance: ms => { timestamp += ms; }, setClaims: value => { claims = value; } };
}

test('authentication: email OTP, HttpOnly cookie, session, logout and replay protection', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/session')).body.user, null);
  const start = await f.request('/api/auth/email/start', { method: 'POST', body: { email: ' Person@Example.com ' } });
  assert.equal(f.mail[0].email, 'person@example.com'); assert.match(f.mail[0].code, /^\d{6}$/);
  assert.equal(start.text.includes(f.mail[0].code), false);
  const row = f.db.prepare('SELECT * FROM email_codes').get(); assert.notEqual(row.code_hash, f.mail[0].code);
  const finish = await f.request('/api/auth/email/verify', { method: 'POST', body: { challengeId: start.body.challengeId, code: f.mail[0].code } });
  const setCookie = finish.headers.getSetCookie()[0]; assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/);
  const login = { ...finish.body, cookie: setCookie.split(';')[0] };
  assert.equal((await f.request('/api/session', { login })).body.user.id, login.user.id);
  assert.equal((await f.request('/api/auth/email/verify', { method: 'POST', body: { challengeId: start.body.challengeId, code: f.mail[0].code } })).status, 400);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', body: {}, login })).status, 200);
  assert.equal((await f.request('/api/data', { login })).status, 401);
});

test('email codes expire, are attempt-limited and request-limited', async t => {
  const f = await fixture(t);
  const start = await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'limit@example.com' } });
  const wrong = f.mail[0].code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await f.request('/api/auth/email/verify', { method: 'POST', body: { challengeId: start.body.challengeId, code: wrong } })).status, 400);
  assert.equal((await f.request('/api/auth/email/verify', { method: 'POST', body: { challengeId: start.body.challengeId, code: f.mail[0].code } })).status, 400);
  const expired = await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'expire@example.com' } });
  f.advance(600001);
  assert.equal((await f.request('/api/auth/email/verify', { method: 'POST', body: { challengeId: expired.body.challengeId, code: f.mail.at(-1).code } })).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'repeat@example.com' } })).status, 200);
  assert.equal((await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'repeat@example.com' } })).status, 429);
});

test('SMTP error does not issue a valid code or expose credentials', async t => {
  const f = await fixture(t, { mailFails: true });
  const result = await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'mail@example.com' } });
  assert.equal(result.status, 503); assert.equal(result.text.includes('smtp secret'), false);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM email_codes').get().count, 0);
});

test('documents belong only to their session user; account ID cannot select another owner', async t => {
  const f = await fixture(t), a = await f.login('a@example.com'), b = await f.login('b@example.com');
  assert.equal((await f.request('/api/data')).status, 401);
  assert.equal((await f.request('/api/data', { method: 'PUT', login: a, body: { revision: 0, data: data('A') } })).status, 200);
  assert.equal((await f.request('/api/data', { login: b })).body.data, null);
  assert.equal((await f.request('/api/data', { login: a })).body.data.movements[0].name, 'A');
  assert.equal((await f.request('/api/data', { method: 'PUT', login: b, headers: { 'X-Account-ID': a.user.id }, body: { revision: 1, data: data('stolen') } })).body.code, 'account_changed');
  assert.equal((await f.request('/api/data', { login: a })).body.data.movements[0].name, 'A');
});

test('CSRF and origin checks reject writes', async t => {
  const f = await fixture(t), login = await f.login('csrf@example.com');
  const body = { revision: 0, data: data() };
  assert.equal((await f.request('/api/data', { login, method: 'PUT', body, headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await f.request('/api/data', { login, method: 'PUT', body, headers: { 'X-CSRF-Token': 'bad' } })).status, 403);
  assert.equal((await f.request('/api/auth/email/start', { method: 'POST', body: { email: 'test@example.com' }, headers: { Origin: '' } })).status, 403);
});

test('optimistic revisions prevent overwrite and preserve history', async t => {
  const f = await fixture(t), login = await f.login('versions@example.com');
  const first = await f.request('/api/data', { method: 'PUT', login, body: { revision: 0, data: data('one') } });
  assert.equal(first.body.revision, 1);
  const results = await Promise.all(['two', 'three'].map(name => f.request('/api/data', { method: 'PUT', login, body: { revision: 1, data: data(name) } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await f.request('/api/data', { login })).body.revision, 2);
  assert.equal(JSON.parse(f.db.prepare('SELECT body FROM document_history WHERE user_id=? AND revision=1').get(login.user.id).body).movements[0].name, 'one');
});

test('validation rejects dangling nodes, cycles, invalid beats and malformed requests', async t => {
  const f = await fixture(t), login = await f.login('validation@example.com');
  for (const modify of [d => { d.nodes[1].movementId = 999; }, d => { d.nodes[1].parentId = 1; }, d => { d.nodes[1].length = 3; }]) {
    const invalid = data(); modify(invalid);
    assert.equal((await f.request('/api/data', { method: 'PUT', login, body: { revision: 0, data: invalid } })).status, 400);
  }
  assert.equal((await f.request('/api/data', { method: 'PUT', login, body: null })).status, 400);
  assert.equal((await f.request('/api/data', { method: 'PUT', login, body: { revision: -1, data: data() } })).status, 400);
  assert.equal((await f.request('/api/data', { method: 'PUT', login, body: { revision: 0, data: data('x'.repeat(2200000)) } })).status, 413);
  assert.equal((await f.request('/api/data', { login })).body.revision, 0);
});

test('sessions expire and static server does not publish server files or environment', async t => {
  const f = await fixture(t), login = await f.login('expiry@example.com');
  f.advance(f.config.sessionMs + 1);
  assert.equal((await f.request('/api/data', { login })).status, 401);
  for (const url of ['/server/.env', '/server/package.json', '/.git/config', '/node_modules/jose/package.json']) assert.equal((await f.request(url)).status, 404);
  assert.equal((await f.request('/')).status, 200);
  assert.equal((await f.request('/js/account.js')).status, 200);
});

test('Google OAuth uses state, nonce and PKCE; callback establishes a server session', async t => {
  const f = await fixture(t);
  const start = await f.request('/api/auth/google/start'); assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get('location'));
  assert.equal(authorization.searchParams.get('scope'), 'openid email profile');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('nonce'));
  const cookie = start.headers.getSetCookie()[0].split(';')[0], state = authorization.searchParams.get('state');
  const wrong = await f.request('/api/auth/google/callback?state=wrong&code=code', { headers: { Cookie: cookie } });
  assert.equal(wrong.headers.get('location'), '/?auth=failed');
  const done = await f.request('/api/auth/google/callback?state=' + state + '&code=code', { headers: { Cookie: cookie } });
  assert.equal(done.headers.get('location'), '/?auth=success'); assert.equal(f.tokens.length, 1);
  assert.ok(f.tokens[0].init.body.get('code_verifier'));
  const sessionCookie = done.headers.getSetCookie().find(value => value.startsWith('dance_session=')).split(';')[0];
  assert.equal((await f.request('/api/session', { headers: { Cookie: sessionCookie } })).body.user.email, 'google@gmail.com');
  assert.equal((await f.request('/api/auth/google/callback?state=' + state + '&code=code', { headers: { Cookie: cookie } })).headers.get('location'), '/?auth=failed');
});

test('Google cannot take over an existing third-party email account without email login', async t => {
  const f = await fixture(t); await f.login('external@example.com');
  f.setClaims({ sub: 'old-google-owner', email: 'external@example.com', email_verified: true });
  const start = await f.request('/api/auth/google/start'), target = new URL(start.headers.get('location'));
  const done = await f.request('/api/auth/google/callback?state=' + target.searchParams.get('state') + '&code=code',
    { headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
  assert.equal(done.headers.get('location'), '/?auth=verify_email');
  assert.equal(f.db.prepare('SELECT google_sub FROM users WHERE email=?').get('external@example.com').google_sub, null);
});

test('Google Gmail login opens the same account as verified email login', async t => {
  const f = await fixture(t), login = await f.login('google@gmail.com');
  await f.request('/api/data', { method: 'PUT', login, body: { revision: 0, data: data('Existing') } });
  const start = await f.request('/api/auth/google/start'), target = new URL(start.headers.get('location'));
  const done = await f.request('/api/auth/google/callback?state=' + target.searchParams.get('state') + '&code=code',
    { headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
  const cookie = done.headers.getSetCookie().find(c => c.startsWith('dance_session=')).split(';')[0];
  const restored = await f.request('/api/session', { headers: { Cookie: cookie } });
  assert.equal(restored.body.user.id, login.user.id);
  assert.equal((await f.request('/api/data', { login: { ...restored.body, cookie } })).body.data.movements[0].name, 'Existing');
});

test('external email Google identity can be explicitly linked after email verification', async t => {
  const f = await fixture(t), login = await f.login('external@example.com');
  f.setClaims({ sub: 'confirmed-google', email: 'external@example.com', email_verified: true });
  const start = await f.request('/api/auth/google/start?link=1', { login }), target = new URL(start.headers.get('location'));
  const done = await f.request('/api/auth/google/callback?state=' + target.searchParams.get('state') + '&code=code',
    { headers: { Cookie: login.cookie + '; ' + start.headers.getSetCookie()[0].split(';')[0] } });
  assert.equal(done.headers.get('location'), '/?auth=success');
  assert.equal(f.db.prepare('SELECT google_sub FROM users WHERE id=?').get(login.user.id).google_sub, 'confirmed-google');
});

test('GitHub Pages uses exact CORS origin and bearer authentication without third-party cookies', async t => {
  const f = await fixture(t, { frontendUrl: 'https://molostov-a.github.io/dance-sequence-builder/' });
  const origin = f.config.frontendOrigin;
  const preflight = await f.request('/api/data', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.equal((await f.request('/api/data', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } })).status, 403);
  const start = await f.request('/api/auth/email/start', { method: 'POST', headers: { Origin: origin }, body: { email: 'pages@example.com' } });
  const finish = await f.request('/api/auth/email/verify', { method: 'POST', headers: { Origin: origin },
    body: { challengeId: start.body.challengeId, code: f.mail.at(-1).code } });
  assert.match(finish.body.accessToken, /^[A-Za-z0-9_-]{43}$/);
  const headers = { Origin: origin, Authorization: 'Bearer ' + finish.body.accessToken,
    'X-Account-ID': finish.body.user.id, 'X-CSRF-Token': finish.body.csrf };
  assert.equal((await f.request('/api/data', { method: 'PUT', headers, body: { revision: 0, data: data('Pages') } })).status, 200);
  assert.equal((await f.request('/api/data', { headers })).body.data.movements[0].name, 'Pages');
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers, body: {} })).status, 200);
  assert.equal((await f.request('/api/data', { headers })).status, 401);
});

test('Google return to Pages exchanges a one-time code only with the original PKCE verifier', async t => {
  const { randomToken, tokenHash } = await import('../auth.mjs');
  const f = await fixture(t, { frontendUrl: 'https://molostov-a.github.io/dance-sequence-builder/' });
  const verifier = randomToken(), clientState = randomToken();
  const challenge = Buffer.from(tokenHash(verifier), 'hex').toString('base64url');
  const start = await f.request('/api/auth/google/start?frontend=1&challenge=' + challenge + '&client_state=' + clientState);
  const target = new URL(start.headers.get('location'));
  const callback = await f.request('/api/auth/google/callback?state=' + target.searchParams.get('state') + '&code=code',
    { headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
  const destination = new URL(callback.headers.get('location'));
  assert.equal(destination.origin, f.config.frontendOrigin);
  const params = new URLSearchParams(destination.hash.slice(1)); assert.equal(params.get('state'), clientState);
  assert.ok(params.get('auth_code')); assert.equal(destination.hash.includes('accessToken'), false);
  const headers = { Origin: f.config.frontendOrigin };
  assert.equal((await f.request('/api/auth/exchange', { method: 'POST', headers, body: { code: params.get('auth_code'), verifier: randomToken() } })).status, 400);
  const exchanged = await f.request('/api/auth/exchange', { method: 'POST', headers, body: { code: params.get('auth_code'), verifier } });
  assert.equal(exchanged.status, 200); assert.ok(exchanged.body.accessToken);
  assert.equal((await f.request('/api/auth/exchange', { method: 'POST', headers, body: { code: params.get('auth_code'), verifier } })).status, 400);
});
