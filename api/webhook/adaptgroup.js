const crypto = require('crypto');

/**
 * Верификация подписи вебхука
 * @param {string} rawBody - сырое тело запроса в виде строки
 * @param {string} secret - секрет из переменных среды
 * @param {string} signature - подпись из заголовка X-Webhook-Signature
 * @returns {boolean}
 */
function verifySignature(rawBody, secret, signature) {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Опциональная верификация подписи
    const webhookSecret = process.env.ADAPTGROUP_WEBHOOK_SECRET;
    const incomingSignature = req.headers['x-webhook-signature'];

    if (webhookSecret && incomingSignature) {
      const rawBody = JSON.stringify(req.body);
      if (!verifySignature(rawBody, webhookSecret, incomingSignature)) {
        console.warn('[webhook] ❌ Неверная подпись вебхука');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ error: 'event и data обязательны' });
    }

    console.log(`[webhook] 📡 Получено событие: ${event}`, {
      subscription_uuid: data.subscription_uuid,
      timestamp: new Date().toISOString()
    });

    switch (event) {
      case 'subs.created':
        // Подписка успешно создана
        console.log('[webhook] ✅ Подписка создана:', data.subscription_uuid);
        // TODO: обновить запись пользователя в Vercel KV
        // await kv.hset(`user:${data.external_user_id}`, { subscriptions: [...] });
        break;

      case 'subs.renewed':
        // Подписка продлена
        console.log('[webhook] 🔄 Подписка продлена:', data.subscription_uuid);
        // TODO: обновить дату окончания подписки в KV
        break;

      case 'subs.expired':
        // Подписка истекла
        console.log('[webhook] ❌ Подписка истекла:', data.subscription_uuid);
        // TODO: пометить подписку как expired в KV
        break;

      case 'subs.frozen':
        // Подписка заморожена
        console.log('[webhook] 🧊 Подписка заморожена:', data.subscription_uuid);
        // TODO: обновить статус подписки в KV
        break;

      case 'subs.unfrozen':
        // Подписка разморожена
        console.log('[webhook] 🔥 Подписка разморожена:', data.subscription_uuid);
        // TODO: обновить статус подписки в KV
        break;

      case 'subs.upgraded':
        // Подписка улучшена
        console.log('[webhook] ⬆️ Подписка улучшена:', data.subscription_uuid);
        // TODO: обновить план подписки в KV
        break;

      case 'subs.traffic_purchased':
        // Трафик куплен
        console.log('[webhook] 📦 Трафик приобретён:', data.subscription_uuid, `+${data.gb_amount}GB`);
        break;

      case 'subs.traffic_threshold_reached':
        // Достигнут порог трафика
        console.log('[webhook] ⚠️ Порог трафика достигнут:', data.subscription_uuid);
        // TODO: отправить уведомление пользователю
        break;

      case 'device.deleted':
        // Устройство удалено
        console.log('[webhook] 🗑️ Устройство удалено:', data.device_id, 'из подписки:', data.subscription_uuid);
        break;

      default:
        console.warn('[webhook] ❓ Неизвестное событие:', event, data);
    }

    return res.status(200).json({ ok: true, received: event });
  } catch (error) {
    console.error('[webhook] 💥 Ошибка обработки вебхука:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
