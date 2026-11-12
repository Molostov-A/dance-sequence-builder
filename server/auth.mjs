import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual, randomUUID } from 'node:crypto';

export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenHash = value => createHash('sha256').update(String(value)).digest('hex');
export const sameToken = (a, b) => timingSafeEqual(Buffer.from(tokenHash(a)), Buffer.from(tokenHash(b)));
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validEmail = value => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export const codeHash = (config, id, code) => createHmac('sha256', config.secret).update(id + ':' + code).digest('hex');
export const makeCode = () => String(randomInt(0, 1000000)).padStart(6, '0');

export function findOrCreateEmailUser(db, email, now) {
  let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(), email, email.split('@')[0], null, now);
    user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  }
  return user;
}

export function googleUser(db, claims, linkingUserId, now) {
  const email = normalizeEmail(claims.email);
  if (!claims.sub || typeof claims.sub !== 'string' || !validEmail(email) || claims.email_verified !== true) {
    throw new Error('Google не подтвердил адрес почты. Используйте вход по коду.');
  }
  const byGoogle = db.prepare('SELECT * FROM users WHERE google_sub=?').get(claims.sub);
  if (byGoogle) {
    if (linkingUserId && byGoogle.id !== linkingUserId) throw new Error('Этот Google-аккаунт уже связан с другим аккаунтом приложения.');
    return byGoogle;
  }
  const byEmail = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  // Для сторонней почты email_verified не доказывает текущее владение адресом.
  // Привязку к существующему аккаунту разрешаем после входа по email-коду.
  const authoritative = email.endsWith('@gmail.com') || !!claims.hd;
  if (byEmail && !authoritative && linkingUserId !== byEmail.id) {
    const error = new Error('Сначала войдите по коду из письма, затем привяжите Google в окне аккаунта.');
    error.code = 'verify_email'; throw error;
  }
  if (linkingUserId && (!byEmail || byEmail.id !== linkingUserId)) throw new Error('Выберите Google-аккаунт с той же почтой, что у текущего аккаунта.');
  const user = byEmail || findOrCreateEmailUser(db, email, now);
  if (user.google_sub && user.google_sub !== claims.sub) throw new Error('К аккаунту уже привязан другой вход Google.');
  db.prepare('UPDATE users SET google_sub=?,name=? WHERE id=?').run(claims.sub, String(claims.name || user.name).slice(0, 100), user.id);
  return db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
}

export async function createMailer(config) {
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort,
    secure: config.smtpSecure, requireTLS: !config.smtpSecure && config.secure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    connectionTimeout: 15000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true });
  return async (email, code) => transport.sendMail({ from: config.smtpFrom, to: email,
    subject: 'Код входа в конструктор связок',
    text: `Ваш код входа: ${code}\n\nКод действует 10 минут. Если вы не запрашивали вход, проигнорируйте письмо.` });
}

export async function createGoogleVerifier(config) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10000 });
  return async (token, nonce) => {
    const { payload } = await jwtVerify(token, keys, { audience: config.googleClientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'], maxTokenAge: '10m' });
    if (!payload.nonce || !sameToken(payload.nonce, nonce)) throw new Error('Недействительный ответ Google.');
    return payload;
  };
}
