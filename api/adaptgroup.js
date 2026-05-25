const API_BASE = 'https://network-api.adaptgroup.app';
const API_KEY = 'ADAPTF753KJUVRZ3VESULP45YBVFC2IVIMBWABI7T63WREXPZGS4R5PGAVPN';
const API_KEY_ID = 24;

/**
 * Базовый хелпер для всех запросов к AdaptGroup API
 * @param {string} endpoint - путь к эндпоинту
 * @param {object} body - тело запроса
 * @returns {Promise<object>} - ответ от API
 */
async function apiCall(endpoint, body = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY
    },
    body: JSON.stringify({ api_key_id: API_KEY_ID, ...body })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return await response.json();
}

// ─────────────────────────────────────────────
// 1. GET PLANS — список всех тарифных планов
// ─────────────────────────────────────────────
async function getPlans() {
  const data = await apiCall('/plans/list');
  return data.plans || [];
}

// ─────────────────────────────────────────────
// 2. CREATE SUBSCRIPTION — создать подписку
// @param {string} planUuid - UUID тарифного плана
// @param {string} externalUserId - внешний ID пользователя (email или id)
// ─────────────────────────────────────────────
async function createSubscription(planUuid, externalUserId) {
  return await apiCall('/subs/create', {
    plan_uuid: planUuid,
    external_user_id: externalUserId
  });
}

// ─────────────────────────────────────────────
// 3. RENEW SUBSCRIPTION — продлить подписку
// @param {string} subscriptionUuid - UUID подписки
// ─────────────────────────────────────────────
async function renewSubscription(subscriptionUuid) {
  return await apiCall('/subs/renew', {
    subscription_uuid: subscriptionUuid
  });
}

// ─────────────────────────────────────────────
// 4. FREEZE SUBSCRIPTION — заморозить подписку
// @param {string} subscriptionUuid - UUID подписки
// ─────────────────────────────────────────────
async function freezeSubscription(subscriptionUuid) {
  return await apiCall('/subs/freeze', {
    subscription_uuid: subscriptionUuid
  });
}

// ─────────────────────────────────────────────
// 5. UNFREEZE SUBSCRIPTION — разморозить подписку
// @param {string} subscriptionUuid - UUID подписки
// ─────────────────────────────────────────────
async function unfreezeSubscription(subscriptionUuid) {
  return await apiCall('/subs/unfreeze', {
    subscription_uuid: subscriptionUuid
  });
}

// ─────────────────────────────────────────────
// 6. UPGRADE SUBSCRIPTION — улучшить подписку
// @param {string} subscriptionUuid - UUID текущей подписки
// @param {string} newPlanUuid - UUID нового тарифного плана
// ─────────────────────────────────────────────
async function upgradeSubscription(subscriptionUuid, newPlanUuid) {
  return await apiCall('/subs/upgrade', {
    subscription_uuid: subscriptionUuid,
    new_plan_uuid: newPlanUuid
  });
}

// ─────────────────────────────────────────────
// 7. PURCHASE TRAFFIC — купить дополнительный трафик
// @param {string} subscriptionUuid - UUID подписки
// @param {number} gbAmount - количество гигабайт
// ─────────────────────────────────────────────
async function purchaseTraffic(subscriptionUuid, gbAmount) {
  return await apiCall('/subs/traffic', {
    subscription_uuid: subscriptionUuid,
    gb_amount: gbAmount
  });
}

// ─────────────────────────────────────────────
// 8. GET SUBSCRIPTION STATUS — получить статус подписки
// @param {string} subscriptionUuid - UUID подписки
// ─────────────────────────────────────────────
async function getSubscriptionStatus(subscriptionUuid) {
  return await apiCall('/subs/status', {
    subscription_uuid: subscriptionUuid
  });
}

// ─────────────────────────────────────────────
// 9. GET DEVICES — список подключённых устройств
// @param {string} subscriptionUuid - UUID подписки
// ─────────────────────────────────────────────
async function getDevices(subscriptionUuid) {
  const data = await apiCall('/subs/devices', {
    subscription_uuid: subscriptionUuid
  });
  return data.devices || [];
}

// ─────────────────────────────────────────────
// 10. GET CONNECTION REQUESTS — история подключений
// @param {string} subscriptionUuid - UUID подписки
// @param {number} offset - смещение для пагинации
// @param {number} limit - количество записей на странице
// ─────────────────────────────────────────────
async function getConnectionRequests(subscriptionUuid, offset = 0, limit = 20) {
  return await apiCall('/subs/requests', {
    subscription_uuid: subscriptionUuid,
    offset: offset,
    limit: limit
  });
}

// ─────────────────────────────────────────────
// 11. DELETE DEVICE — удалить устройство
// @param {string} subscriptionUuid - UUID подписки
// @param {string|number} deviceId - ID устройства
// ─────────────────────────────────────────────
async function deleteDevice(subscriptionUuid, deviceId) {
  return await apiCall('/subs/devices/delete', {
    subscription_uuid: subscriptionUuid,
    device_id: deviceId
  });
}

// ─────────────────────────────────────────────
// 12. GET SUBSCRIPTION URL — ссылка для подключения клиента
// @param {string} subscriptionUuid - UUID подписки
// @returns {string} - URL для конфигурации VPN клиента
// ─────────────────────────────────────────────
function getSubscriptionURL(subscriptionUuid) {
  return `${API_BASE}/sub/${subscriptionUuid}`;
}

module.exports = {
  getPlans,
  createSubscription,
  renewSubscription,
  freezeSubscription,
  unfreezeSubscription,
  upgradeSubscription,
  purchaseTraffic,
  getSubscriptionStatus,
  getDevices,
  getConnectionRequests,
  deleteDevice,
  getSubscriptionURL
};
