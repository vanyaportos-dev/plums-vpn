const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8665223726:AAE_2OfW2_a32-j9n6MrU3S2j8r212LSzV4';

/**
 * Verifies the HMAC-SHA256 signature from Telegram Login Widget.
 * Telegram docs: https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramData(data) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Build the check string: sorted key=value pairs joined by \n
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  // Secret key = SHA-256 of the bot token (raw bytes, not hex)
  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();

  // HMAC-SHA256 of the check string using the secret key
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}

/**
 * Checks that the auth_date is not older than 24 hours (anti-replay).
 */
function isAuthDateFresh(auth_date) {
  if (!auth_date) return false;
  const diff = Math.floor(Date.now() / 1000) - parseInt(auth_date, 10);
  return diff >= 0 && diff < 86400; // 24 hours
}

module.exports = async function handler(req, res) {
  // Only GET is used by the Telegram Login Widget
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.query;

    // ── 1. Verify Telegram signature ─────────────────────────────────────────
    if (!verifyTelegramData(data)) {
      console.warn('[telegram-auth] Invalid hash from:', data.id);
      return res.redirect('/login?error=invalid_signature');
    }

    // ── 2. Check auth_date freshness ──────────────────────────────────────────
    if (!isAuthDateFresh(data.auth_date)) {
      console.warn('[telegram-auth] Stale auth_date from:', data.id);
      return res.redirect('/login?error=auth_expired');
    }

    const {
      id,
      first_name,
      last_name = '',
      username = '',
      photo_url = '',
    } = data;

    // ── 3. Load or create user in Redis ───────────────────────────────────────
    const userKey = `user:tg:${id}`;
    let user = JSON.parse((await redis.get(userKey)) || 'null');

    if (!user) {
      // Brand-new user — check whether an admin already exists
      const adminSettings = JSON.parse(
        (await redis.get('admin:settings')) || 'null'
      );
      const isFirstUser = !adminSettings;

      user = {
        telegram_id: id.toString(),
        first_name: first_name || '',
        last_name: last_name,
        username: username,
        photo_url: photo_url,
        role: isFirstUser ? 'admin' : 'user',
        created_at: new Date().toISOString(),
        auth_method: 'telegram',
      };

      // Persist user record
      await redis.set(userKey, JSON.stringify(user));

      // Add to the global users set
      await redis.sadd('users:all', `tg:${id}`);

      // If this is the first ever user, bootstrap admin settings
      if (isFirstUser) {
        await redis.set(
          'admin:settings',
          JSON.stringify({ admin_ids: [id.toString()] })
        );
        console.info('[telegram-auth] First user — granted admin role:', id);
      }
    } else {
      // Existing user — refresh mutable Telegram fields (name/avatar can change)
      user.first_name = first_name || user.first_name;
      user.last_name = last_name || user.last_name;
      user.username = username || user.username;
      user.photo_url = photo_url || user.photo_url;
      user.last_seen = new Date().toISOString();
      await redis.set(userKey, JSON.stringify(user));
    }

    // ── 4. Create session token ───────────────────────────────────────────────
    const token = crypto.randomBytes(32).toString('hex');
    const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    await redis.set(
      `session:${token}`,
      JSON.stringify({
        telegram_id: id.toString(),
        auth_method: 'telegram',
        created_at: new Date().toISOString(),
        expires_at: Date.now() + SESSION_TTL_MS,
      }),
      { px: SESSION_TTL_MS } // Redis TTL in milliseconds
    );

    // ── 5. Set cookie and redirect to dashboard ───────────────────────────────
    const cookieMaxAge = 7 * 24 * 60 * 60; // 7 days in seconds
    res.setHeader(
      'Set-Cookie',
      `plume_token=${token}; Path=/; Max-Age=${cookieMaxAge}; HttpOnly; SameSite=Lax`
    );

    return res.redirect('/dashboard');
  } catch (err) {
    console.error('[telegram-auth] Unexpected error:', err);
    return res.redirect('/login?error=server_error');
  }
};
