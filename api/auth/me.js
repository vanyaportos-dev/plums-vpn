const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

/**
 * Parse cookies from the Cookie header string.
 * Returns a plain object { cookieName: cookieValue }.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) return;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

/**
 * Extract the bearer token from either:
 *  - Authorization: Bearer <token>   (used by SPA / fetch calls)
 *  - Cookie: plume_token=<token>      (used by Telegram OAuth redirect)
 */
function extractToken(req) {
  // 1. Authorization header (preferred for API calls)
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }

  // 2. Cookie fallback (for server-side redirects from Telegram)
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies['plume_token']) {
    return cookies['plume_token'];
  }

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── 1. Extract token ──────────────────────────────────────────────────────
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    // ── 2. Validate session ───────────────────────────────────────────────────
    const sessionRaw = await redis.get(`session:${token}`);
    const session = JSON.parse(sessionRaw || 'null');

    if (!session) {
      return res.status(401).json({ error: 'Сессия не найдена' });
    }
    if (session.expires_at < Date.now()) {
      return res.status(401).json({ error: 'Сессия истекла' });
    }

    // ── 3. Look up user — supports both auth methods ──────────────────────────
    let user = null;

    if (session.auth_method === 'telegram' && session.telegram_id) {
      // Telegram-authenticated user
      user = JSON.parse(
        (await redis.get(`user:tg:${session.telegram_id}`)) || 'null'
      );
    } else if (session.email) {
      // Legacy email/password user
      user = JSON.parse(
        (await redis.get(`user:${session.email}`)) || 'null'
      );
    } else if (session.telegram_id) {
      // Session created before auth_method field was added (backward compat)
      user = JSON.parse(
        (await redis.get(`user:tg:${session.telegram_id}`)) || 'null'
      );
    }

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    // ── 4. Build safe public user object ─────────────────────────────────────
    const publicUser = {
      role: user.role || 'user',
      auth_method: user.auth_method || 'email',
      created_at: user.created_at || null,
    };

    if (user.auth_method === 'telegram') {
      // Telegram user fields
      publicUser.telegram_id = user.telegram_id;
      publicUser.first_name  = user.first_name  || '';
      publicUser.last_name   = user.last_name   || '';
      publicUser.username    = user.username    || '';
      publicUser.photo_url   = user.photo_url   || '';
      // Derive a display name for UI convenience
      publicUser.name = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || user.username || `tg:${user.telegram_id}`;
    } else {
      // Email/password user fields
      publicUser.email = user.email || '';
      publicUser.name  = user.name  || '';
    }

    return res.status(200).json({ user: publicUser });
  } catch (err) {
    console.error('[me] Unexpected error:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
