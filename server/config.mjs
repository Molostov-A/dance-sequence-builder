import path from 'node:path';

export function readConfig(env = process.env) {
  const publicUrl = new URL(env.PUBLIC_URL || 'http://localhost:8080');
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
    throw new Error('PUBLIC_URL должен содержать только origin, без пути и параметров.');
  }
  if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname))) {
    throw new Error('Для публичного сервера нужен HTTPS.');
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-')) {
    throw new Error('Задайте случайный SESSION_SECRET длиной не менее 32 символов.');
  }
  const frontend = env.FRONTEND_URL ? new URL(env.FRONTEND_URL) : null;
  if (frontend && (frontend.protocol !== 'https:' && !(frontend.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(frontend.hostname))
    || frontend.username || frontend.password || frontend.search || frontend.hash)) throw new Error('Некорректный FRONTEND_URL.');
  return {
    origin: publicUrl.origin, secure: publicUrl.protocol === 'https:',
    frontendUrl: frontend?.href || '', frontendOrigin: frontend?.origin || '',
    revision: env.APP_REVISION || 'local',
    port: Number(env.PORT || 8080), host: env.HOST || '0.0.0.0',
    database: path.resolve(env.DB_PATH || './data/dance.sqlite'),
    secret: env.SESSION_SECRET, trustProxy: env.TRUST_PROXY === '1',
    googleClientId: env.GOOGLE_CLIENT_ID || '', googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    smtpHost: env.SMTP_HOST || '', smtpPort: Number(env.SMTP_PORT || 587),
    smtpSecure: env.SMTP_SECURE === 'true', smtpUser: env.SMTP_USER || '', smtpPassword: env.SMTP_PASSWORD || '',
    smtpFrom: env.SMTP_FROM || '', sessionMs: 30 * 24 * 3600000, codeMs: 10 * 60000,
    maxBody: 2 * 1024 * 1024
  };
}
