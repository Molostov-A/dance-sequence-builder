import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openStore, consumeRate, saveDocument } from './store.mjs';
import { validateDocument } from './validation.mjs';
import { randomToken, tokenHash, sameToken, normalizeEmail, validEmail, codeHash, makeCode,
  findOrCreateEmailUser, googleUser, createMailer, createGoogleVerifier } from './auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const publicUser = user => ({ id: user.id, email: user.email, name: user.name });

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function requestToken(req) {
  if (req.headers.authorization) return /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization)?.[1] || '';
  return cookies(req).dance_session || '';
}
function setCookie(res, config, name, value, maxAge) {
  const values = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...values, `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`]);
}
async function readJson(req, limit) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, 'Ожидается JSON.');
  if (Number(req.headers['content-length']) > limit) throw fail(413, 'Файл слишком большой.');
  const text = await new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const collect = chunk => {
      size += chunk.length;
      if (size > limit) { req.removeListener('data', collect); req.resume(); reject(fail(413, 'Файл слишком большой.')); }
      else chunks.push(chunk);
    };
    req.on('data', collect);
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.once('error', reject);
  });
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required');
    return data;
  } catch { throw fail(400, 'Некорректный JSON.'); }
}

export async function createApp(config, dependencies = {}) {
  const db = dependencies.db || openStore(config.database);
  const now = dependencies.now || Date.now;
  const providers = { google: !!(config.googleClientId && config.googleClientSecret), email: !!(config.smtpHost && config.smtpFrom) };
  const sendCode = dependencies.sendCode || (providers.email ? await createMailer(config) : null);
  const verifyGoogle = dependencies.verifyGoogle || (providers.google ? await createGoogleVerifier(config) : null);
  const googleFetch = dependencies.googleFetch || fetch;

  function session(req) {
    const token = requestToken(req);
    if (!token) return null;
    return db.prepare(`SELECT s.*,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE token_hash=? AND expires_at>?`).get(tokenHash(token), now()) || null;
  }
  function requireSession(req, mutation = false) {
    const current = session(req);
    if (!current) throw fail(401, 'Войдите в аккаунт.', 'unauthenticated');
    if (req.headers['x-account-id'] !== current.user_id) throw fail(409, 'Аккаунт изменился. Обновите подключение.', 'account_changed');
    if (mutation && (!req.headers['x-csrf-token'] || !sameToken(req.headers['x-csrf-token'], current.csrf))) {
      throw fail(403, 'Обновите страницу и повторите действие.', 'csrf');
    }
    return current;
  }
  function newSession(req, res, user) {
    const old = requestToken(req);
    if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(old));
    const token = randomToken(), csrf = randomToken();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(tokenHash(token), user.id, csrf, now() + config.sessionMs);
    setCookie(res, config, 'dance_session', token, Math.floor(config.sessionMs / 1000));
    return { user: publicUser(user), csrf, providers,
      ...(config.frontendOrigin && req.headers.origin === config.frontendOrigin && config.frontendOrigin !== config.origin ? { accessToken: token } : {}) };
  }
  function rate(key, maximum, windowMs = 600000) {
    if (!consumeRate(db, key, maximum, windowMs, now())) throw fail(429, 'Слишком много попыток. Повторите позже.');
  }
  function ipKey(req) {
    const ip = config.trustProxy && req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',').at(-1).trim() : req.socket.remoteAddress;
    return tokenHash(ip || 'unknown');
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      let url;
      try { url = new URL(req.url, config.origin); } catch { throw fail(400, 'Некорректный адрес запроса.'); }
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        const allowed = [config.origin, config.frontendOrigin].filter(Boolean);
        if (origin && !allowed.includes(origin)) throw fail(403, 'Недопустимый источник запроса.');
        if (origin && origin === config.frontendOrigin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token, X-Account-ID, Accept');
          res.setHeader('Access-Control-Max-Age', '600');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (!['GET', 'POST', 'PUT'].includes(req.method)) throw fail(405, 'Метод не поддерживается.');
        // API и SPA обслуживаются с одного origin. Cookies не открываются
        // сторонним сайтам; все изменяющие запросы требуют точного Origin.
        if (['POST', 'PUT'].includes(req.method) && !allowed.includes(origin)) throw fail(403, 'Недопустимый источник запроса.');
        if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { ok: true, revision: config.revision }); return; }
        if (req.method === 'GET' && url.pathname === '/api/session') {
          const current = session(req);
          json(res, 200, { user: current ? { id: current.user_id, email: current.email, name: current.name } : null,
            csrf: current?.csrf || null, providers }); return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/email/start') {
          if (!providers.email) throw fail(503, 'Вход по почте пока не настроен.');
          const input = await readJson(req, 2048), email = normalizeEmail(input.email);
          if (!validEmail(email)) throw fail(400, 'Введите корректный адрес почты.');
          rate('mail-ip:' + ipKey(req), 30); rate('mail:' + tokenHash(email), 3);
          const id = randomUUID(), code = makeCode();
          db.prepare('DELETE FROM email_codes WHERE email=?').run(email);
          db.prepare('INSERT INTO email_codes(id,email,code_hash,expires_at) VALUES(?,?,?,?)')
            .run(id, email, codeHash(config, id, code), now() + config.codeMs);
          try { await sendCode(email, code); }
          catch { db.prepare('DELETE FROM email_codes WHERE id=?').run(id); throw fail(503, 'Не удалось отправить письмо. Попробуйте позже.'); }
          json(res, 200, { challengeId: id, expiresIn: config.codeMs / 1000 }); return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/email/verify') {
          if (!providers.email) throw fail(503, 'Вход по почте пока не настроен.');
          rate('verify-ip:' + ipKey(req), 60);
          const input = await readJson(req, 2048);
          const challenge = typeof input.challengeId === 'string' ? db.prepare('SELECT * FROM email_codes WHERE id=?').get(input.challengeId) : null;
          if (!challenge || challenge.expires_at <= now() || challenge.attempts >= 5
            || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw fail(400, 'Код неверный или истёк. Запросите новый код.');
          db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE id=?').run(challenge.id);
          if (!sameToken(codeHash(config, challenge.id, input.code), challenge.code_hash)) throw fail(400, 'Неверный код.');
          db.prepare('DELETE FROM email_codes WHERE id=?').run(challenge.id);
          json(res, 200, newSession(req, res, findOrCreateEmailUser(db, challenge.email, now()))); return;
        }
        if (req.method === 'GET' && url.pathname === '/api/auth/google/start') {
          if (!providers.google) throw fail(503, 'Вход Google пока не настроен.');
          rate('google:' + ipKey(req), 30);
          const state = randomToken(), nonce = randomToken(), verifier = randomToken();
          const fromFrontend = url.searchParams.get('frontend') === '1';
          const clientChallenge = url.searchParams.get('challenge'), clientState = url.searchParams.get('client_state');
          if (fromFrontend && (!config.frontendUrl || !/^[A-Za-z0-9_-]{43}$/.test(clientChallenge || '')
            || !/^[A-Za-z0-9_-]{43}$/.test(clientState || '') || url.searchParams.get('link') === '1')) {
            throw fail(400, 'Некорректный запрос входа.');
          }
          const linkingUser = url.searchParams.get('link') === '1' ? session(req)?.user_id : null;
          if (url.searchParams.get('link') === '1' && !linkingUser) throw fail(401, 'Сначала войдите в аккаунт.');
          db.prepare('INSERT INTO oauth_flows VALUES(?,?,?,?,?)')
            .run(tokenHash(state), verifier, nonce, linkingUser || null, now() + 600000);
          if (fromFrontend) db.prepare('INSERT INTO oauth_clients VALUES(?,?,?)').run(tokenHash(state), clientChallenge, clientState);
          setCookie(res, config, 'dance_oauth', state, 600);
          const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          const challenge = Buffer.from(tokenHash(verifier), 'hex').toString('base64url');
          Object.entries({ client_id: config.googleClientId, redirect_uri: config.origin + '/api/auth/google/callback',
            response_type: 'code', scope: 'openid email profile', state, nonce,
            code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })
            .forEach(([key, value]) => target.searchParams.set(key, value));
          res.writeHead(302, { Location: target.href, 'Cache-Control': 'no-store' }); res.end(); return;
        }
        if (req.method === 'GET' && url.pathname === '/api/auth/google/callback') {
          let outcome = 'failed';
          let clientFlow = null, ticket = '';
          try {
            const state = url.searchParams.get('state'), browserState = cookies(req).dance_oauth;
            if (!providers.google || !state || !browserState || !sameToken(state, browserState)) throw new Error('state');
            const flow = db.prepare(`SELECT f.*,c.challenge AS client_challenge,c.client_state
              FROM oauth_flows f LEFT JOIN oauth_clients c ON c.state_hash=f.state_hash WHERE f.state_hash=?`).get(tokenHash(state));
            if (flow?.client_challenge) clientFlow = flow;
            db.prepare('DELETE FROM oauth_flows WHERE state_hash=?').run(tokenHash(state));
            if (!flow || flow.expires_at <= now() || !url.searchParams.get('code')) throw new Error('expired');
            if (flow.user_id && session(req)?.user_id !== flow.user_id) throw new Error('session changed');
            const tokenResponse = await googleFetch('https://oauth2.googleapis.com/token', {
              method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: config.googleClientId,
                client_secret: config.googleClientSecret, redirect_uri: config.origin + '/api/auth/google/callback',
                grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(15000)
            });
            if (!tokenResponse.ok) throw new Error('token exchange');
            const token = await tokenResponse.json();
            const claims = await verifyGoogle(token.id_token, flow.nonce);
            const user = googleUser(db, claims, flow.user_id, now());
            if (clientFlow) {
              ticket = randomToken();
              db.prepare('INSERT INTO login_tickets VALUES(?,?,?,?)').run(tokenHash(ticket), user.id, clientFlow.client_challenge, now() + 60000);
            } else newSession(req, res, user);
            outcome = 'success';
          } catch (err) { if (err.code === 'verify_email') outcome = 'verify_email'; }
          setCookie(res, config, 'dance_oauth', '', 0);
          const destination = clientFlow ? config.frontendUrl + '#' + new URLSearchParams({
            ...(ticket ? { auth_code: ticket } : { auth_error: outcome }), state: clientFlow.client_state
          }).toString() : '/?auth=' + outcome;
          res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' }); res.end(); return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/exchange') {
          if (!config.frontendOrigin || req.headers.origin !== config.frontendOrigin) throw fail(403, 'Недопустимый источник запроса.');
          rate('exchange:' + ipKey(req), 30);
          const input = await readJson(req, 2048);
          if (typeof input.code !== 'string' || typeof input.verifier !== 'string'
            || !/^[A-Za-z0-9_-]{43}$/.test(input.code) || !/^[A-Za-z0-9_-]{43}$/.test(input.verifier)) throw fail(400, 'Недействительный код входа.');
          const ticket = db.prepare('SELECT * FROM login_tickets WHERE code_hash=?').get(tokenHash(input.code));
          const challenge = Buffer.from(tokenHash(input.verifier), 'hex').toString('base64url');
          if (!ticket || ticket.expires_at <= now() || !sameToken(challenge, ticket.challenge)) throw fail(400, 'Код входа истёк или не соответствует запросу.');
          db.prepare('DELETE FROM login_tickets WHERE code_hash=?').run(ticket.code_hash);
          const user = db.prepare('SELECT * FROM users WHERE id=?').get(ticket.user_id);
          json(res, 200, newSession(req, res, user)); return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
          const current = requireSession(req, true);
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(current.token_hash);
          setCookie(res, config, 'dance_session', '', 0); json(res, 200, { ok: true }); return;
        }
        if (url.pathname === '/api/data') {
          const current = requireSession(req, req.method !== 'GET');
          if (req.method === 'GET') {
            const row = db.prepare('SELECT * FROM documents WHERE user_id=?').get(current.user_id);
            json(res, 200, row ? { data: JSON.parse(row.body), revision: row.revision, updatedAt: row.updated_at }
              : { data: null, revision: 0, updatedAt: null }); return;
          }
          if (req.method === 'PUT') {
            rate('save:' + current.user_id, 120, 60000);
            const input = await readJson(req, config.maxBody);
            if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw fail(400, 'Некорректная версия данных.');
            let body;
            try { body = validateDocument(input.data); }
            catch (err) { throw fail(400, 'Некорректная библиотека: ' + err.message); }
            if (Buffer.byteLength(body) > config.maxBody) throw fail(413, 'Библиотека слишком большая.');
            const saved = saveDocument(db, current.user_id, input.revision, body, now());
            if (!saved) throw fail(409, 'Данные изменены на другом устройстве.', 'revision_conflict');
            json(res, 200, saved); return;
          }
        }
        throw fail(404, 'Неизвестный адрес API.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Метод не поддерживается.');
      const pathname = decodeURIComponent(url.pathname);
      if (!/^\/(?:index\.html|(?:js|css|img)\/[\w.-]+)?$/.test(pathname)) throw fail(404, 'Файл не найден.');
      const file = path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      const content = await readFile(file).catch(() => { throw fail(404, 'Файл не найден.'); });
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (err) {
      if (res.headersSent) { res.end(); return; }
      json(res, err.status || 500, { error: err.status ? err.message : 'Ошибка сервера. Повторите позже.', code: err.code || 'error' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  const cleanup = setInterval(() => {
    for (const table of ['sessions', 'email_codes', 'oauth_flows', 'login_tickets']) db.prepare(`DELETE FROM ${table} WHERE expires_at<=?`).run(now());
    db.prepare('DELETE FROM rate_limits WHERE resets_at<=?').run(now());
  }, 600000);
  cleanup.unref();
  server.on('close', () => { clearInterval(cleanup); if (!dependencies.db) db.close(); });
  return { server, db };
}
