/* ============================================================
   PLUME CONNECT — app.js
   Общие функции + навигация + Telegram Mini App авто-вход
   ============================================================ */

'use strict';

/* ── Навигация: sticky + burger ─────────────────────────────── */
(function initNavbar() {
  const navbar      = document.querySelector('.navbar');
  const burger      = document.querySelector('.navbar-burger');
  const mobileMenu  = document.querySelector('.navbar-mobile');
  const mobileClose = document.querySelector('.navbar-mobile-close');

  if (!navbar) return;

  // Sticky scroll class
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Burger toggle
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      mobileMenu.classList.add('open');
      document.body.style.overflow = 'hidden';
      burger.setAttribute('aria-expanded', 'true');
    });
  }

  if (mobileClose && mobileMenu) {
    mobileClose.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
      if (burger) burger.setAttribute('aria-expanded', 'false');
    });
  }

  // Close mobile menu on link click
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
        if (burger) burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

/* ── FAQ аккордеон ──────────────────────────────────────────── */
(function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length) return;

  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      items.forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });

    // Keyboard accessibility
    question.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        question.click();
      }
    });
  });
})();

/* ── Scroll reveal ───────────────────────────────────────────── */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  els.forEach(el => observer.observe(el));
})();

/* ── Smooth scroll для якорей ───────────────────────────────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════
   TELEGRAM MINI APP — авто-вход
   Запускается на КАЖДОЙ странице. Если открыто внутри Telegram:
   1. Инициализируем WebApp SDK
   2. Если уже есть валидный токен — пропускаем
   3. Иначе — отправляем initData на сервер, получаем токен
   4. Сохраняем в localStorage и редиректим на /dashboard (только с /)
   ═══════════════════════════════════════════════════════════════ */
(function initTelegramMiniApp() {
  // Проверяем наличие Telegram WebApp SDK
  if (!window.Telegram || !window.Telegram.WebApp) return;

  const tg = window.Telegram.WebApp;

  // Сигнализируем Telegram что приложение готово
  tg.ready();
  // Разворачиваем на весь экран
  tg.expand();

  // Применяем цветовую схему Telegram (светлая/тёмная)
  document.documentElement.setAttribute(
    'data-tg-theme',
    tg.colorScheme || 'dark'
  );

  // Если токен уже есть — авторизация не нужна
  const existingToken = localStorage.getItem('plume_token');
  if (existingToken) return;

  // initData может быть пустым в dev-режиме
  if (!tg.initData) {
    console.warn('[miniapp] initData is empty — skipping auto-login (dev mode?)');
    return;
  }

  // Авто-вход: отправляем initData на сервер
  (async function autoLogin() {
    try {
      const response = await fetch('/api/auth/telegram/miniapp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ initData: tg.initData }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        console.error('[miniapp] Auto-login failed:', data.error || response.status);
        return;
      }

      // Сохраняем токен и данные пользователя
      localStorage.setItem('plume_token', data.token);
      localStorage.setItem('plume_user', JSON.stringify(data.user));

      // Редиректим на дашборд только с главной страницы
      if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      console.error('[miniapp] Auto-login error:', err);
    }
  })();
})();

/* ── Утилиты ─────────────────────────────────────────────────── */

/**
 * Показать кратковременное уведомление (toast).
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.plume-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `plume-toast plume-toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  const baseStyle = `
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-radius: 12px;
    font-family: var(--font, 'Inter', sans-serif);
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: toastIn 0.3s ease both;
    max-width: 340px;
  `;

  const typeStyle = type === 'success'
    ? 'background:rgba(0,214,143,0.12);border:1px solid rgba(0,214,143,0.3);color:#00d68f;'
    : 'background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.3);color:#ff6b6b;';

  toast.setAttribute('style', baseStyle + typeStyle);

  if (!document.querySelector('#toast-keyframes')) {
    const s = document.createElement('style');
    s.id = 'toast-keyframes';
    s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

/**
 * Экранирование HTML для безопасной вставки текста.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/**
 * Форматировать дату в читаемый вид.
 * @param {string} iso - ISO date string
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  });
}

// Экспорт для использования в других скриптах
window.PlumeApp = { showToast, escapeHtml, formatDate };
