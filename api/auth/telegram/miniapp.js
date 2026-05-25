/**
 * POST /api/auth/telegram/miniapp
 *
 * Verifies Telegram Mini App initData (HMAC-SHA256),
 * creates or updates the user in Redis, issues a session token.
 *
 * Returns: { token, user }
 */

const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  '8665223726:AAE_2OfW2_a32-j9n6MrU3S2j8r212LSzV4';

/* ─────────────────────────────────────────────────────────────
   Telegram Mini App data verification
   Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   secretKey = HMAC-SHA256(BOT_TOKEN, "WebAppData")   ← note: "WebAppData" is the HMAC key
   ───────────────────────────────────────────────────────────── */
function verifyMiniAppData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  // Sort entries alphabetically and build check string
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Secret key = HMAC-SHA256 of BOT_TOKEN with literal key "WebAppData"
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}

/* ─────────────────────────────────────────────────────────────
   Check auth_date freshness (1 hour for Mini Apps)
   ───────────────────────────────────────────────────────────── */
function isAuthDateFresh(initData) {
  const params = new URLSearchParams(initData);
  const authDate = params.get('auth_date');
  if (!authDate) return false;
  const diff = Math.floor(Date.now() / 1000) - parseInt(authDate, 10);
  return diff >= 0 && diff < 3600; // 1 hour
}

/* ─────────────────────────────────────────────────────────────
   Parse raw request body (no body-parser in Vercel serverless)
   ───────────────────────────────────────────────────────────── */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/* ─────────────────────────────────────────────────────────────
   Handler
   ───────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  // CORS headers for Telegram Mini App WebView
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Parse body
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { initData } = body;
    if (!initData || typeof initData !== 'string') {
      return res.status(400).json({ error: 'initData is required' });
    }

    // 2. Verify signature
    if (!verifyMiniAppData(initData)) {
      console.warn('[miniapp] Signature verification failed');
      return res.status(401).json({ error: 'Invalid initData signature' });
    }

    // 3. Check auth_date freshness
    if (!isAuthDateFresh(initData)) {
      console.warn('[miniapp] Stale auth_date');
      return res.status(401).json({ error: 'initData has expired' });
    }

    // 4. Extract user object from initData
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) {
      return res.status(400).json({ error: 'User data missing from initData' });
    }

    let telegramUser;
    try {
      telegramUser = JSON.parse(userStr);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid user JSON in initData' });
    }

    const {
      id,
      first_name    = '',
      last_name     = '',
      username      = '',
      photo_url     = '',
      language_code = '',
    } = telegramUser;

    if (!id) {
      return res.status(400).json({ error: 'Telegram user id missing' });
    }

    // 5. Load or create user in Redis
    const userKey = `user:tg:${id}`;
    let user = JSON.parse((await redis.get(userKey)) || 'null');

    if (!user) {
      // First ever user becomes admin
      const adminSettings = JSON.parse(
        (await redis.get('admin:settings')) || 'null'
      );
      const isFirstUser = !adminSettings;

      user = {
        telegram_id:   id.toString(),
        first_name,
        last_name,
        username,
        photo_url,
        language_code,
        role:          isFirstUser ? 'admin' : 'user',
        auth_method:   'telegram',
        created_at:    new Date().toISOString(),
        last_seen:     new Date().toISOString(),
      };

      await redis.set(userKey, JSON.stringify(user));
      await redis.sadd('users:all', `tg:${id}`);

      if (isFirstUser) {
        await redis.set(
          'admin:settings',
          JSON.stringify({ admin_ids: [id.toString()] })
        );
        console.info('[miniapp] First user — admin role granted:', id);
      }
    } else {
      // Refresh mutable Telegram profile fields on every login
      user.first_name    = first_name    || user.first_name;
      user.last_name     = last_name     || user.last_name;
      user.username      = username      || user.username;
      user.photo_url     = photo_url     || user.photo_url;
      user.language_code = language_code || user.language_code;
      user.last_seen     = new Date().toISOString();
      await redis.set(userKey, JSON.stringify(user));
    }

    // 6. Create session token (7 days TTL)
    const token = crypto.randomBytes(32).toString('hex');
    const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    await redis.set(
      `session:${token}`,
      JSON.stringify({
        telegram_id: id.toString(),
        auth_method: 'telegram',
        source:      'miniapp',
        created_at:  new Date().toISOString(),
        expires_at:  Date.now() + SESSION_TTL_MS,
      }),
      { px: SESSION_TTL_MS }
    );

    // 7. Return token + public user profile
    return res.status(200).json({
      token,
      user: {
        telegram_id: user.telegram_id,
        first_name:  user.first_name,
        last_name:   user.last_name,
        username:    user.username,
        photo_url:   user.photo_url,
        role:        user.role,
        auth_method: user.auth_method,
        created_at:  user.created_at,
      },
    });
  } catch (err) {
    console.error('[miniapp] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
