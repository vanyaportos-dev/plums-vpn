const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const crypto = require('crypto');

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verify;
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
    const { email, password } = body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    
    const user = JSON.parse(await redis.get(`user:${email.toLowerCase()}`) || 'null');
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
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
