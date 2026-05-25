/* ============================================================
   PLUME CONNECT — auth.js
   Авторизация (фронт)
   ============================================================ */

'use strict';

const API_BASE       = '/api';
const AUTH_TOKEN_KEY = 'plume_token';
const AUTH_USER_KEY  = 'plume_user';

/* ── Получить текущего пользователя из localStorage ─────────── */
function getCurrentUser() {
  const u = localStorage.getItem(AUTH_USER_KEY);
  try {
    return u ? JSON.parse(u) : null;
  } catch (e) {
    return null;
  }
}

/* ── Получить токен ──────────────────────────────────────────── */
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/* ── Проверить сессию через API ──────────────────────────────── */
async function checkAuth() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const r = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (r.ok) {
      const d = await r.json();
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(d.user));
      return d.user;
    }
  } catch (e) {
    // Сеть недоступна
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  return null;
}

/* ── Вход (через FormData) ──────────────────────────────────── */
async function login(email, password) {
  const formData = new FormData();
  formData.append('email', email.trim());
  formData.append('password', password);

  const r = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: formData
  });

  const d = await r.json();

  if (r.ok && d.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, d.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(d.user));
    window.location.href = '/dashboard';
  } else {
    throw new Error(d.error || 'Ошибка входа');
  }
}

/* ── Регистрация (через FormData) ──────────────────────────── */
async function register(name, email, password) {
  const formData = new FormData();
  formData.append('name', name.trim());
  formData.append('email', email.trim());
  formData.append('password', password);

  const r = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    body: formData
  });

  const d = await r.json();

  if (r.ok && d.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, d.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(d.user));
    window.location.href = '/dashboard';
  } else {
    throw new Error(d.error || 'Ошибка регистрации');
  }
}

/* ── Выход ───────────────────────────────────────────────────── */
async function logout() {
  const token = getAuthToken();

  if (token) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      // Игнорируем ошибки сети
    }
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.location.href = '/';
}

/* ── Требует авторизации (редирект) ──────────────────────────── */
async function requireAuth() {
  const user = await checkAuth();
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  return user;
}

/* ── Валидация полей ─────────────────────────────────────────── */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
  return password.length >= 6;
}

function validateName(name) {
  return name.trim().length >= 2;
}

/* ── Показ ошибки у поля ─────────────────────────────────────── */
function setFieldError(inputEl, errorEl, message) {
  if (inputEl) inputEl.classList.add('error');
  if (errorEl) errorEl.textContent = message;
}

function clearFieldError(inputEl, errorEl) {
  if (inputEl) inputEl.classList.remove('error');
  if (errorEl) errorEl.textContent = '';
}

/* ── Переключатель видимости пароля ──────────────────────────── */
(function initPasswordToggles() {
  document.querySelectorAll('.form-password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap  = btn.closest('.form-input-wrap');
      const input = wrap && wrap.querySelector('input[type="password"], input[type="text"]');
      const icon  = btn.querySelector('i');
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
      } else {
        input.type = 'password';
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
      }
    });
  });
})();

