module.exports = async function handler(req, res) {
  // Читаем сырое тело
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');

  res.json({
    method: req.method,
    rawBody: raw,
    parsedBody: raw ? JSON.parse(raw) : null,
    headers: {
      contentType: req.headers['content-type'],
    }
  });
};
