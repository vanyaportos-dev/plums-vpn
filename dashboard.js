/* ═══════════════════════════════════════════════════════════════
   dashboard.js — Личный кабинет Plume Connect (Telegram Mini App)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── Глобальное состояние ────────────────────────────────────────
const State = {
  user: null,
  plans: [],
  subscriptions: [],
  devices: {},           // { [uuid]: Device[] }
  history: {},           // { [uuid]: { data, offset, total } }
  activeTab: 'plans',
  upgradeTarget: null,   // { subUuid }
  trafficTarget: null,   // { subUuid }
};

// ─── DOM хелперы ─────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ─── Telegram Mini App Guard ──────────────────────────────────────
// Эта функция вызывается ДО init().
// Если страница открыта в браузере — редиректим в бот.
// Если внутри TMA, но токена ещё нет — пробуем авторизоваться через initData.
async function guardMiniApp() {
  const tg = window.Telegram && window.Telegram.WebApp;

  // Открыто в обычном браузере (нет SDK или нет initData)
  if (!tg || !tg.initData || tg.initData === '') {
    // Даём шанс на cookie-сессию (был редирект через /api/auth/telegram)
    const cookieToken = getCookieToken();
    if (!cookieToken) {
      window.location.replace('https://t.me/plumecrobot');
      return false; // Стоп
    }
    // Есть cookie — разрешаем продолжить
    return true;
  }

  // Мы внутри Telegram Mini App
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) {
    try { tg.setHeaderColor('#0a0a0f'); } catch (_) {}
  }

  // Проверяем, есть ли уже токен
  const existingToken = localStorage.getItem('plume_token');
  if (existingToken) return true; // Уже авторизованы

  // Токена нет — логинимся через initData
  try {
    const response = await fetch('/api/auth/telegram/miniapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      console.error('[TMA Guard] Auth failed:', data.error);
      showFullscreenError('Ошибка авторизации. Перезапустите приложение через @plumecrobot.');
      return false;
    }

    localStorage.setItem('plume_token', data.token);
    localStorage.setItem('plume_user', JSON.stringify(data.user));
    return true;
  } catch (err) {
    console.error('[TMA Guard] Network error:', err);
    showFullscreenError('Нет соединения. Проверьте интернет и перезапустите приложение.');
    return false;
  }
}

// Вспомогательная — читаем plume_token из куки (для OAuth-редиректа)
function getCookieToken() {
  const match = document.cookie.split(';').find(c => c.trim().startsWith('plume_token='));
  if (!match) return null;
  return match.split('=')[1]?.trim() || null;
}

// Полноэкранная заглушка при ошибке
function showFullscreenError(message) {
  document.body.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:100vh; background:#0a0a0f; color:#fff; text-align:center; padding:32px;
      font-family:'Inter',sans-serif;
    ">
      <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:#ff4444; margin-bottom:20px;"></i>
      <p style="font-size:1.1rem; max-width:320px; line-height:1.6;">${message}</p>
      <a href="https://t.me/plumecrobot" style="
        margin-top:24px; padding:12px 28px; background:#6c5ce7; color:#fff;
        border-radius:12px; text-decoration:none; font-weight:600;
      ">Открыть бота</a>
    </div>
  `;
}

// ─── API клиент ──────────────────────────────────────────────────
// Отправляет Bearer-токен из localStorage (для TMA) или опирается на cookie
// (для OAuth-редиректов через /api/auth/telegram). me.js поддерживает оба.
const API = {
  _headers() {
    const token = localStorage.getItem('plume_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  },

  async get(path) {
    const res = await fetch(path, {
      credentials: 'include',           // Cookie fallback
      headers: this._headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  async post(path, body = {}) {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',           // Cookie fallback
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};

// ─── Toast уведомления ───────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = $('#toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = type === 'success' ? 'fa-check-circle'
             : type === 'error'   ? 'fa-times-circle'
             :                      'fa-info-circle';

  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ─── Модальные окна ──────────────────────────────────────────────
function openModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.add('modal--open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.remove('modal--open');
  document.body.style.overflow = '';
}

function closeAllModals() {
  $$('.modal').forEach(m => m.classList.remove('modal--open'));
  document.body.style.overflow = '';
}

// ─── Аутентификация ──────────────────────────────────────────────
async function checkAuth() {
  try {
    const data = await API.get('/api/auth/me');
    State.user = data.user;

    // Обновляем localStorage (в случае если сессия пришла через cookie)
    if (data.user) {
      localStorage.setItem('plume_user', JSON.stringify(data.user));
    }

    renderUserInfo();
  } catch (err) {
    console.error('[checkAuth] Failed:', err.message);

    // Очищаем невалидный токен
    localStorage.removeItem('plume_token');
    localStorage.removeItem('plume_user');

    // Отправляем в бота, не в login.html
    window.location.replace('https://t.me/plumecrobot');
  }
}

function renderUserInfo() {
  const user = State.user;
  if (!user) return;

  const el = $('#user-greeting');
  if (!el) return;

  // Поддерживаем и Telegram-пользователей, и legacy email
  const displayName = user.name || user.first_name || user.email || 'Пользователь';
  el.textContent = `Добро пожаловать, ${displayName}`;

  // Если есть аватар Telegram — показываем
  if (user.photo_url) {
    const avatarEl = $('#user-avatar');
    if (avatarEl) {
      avatarEl.src = user.photo_url;
      avatarEl.style.display = 'block';
    }
  }
}

// ─── Загрузка данных ─────────────────────────────────────────────
async function loadPlans() {
  const grid = $('#plans-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i> Загрузка тарифов…</div>';

  try {
    const data = await API.get('/api/vpn/plans');
    State.plans = data.plans || [];
    renderPlans();
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки тарифов: ${e.message}</p></div>`;
  }
}

async function loadSubscriptions() {
  const container = $('#subscriptions-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i> Загрузка подписок…</div>';

  try {
    const data = await API.get('/api/auth/me');
    State.subscriptions = data.user.subscriptions || [];
    renderSubscriptions();
    updateStats();
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Ошибка: ${e.message}</p></div>`;
  }
}

async function loadDevices(subUuid) {
  try {
    const data = await API.get(`/api/vpn/devices?subscription_uuid=${subUuid}`);
    State.devices[subUuid] = data.devices || [];
    renderDevicesTab();
  } catch (e) {
    showToast(`Ошибка загрузки устройств: ${e.message}`, 'error');
  }
}

async function loadHistory(subUuid, offset = 0) {
  try {
    const data = await API.post('/api/vpn/history', {
      subscription_uuid: subUuid,
      offset,
      limit: 10,
    });
    State.history[subUuid] = {
      data: data.requests || [],
      offset,
      total: data.total || 0,
    };
    renderHistoryTab();
  } catch (e) {
    showToast(`Ошибка загрузки истории: ${e.message}`, 'error');
  }
}

// ─── Рендер: Тарифы ──────────────────────────────────────────────
function renderPlans() {
  const grid = $('#plans-grid');

  if (!State.plans.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>Тарифные планы не найдены</p></div>';
    return;
  }

  grid.innerHTML = State.plans.map(plan => `
    <div class="plan-card" data-plan-uuid="${plan.uuid}">
      <div class="plan-card__header">
        <div class="plan-card__badge">${getPlanBadge(plan)}</div>
        <h3 class="plan-card__name">${escapeHtml(plan.name || 'Тариф')}</h3>
        <div class="plan-card__price">
          <span class="plan-card__price-amount">${formatPrice(plan.price)}</span>
          <span class="plan-card__price-period">/ ${formatPeriod(plan.period)}</span>
        </div>
      </div>
      <div class="plan-card__features">
        ${plan.traffic_gb
          ? `<div class="plan-feature"><i class="fas fa-database"></i> ${plan.traffic_gb} ГБ трафика</div>`
          : '<div class="plan-feature"><i class="fas fa-infinity"></i> Безлимитный трафик</div>'}
        ${plan.devices_count
          ? `<div class="plan-feature"><i class="fas fa-mobile-alt"></i> до ${plan.devices_count} устройств</div>`
          : ''}
        ${plan.speed_mbps
          ? `<div class="plan-feature"><i class="fas fa-tachometer-alt"></i> до ${plan.speed_mbps} Мбит/с</div>`
          : ''}
        <div class="plan-feature"><i class="fas fa-shield-alt"></i> AES-256 шифрование</div>
        <div class="plan-feature"><i class="fas fa-globe"></i> Все серверы</div>
      </div>
      <button class="btn btn--primary btn--full" onclick="handleSubscribe('${plan.uuid}')">
        <i class="fas fa-shopping-cart"></i> Купить
      </button>
    </div>
  `).join('');
}

// ─── Рендер: Подписки ─────────────────────────────────────────────
function renderSubscriptions() {
  const container = $('#subscriptions-list');

  if (!State.subscriptions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-box-open"></i>
        <p>У вас ещё нет подписок</p>
        <button class="btn btn--primary" onclick="switchTab('plans')">
          <i class="fas fa-shopping-cart"></i> Купить тариф
        </button>
      </div>`;
    return;
  }

  container.innerHTML = State.subscriptions.map(sub => `
    <div class="sub-card sub-card--${sub.status}" data-uuid="${sub.uuid}">
      <div class="sub-card__head">
        <div class="sub-card__info">
          <div class="sub-card__title">${escapeHtml(sub.plan || 'Подписка')}</div>
          <div class="sub-card__uuid" title="${sub.uuid}">
            ${sub.uuid ? sub.uuid.substring(0, 16) + '…' : '—'}
          </div>
        </div>
        <div class="sub-card__status-badge status--${sub.status}">
          <i class="fas ${getStatusIcon(sub.status)}"></i>
          ${getStatusLabel(sub.status)}
        </div>
      </div>

      <div class="sub-card__meta">
        <div class="sub-card__meta-item">
          <i class="fas fa-calendar-alt"></i>
          <span>Создана: ${formatDate(sub.created_at)}</span>
        </div>
        ${sub.expires_at ? `
        <div class="sub-card__meta-item">
          <i class="fas fa-calendar-times"></i>
          <span>Истекает: ${formatDate(sub.expires_at)}</span>
        </div>` : ''}
        ${sub.traffic_used !== undefined ? `
        <div class="sub-card__meta-item">
          <i class="fas fa-chart-bar"></i>
          <span>Использовано: ${formatGB(sub.traffic_used)} / ${sub.traffic_total ? formatGB(sub.traffic_total) : '∞'}</span>
        </div>` : ''}
      </div>

      ${sub.traffic_total ? `
      <div class="traffic-bar">
        <div class="traffic-bar__fill"
             style="width: ${Math.min(100, (sub.traffic_used / sub.traffic_total) * 100)}%">
        </div>
      </div>` : ''}

      <div class="sub-card__connect">
        <button class="btn btn--ghost btn--sm" onclick="copySubUrl('${sub.uuid}')">
          <i class="fas fa-link"></i> Ссылка для подключения
        </button>
      </div>

      <div class="sub-card__actions">
        <button class="btn btn--sm btn--accent" onclick="handleRenew('${sub.uuid}')" title="Продлить">
          <i class="fas fa-redo"></i> Продлить
        </button>
        ${sub.status === 'active' ? `
        <button class="btn btn--sm btn--ghost" onclick="handleFreeze('${sub.uuid}')" title="Заморозить">
          <i class="fas fa-pause"></i> Заморозить
        </button>` : ''}
        ${sub.status === 'frozen' ? `
        <button class="btn btn--sm btn--ghost" onclick="handleUnfreeze('${sub.uuid}')" title="Разморозить">
          <i class="fas fa-play"></i> Разморозить
        </button>` : ''}
        <button class="btn btn--sm btn--ghost" onclick="openUpgradeModal('${sub.uuid}')" title="Улучшить">
          <i class="fas fa-level-up-alt"></i> Улучшить
        </button>
        <button class="btn btn--sm btn--ghost" onclick="openTrafficModal('${sub.uuid}')" title="Купить трафик">
          <i class="fas fa-cloud-download-alt"></i> Трафик
        </button>
      </div>
    </div>
  `).join('');
}

// ─── Рендер: Устройства ──────────────────────────────────────────
function renderDevicesTab() {
  const container = $('#devices-list');
  if (!container) return;

  const allDevices = Object.entries(State.devices);

  if (!allDevices.length || allDevices.every(([, d]) => d.length === 0)) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-mobile-alt"></i>
        <p>Нет подключённых устройств</p>
        <small>Подключитесь с любого устройства, чтобы они появились здесь</small>
      </div>`;
    return;
  }

  container.innerHTML = allDevices.map(([subUuid, devices]) => {
    if (!devices.length) return '';
    const sub = State.subscriptions.find(s => s.uuid === subUuid);
    return `
      <div class="devices-group">
        <div class="devices-group__title">
          <i class="fas fa-shield-alt"></i>
          ${sub ? escapeHtml(sub.plan || 'Подписка') : subUuid.substring(0, 16) + '…'}
        </div>
        <div class="devices-grid">
          ${devices.map(device => `
            <div class="device-card">
              <div class="device-card__icon">
                <i class="fas ${getDeviceIcon(device.type)}"></i>
              </div>
              <div class="device-card__info">
                <div class="device-card__name">
                  ${escapeHtml(device.name || `Устройство #${device.id}`)}
                </div>
                <div class="device-card__meta">
                  ${device.ip ? `<span><i class="fas fa-network-wired"></i> ${device.ip}</span>` : ''}
                  ${device.last_seen ? `<span><i class="fas fa-clock"></i> ${formatDate(device.last_seen)}</span>` : ''}
                </div>
              </div>
              <button class="btn btn--sm btn--danger"
                      onclick="handleDeleteDevice('${subUuid}', '${device.id}')"
                      title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Рендер: История ─────────────────────────────────────────────
function renderHistoryTab() {
  const container = $('#history-list');
  const select = $('#history-sub-select');
  if (!container || !select) return;

  if (!State.subscriptions.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Нет подписок для просмотра истории</p></div>';
    return;
  }

  // Наполняем селект, если пустой
  if (select.children.length <= 1) {
    State.subscriptions.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.uuid;
      opt.textContent = `${sub.plan || 'Подписка'} (${sub.uuid.substring(0, 12)}…)`;
      select.appendChild(opt);
    });
  }

  const selectedUuid = select.value;
  const historyData = State.history[selectedUuid];

  if (!historyData) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Выберите подписку и нажмите «Загрузить»</p></div>';
    return;
  }

  if (!historyData.data.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>История подключений пуста</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Время</th>
            <th>IP-адрес</th>
            <th>Устройство</th>
            <th>Трафик</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${historyData.data.map(req => `
            <tr>
              <td>${formatDate(req.created_at)}</td>
              <td><code>${escapeHtml(req.ip || '—')}</code></td>
              <td>${escapeHtml(req.device_name || '—')}</td>
              <td>${req.traffic_bytes ? formatBytes(req.traffic_bytes) : '—'}</td>
              <td>
                <span class="badge badge--${req.status === 'success' ? 'success' : 'danger'}">
                  ${req.status === 'success' ? 'Успешно' : 'Отклонено'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="pagination">
      ${historyData.offset > 0 ? `
        <button class="btn btn--ghost btn--sm" onclick="handleHistoryPrev('${selectedUuid}')">
          <i class="fas fa-chevron-left"></i> Назад
        </button>` : ''}
      <span class="pagination__info">
        Показано ${historyData.offset + 1}–${Math.min(historyData.offset + 10, historyData.total)}
        из ${historyData.total}
      </span>
      ${historyData.offset + 10 < historyData.total ? `
        <button class="btn btn--ghost btn--sm" onclick="handleHistoryNext('${selectedUuid}')">
          Далее <i class="fas fa-chevron-right"></i>
        </button>` : ''}
    </div>
  `;
}

// ─── Статистика ───────────────────────────────────────────────────
function updateStats() {
  const total  = State.subscriptions.length;
  const active = State.subscriptions.filter(s => s.status === 'active').length;
  const spent  = State.subscriptions.reduce((acc, s) => acc + (s.price || 0), 0);

  const el = id => document.getElementById(id);
  if (el('stat-total'))  el('stat-total').textContent  = total;
  if (el('stat-active')) el('stat-active').textContent = active;
  if (el('stat-spent'))  el('stat-spent').textContent  = formatPrice(spent);
}

// ─── Обработчики действий ─────────────────────────────────────────
async function handleSubscribe(planUuid) {
  if (!State.user) return;

  const btn = $(`[data-plan-uuid="${planUuid}"] .btn--primary`);
  setLoading(btn, true);

  try {
    await API.post('/api/vpn/subscribe', {
      plan_uuid: planUuid,
      external_user_id: State.user.telegram_id || State.user.email,
    });
    showToast('Подписка успешно создана!', 'success');
    await loadSubscriptions();
    switchTab('subscriptions');
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleRenew(subUuid) {
  const btn = $(`[data-uuid="${subUuid}"] .btn--accent`);
  setLoading(btn, true);

  try {
    await API.post('/api/vpn/renew', { subscription_uuid: subUuid });
    showToast('Подписка продлена!', 'success');
    await loadSubscriptions();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleFreeze(subUuid) {
  try {
    await API.post('/api/vpn/freeze', { subscription_uuid: subUuid });
    showToast('Подписка заморожена', 'success');
    await loadSubscriptions();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  }
}

async function handleUnfreeze(subUuid) {
  try {
    await API.post('/api/vpn/unfreeze', { subscription_uuid: subUuid });
    showToast('Подписка разморожена', 'success');
    await loadSubscriptions();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  }
}

async function handleDeleteDevice(subUuid, deviceId) {
  if (!confirm('Удалить это устройство?')) return;

  try {
    await API.post('/api/vpn/devices-delete', {
      subscription_uuid: subUuid,
      device_id: deviceId,
    });
    showToast('Устройство удалено', 'success');
    await loadDevices(subUuid);
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  }
}

async function handleHistoryPrev(subUuid) {
  const current = State.history[subUuid];
  if (!current || current.offset === 0) return;
  await loadHistory(subUuid, current.offset - 10);
}

async function handleHistoryNext(subUuid) {
  const current = State.history[subUuid];
  if (!current) return;
  await loadHistory(subUuid, current.offset + 10);
}

async function handleLoadHistory() {
  const subUuid = $('#history-sub-select')?.value;
  if (!subUuid) return showToast('Выберите подписку', 'error');
  await loadHistory(subUuid, 0);
}

// ─── Модальное: Улучшить подписку ────────────────────────────────
function openUpgradeModal(subUuid) {
  State.upgradeTarget = { subUuid };
  const select = $('#upgrade-plan-select');
  if (select) {
    select.innerHTML = State.plans
      .map(p => `<option value="${p.uuid}">${escapeHtml(p.name || p.uuid)}</option>`)
      .join('');
  }
  openModal('upgrade-modal');
}

async function handleUpgradeConfirm() {
  const { subUuid } = State.upgradeTarget;
  const newPlanUuid = $('#upgrade-plan-select')?.value;
  if (!newPlanUuid) return showToast('Выберите новый тариф', 'error');

  try {
    await API.post('/api/vpn/upgrade', {
      subscription_uuid: subUuid,
      new_plan_uuid: newPlanUuid,
    });
    showToast('Тариф успешно изменён!', 'success');
    closeModal('upgrade-modal');
    await loadSubscriptions();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  }
}

// ─── Модальное: Купить трафик ─────────────────────────────────────
function openTrafficModal(subUuid) {
  State.trafficTarget = { subUuid };
  const inp = $('#traffic-amount');
  if (inp) inp.value = 10;
  openModal('traffic-modal');
}

async function handleTrafficConfirm() {
  const { subUuid } = State.trafficTarget;
  const gbAmount = parseInt($('#traffic-amount')?.value || '0', 10);
  if (!gbAmount || gbAmount <= 0) return showToast('Введите количество ГБ', 'error');

  try {
    await API.post('/api/vpn/traffic', {
      subscription_uuid: subUuid,
      gb_amount: gbAmount,
    });
    showToast(`${gbAmount} ГБ трафика добавлено!`, 'success');
    closeModal('traffic-modal');
    await loadSubscriptions();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`, 'error');
  }
}

// ─── Вкладки ──────────────────────────────────────────────────────
function switchTab(tab) {
  State.activeTab = tab;

  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('tab-btn--active', btn.dataset.tab === tab);
  });

  $$('.tab-content').forEach(el => {
    el.classList.toggle('tab-content--active', el.dataset.tab === tab);
  });

  // Ленивая загрузка
  if (tab === 'plans' && !State.plans.length) loadPlans();
  if (tab === 'subscriptions') loadSubscriptions();
  if (tab === 'devices' && State.subscriptions.length) {
    State.subscriptions.forEach(s => loadDevices(s.uuid));
  }
}

// ─── Утилиты ──────────────────────────────────────────────────────
function copySubUrl(subUuid) {
  const url = `https://network-api.adaptgroup.app/sub/${subUuid}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Ссылка скопирована в буфер обмена', 'success'))
    .catch(() => prompt('Скопируйте ссылку:', url));
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalContent || btn.innerHTML;
    btn.disabled = false;
  }
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(price) {
  if (price === undefined || price === null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatPeriod(period) {
  if (!period) return 'мес.';
  return { month: 'мес.', year: 'год', week: 'нед.', day: 'день' }[period] || period;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatGB(gb) {
  if (gb === undefined || gb === null) return '—';
  return `${Number(gb).toFixed(1)} ГБ`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getStatusIcon(status) {
  return {
    active:  'fa-check-circle',
    frozen:  'fa-snowflake',
    expired: 'fa-times-circle',
    pending: 'fa-clock',
  }[status] || 'fa-circle';
}

function getStatusLabel(status) {
  return {
    active:  'Активна',
    frozen:  'Заморожена',
    expired: 'Истекла',
    pending: 'Ожидание',
  }[status] || status;
}

function getDeviceIcon(type) {
  return {
    mobile:  'fa-mobile-alt',
    tablet:  'fa-tablet-alt',
    desktop: 'fa-desktop',
    router:  'fa-wifi',
    tv:      'fa-tv',
  }[type] || 'fa-laptop';
}

function getPlanBadge(plan) {
  if (plan.is_popular) return '<span class="badge badge--accent">🔥 Популярный</span>';
  if (plan.is_trial)   return '<span class="badge badge--success">Пробный</span>';
  return '';
}

// ─── Выход ────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await API.post('/api/auth/logout');
  } catch (_) {}

  // Очищаем localStorage
  localStorage.removeItem('plume_token');
  localStorage.removeItem('plume_user');

  // Возвращаем в бот, не на /login
  window.location.replace('https://t.me/plumecrobot');
}

// ─── Инициализация ────────────────────────────────────────────────
async function init() {
  // 1. Проверяем, что мы в TMA (или есть cookie-сессия)
  const allowed = await guardMiniApp();
  if (!allowed) return; // Редирект уже произошёл

  // 2. Проверяем авторизацию через /api/auth/me
  await checkAuth();

  // 3. Вешаем обработчики вкладок
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 4. Закрытие модальных окон
  $$('.modal__overlay, .modal__close').forEach(el => {
    el.addEventListener('click', closeAllModals);
  });

  // 5. Кнопка выхода
  $('#logout-btn')?.addEventListener('click', handleLogout);

  // 6. Модальные кнопки
  $('#upgrade-confirm')?.addEventListener('click', handleUpgradeConfirm);
  $('#traffic-confirm')?.addEventListener('click', handleTrafficConfirm);
  $('#history-load-btn')?.addEventListener('click', handleLoadHistory);

  // 7. Загружаем первую вкладку
  await loadPlans();
  await loadSubscriptions();
}

// Точка входа
document.addEventListener('DOMContentLoaded', init);
