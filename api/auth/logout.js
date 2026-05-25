const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      await redis.del(`session:${auth.split(' ')[1]}`);
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};