/* ── Инициализация формы ВХОДА ───────────────────────────────── */
(function initLoginForm() {
  const form = document.querySelector('#login-form');
  if (!form) return;

  const emailInput    = form.querySelector('#login-email');
  const passwordInput = form.querySelector('#login-password');
  const emailError    = form.querySelector('#login-email-error');
  const passwordError = form.querySelector('#login-password-error');
  const alertBox      = form.querySelector('#login-alert');
  const submitBtn     = form.querySelector('#login-submit');

  function validate() {
    let valid = true;

    if (!validateEmail(emailInput.value)) {
      setFieldError(emailInput, emailError, 'Введите корректный email');
      valid = false;
    } else {
      clearFieldError(emailInput, emailError);
    }

    if (!validatePassword(passwordInput.value)) {
      setFieldError(passwordInput, passwordError, 'Пароль должен быть не менее 6 символов');
      valid = false;
    } else {
      clearFieldError(passwordInput, passwordError);
    }

    return valid;
  }

  emailInput.addEventListener('blur', () => {
    if (emailInput.value) {
      if (!validateEmail(emailInput.value)) {
        setFieldError(emailInput, emailError, 'Введите корректный email');
      } else {
        clearFieldError(emailInput, emailError);
      }
    }
  });

  passwordInput.addEventListener('blur', () => {
    if (passwordInput.value) {
      if (!validatePassword(passwordInput.value)) {
        setFieldError(passwordInput, passwordError, 'Пароль должен быть не менее 6 символов');
      } else {
        clearFieldError(passwordInput, passwordError);
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div><span>Входим...</span>';
    if (alertBox) alertBox.innerHTML = '';

    try {
      await login(emailInput.value, passwordInput.value);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Войти</span>';

      if (alertBox) {
        alertBox.innerHTML = `
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle alert-icon"></i>
            <span>${err.message}</span>
          </div>
        `;
      }
    }
  });
})();

/* ── Инициализация формы РЕГИСТРАЦИИ ─────────────────────────── */
(function initRegisterForm() {
  const form = document.querySelector('#register-form');
  if (!form) return;

  const nameInput      = form.querySelector('#reg-name');
  const emailInput     = form.querySelector('#reg-email');
  const passwordInput  = form.querySelector('#reg-password');
  const confirmInput   = form.querySelector('#reg-confirm');
  const nameError      = form.querySelector('#reg-name-error');
  const emailError     = form.querySelector('#reg-email-error');
  const passwordError  = form.querySelector('#reg-password-error');
  const confirmError   = form.querySelector('#reg-confirm-error');
  const alertBox       = form.querySelector('#reg-alert');
  const submitBtn      = form.querySelector('#reg-submit');

  function validate() {
    let valid = true;

    if (!validateName(nameInput.value)) {
      setFieldError(nameInput, nameError, 'Имя должно быть не менее 2 символов');
      valid = false;
    } else {
      clearFieldError(nameInput, nameError);
    }

    if (!validateEmail(emailInput.value)) {
      setFieldError(emailInput, emailError, 'Введите корректный email');
      valid = false;
    } else {
      clearFieldError(emailInput, emailError);
    }

    if (!validatePassword(passwordInput.value)) {
      setFieldError(passwordInput, passwordError, 'Пароль должен быть не менее 6 символов');
      valid = false;
    } else {
      clearFieldError(passwordInput, passwordError);
    }

    if (confirmInput.value !== passwordInput.value) {
      setFieldError(confirmInput, confirmError, 'Пароли не совпадают');
      valid = false;
    } else if (!confirmInput.value) {
      setFieldError(confirmInput, confirmError, 'Подтвердите пароль');
      valid = false;
    } else {
      clearFieldError(confirmInput, confirmError);
    }

    return valid;
  }

  [
    [nameInput, nameError, () => !validateName(nameInput.value) ? 'Имя должно быть не менее 2 символов' : ''],
    [emailInput, emailError, () => !validateEmail(emailInput.value) ? 'Введите корректный email' : ''],
    [passwordInput, passwordError, () => !validatePassword(passwordInput.value) ? 'Пароль должен быть не менее 6 символов' : ''],
    [confirmInput, confirmError, () => confirmInput.value !== passwordInput.value ? 'Пароли не совпадают' : ''],
  ].forEach(([input, errorEl, checkFn]) => {
    if (!input) return;
    input.addEventListener('blur', () => {
      if (!input.value) return;
      const msg = checkFn();
      msg ? setFieldError(input, errorEl, msg) : clearFieldError(input, errorEl);
    });
    input.addEventListener('input', () => {
      if (input.classList.contains('error')) {
        const msg = checkFn();
        msg ? setFieldError(input, errorEl, msg) : clearFieldError(input, errorEl);
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div><span>Создаём аккаунт...</span>';
    if (alertBox) alertBox.innerHTML = '';

    try {
      await register(nameInput.value, emailInput.value, passwordInput.value);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-user-plus"></i><span>Создать аккаунт</span>';

      if (alertBox) {
        alertBox.innerHTML = `
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle alert-icon"></i>
            <span>${err.message}</span>
          </div>
        `;
      }
    }
  });
})();

/* ── Обновить кнопки навбара (авторизован/нет) ───────────────── */
(async function updateNavbarAuth() {
  const user = getCurrentUser();
  const navActions = document.querySelector('.navbar-actions');
  const mobileNavActions = document.querySelector('.navbar-mobile-actions');

  if (!user) return;

  if (navActions) {
    navActions.innerHTML = `
      <span style="color: var(--text-secondary); font-size: 0.875rem; font-weight: 500;">
        ${user.name || user.email}
      </span>
      <a href="/dashboard" class="btn btn-ghost btn-sm">
        <i class="fas fa-th-large"></i> Панель
      </a>
      <button class="btn btn-ghost btn-sm" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> Выйти
      </button>
    `;
  }

  if (mobileNavActions) {
    mobileNavActions.innerHTML = `
      <a href="/dashboard" class="btn btn-primary btn-block">
        <i class="fas fa-th-large"></i> Панель управления
      </a>
      <button class="btn btn-ghost btn-block" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> Выйти
      </button>
    `;
  }
})();

window.logout = logout;
