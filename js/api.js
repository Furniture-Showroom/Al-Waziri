/**
 * api.js
 * Thin client for the Google Apps Script backend.
 *
 * Contract (see apps-script/Code.gs):
 *   Success -> { success: true,  data: <any>, error: null }
 *   Failure -> { success: false, data: null,  error: { code, message } }
 *
 * Design notes (documented further in README):
 * - Requests are sent as POST with a text/plain body (JSON-encoded) instead
 *   of application/json. Apps Script Web Apps do not implement the CORS
 *   preflight (OPTIONS) handshake, so a JSON content-type would make the
 *   browser send a preflight request that Apps Script cannot answer and
 *   the call would fail. text/plain is a CORS "simple" content type, so
 *   the browser sends the POST directly. Apps Script parses the JSON body
 *   itself on the server side.
 * - The session token (when present) travels inside the JSON body, not as
 *   an Authorization header, for the same preflight-avoidance reason.
 */
'use strict';

const Api = (() => {
  const TOKEN_KEY = 'showroom_admin_session';
  const REQUEST_TIMEOUT_MS = 12000;
  const UPLOAD_TIMEOUT_MS = 45000; // uploads go through ImgBB server-side too, so allow more time

  function getBaseUrl() {
    // NOTE: SITE_CONFIG is declared with `const` in config.js, so it is NOT
    // a property of `window` (only `var` declarations become window
    // properties) — but it IS visible as a plain identifier to every later
    // <script> on the page, since classic scripts share one global scope.
    // `typeof` guards against a hard ReferenceError if config.js failed to
    // load at all, instead degrading to the NOT_CONFIGURED message below.
    return (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG.apiBaseUrl) || '';
  }

  function getToken() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      /* sessionStorage unavailable — session simply won't survive reload */
    }
  }

  function clearToken() {
    setToken('');
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function networkErrorResult(err) {
    const isTimeout = err && err.message === 'TIMEOUT';
    return {
      success: false,
      data: null,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout
          ? 'استغرق الاتصال وقتًا طويلاً، يرجى المحاولة مرة أخرى.'
          : 'تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مجددًا.',
      },
    };
  }

  /** Core POST call. `payload` is a plain object; token is injected automatically. */
  async function post(action, payload = {}, { requireAuth = false } = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
      return {
        success: false,
        data: null,
        error: { code: 'NOT_CONFIGURED', message: 'لم يتم ضبط رابط الخادم بعد (apiBaseUrl).' },
      };
    }
    const token = getToken();
    if (requireAuth && !token) {
      return { success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولًا.' } };
    }
    const body = JSON.stringify({ action, token: token || undefined, ...payload });
    try {
      const response = await withTimeout(
        fetch(baseUrl, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
        }),
        REQUEST_TIMEOUT_MS
      );
      const json = await response.json();
      return normalize(json);
    } catch (err) {
      return networkErrorResult(err);
    }
  }

  /** Core GET call for read-only actions, with a short client-side cache
   * and one automatic retry on transient network failure. Retrying is only
   * ever done here (never in post()) because GET reads are safe to repeat;
   * retrying a POST could duplicate a side effect (e.g. a second image row)
   * if the first attempt actually succeeded but its response was lost. */
  const READ_CACHE_TTL_MS = 90 * 1000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function cacheKeyFor(action, params) {
    return 'api_cache_' + new URLSearchParams({ action, ...params }).toString();
  }
  function readCache(key) {
    const entry = Utils.storage.get(key);
    if (!entry || typeof entry.expiresAt !== 'number' || Date.now() > entry.expiresAt) return null;
    return entry.value;
  }
  function writeCache(key, value) {
    Utils.storage.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL_MS });
  }

  async function attemptGet(url) {
    try {
      const response = await withTimeout(fetch(url, { method: 'GET' }), REQUEST_TIMEOUT_MS);
      const json = await response.json();
      return normalize(json);
    } catch (err) {
      return networkErrorResult(err);
    }
  }

  async function get(action, params = {}, { cache = false } = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
      return {
        success: false,
        data: null,
        error: { code: 'NOT_CONFIGURED', message: 'لم يتم ضبط رابط الخادم بعد (apiBaseUrl).' },
      };
    }

    const cacheKey = cache ? cacheKeyFor(action, params) : null;
    if (cacheKey) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const query = new URLSearchParams({ action, ...params }).toString();
    const url = `${baseUrl}?${query}`;

    let result = await attemptGet(url);
    const isTransient = !result.success && (result.error.code === 'NETWORK_ERROR' || result.error.code === 'TIMEOUT');
    if (isTransient) {
      await sleep(700);
      result = await attemptGet(url);
    }

    if (result.success && cacheKey) writeCache(cacheKey, result);
    return result;
  }

  function normalize(json) {
    if (json && typeof json === 'object' && 'success' in json) return json;
    return { success: false, data: null, error: { code: 'BAD_RESPONSE', message: 'رد غير متوقع من الخادم.' } };
  }

  // ---- Public read endpoints -------------------------------------------
  // cache:true — short-lived client cache so repeat visits/filter clicks
  // feel instant instead of re-hitting Apps Script every time.
  const getCategories = () => get('getCategories', {}, { cache: true });
  const getWorks = (category) => get('getWorks', category ? { category } : {}, { cache: true });
  const getWork = (workId) => get('getWork', { workId }); // not cached: opened once per click, must reflect live edits

  /** Clears the local getWorks/getCategories cache — call after any admin
   * action that changes what the public site should show, so the admin's
   * own next view isn't served stale cached data from before the change. */
  function invalidateReadCache() {
    try {
      const keys = Object.keys(window.sessionStorage).filter((k) => k.startsWith('api_cache_'));
      keys.forEach((k) => window.sessionStorage.removeItem(k));
    } catch (err) {
      /* sessionStorage unavailable — nothing to clear */
    }
  }

  // ---- Auth ---------------------------------------------------------------
  async function login(username, password) {
    const result = await post('login', { username, password });
    if (result.success && result.data && result.data.token) {
      setToken(result.data.token);
    }
    return result;
  }

  async function logout() {
    const result = await post('logout', {}, { requireAuth: true });
    clearToken();
    return result;
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  // ---- Admin: works ---------------------------------------------------
  const createWork = (work) => post('createWork', { work }, { requireAuth: true });
  const updateWork = (workId, patch) => post('updateWork', { workId, patch }, { requireAuth: true });
  const deleteWork = (workId) => post('deleteWork', { workId }, { requireAuth: true });
  const finalizeWork = (workId) => post('finalizeWork', { workId }, { requireAuth: true });

  // ---- Admin: images ----------------------------------------------------
  // `fileBase64` excludes the `data:...;base64,` prefix; server re-validates
  // mime/size regardless of what the client claims.
  const uploadImage = (workId, fileName, mimeType, fileBase64) =>
    post('uploadImage', { workId, fileName, mimeType, fileBase64 }, { requireAuth: true });
  const deleteImage = (imageId) => post('deleteImage', { imageId }, { requireAuth: true });

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('FILE_READ_ERROR'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Upload one image using `fetch` — the same transport already proven
   * reliable for login/getCategories on this deployment. An earlier
   * version used XMLHttpRequest to get real upload-progress events, but
   * XHR has known issues following the cross-origin redirect Apps Script
   * issues on POST once the body gets large (base64 images), which
   * surfaced as opaque network errors. `fetch` handles that redirect
   * correctly, so we trade real byte-progress for a simulated progress
   * bar (steady climb to 90% while waiting, snaps to 100% on success) —
   * reliability first. Resolves with the same { success, data, error }
   * shape as every other call; network errors are a normal failure
   * result, not a rejected promise.
   */
  async function uploadImageWithProgress(workId, file, onProgress) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
      return { success: false, data: null, error: { code: 'NOT_CONFIGURED', message: 'لم يتم ضبط رابط الخادم بعد (apiBaseUrl).' } };
    }
    const token = getToken();
    if (!token) {
      return { success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولًا.' } };
    }

    const tick = typeof onProgress === 'function' ? onProgress : () => {};
    let simulated = 5;
    tick(simulated);
    const progressTimer = setInterval(() => {
      simulated = Math.min(simulated + 7, 90);
      tick(simulated);
    }, 400);

    let fileBase64;
    try {
      fileBase64 = await readFileAsBase64(file);
    } catch (err) {
      clearInterval(progressTimer);
      return { success: false, data: null, error: { code: 'FILE_READ_ERROR', message: 'تعذرت قراءة الملف.' } };
    }

    const body = JSON.stringify({ action: 'uploadImage', token, workId, fileName: file.name, mimeType: file.type, fileBase64 });
    try {
      const response = await withTimeout(
        fetch(baseUrl, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' }),
        UPLOAD_TIMEOUT_MS
      );
      const json = await response.json();
      clearInterval(progressTimer);
      tick(100);
      return normalize(json);
    } catch (err) {
      clearInterval(progressTimer);
      return networkErrorResult(err);
    }
  }

  // ---- Admin: dashboard stats -------------------------------------------
  const getDashboardStats = () => post('getDashboardStats', {}, { requireAuth: true });

  return {
    getToken,
    setToken,
    clearToken,
    isLoggedIn,
    getCategories,
    getWorks,
    getWork,
    invalidateReadCache,
    login,
    logout,
    createWork,
    updateWork,
    deleteWork,
    finalizeWork,
    uploadImage,
    uploadImageWithProgress,
    deleteImage,
    getDashboardStats,
  };
})();
