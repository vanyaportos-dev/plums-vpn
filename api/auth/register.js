const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const crypto = require('crypto');

function hashPassword(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(p, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 🔧 Парсим FormData
async function parseFormData(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  const params = new URLSearchParams(raw);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const body = await parseFormData(req);
    const { name, email, password } = body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    const existing = JSON.parse(await redis.get(`user:${email.toLowerCase()}`) || 'null');
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }
    
    const user = {
      email: email.toLowerCase(),
      password: hashPassword(password),
      name: name,
      role: 'user',
      created_at: new Date().toISOString()
    };
    
    await redis.set(`user:${email.toLowerCase()}`, JSON.stringify(user));
    await redis.sadd('users:all', email.toLowerCase());
    
    const adminSettings = JSON.parse(await redis.get('admin:settings') || 'null');
    if (!adminSettings) {
      await redis.set('admin:settings', JSON.stringify({ admin_emails: [email.toLowerCase()] }));
      user.role = 'admin';
      await redis.set(`user:${email.toLowerCase()}`, JSON.stringify(user));
    }
    
    const token = generateToken();
    await redis.set(`session:${token}`, JSON.stringify({
      email: email.toLowerCase(),
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000
    }));
    
    return res.status(200).json({
      token,
      user: { email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
