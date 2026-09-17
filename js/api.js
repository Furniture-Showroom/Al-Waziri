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
  const REQUEST_TIMEOUT_MS = 20000;

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

  /** Core GET call for read-only, cacheable actions. */
  async function get(action, params = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
      return {
        success: false,
        data: null,
        error: { code: 'NOT_CONFIGURED', message: 'لم يتم ضبط رابط الخادم بعد (apiBaseUrl).' },
      };
    }
    const query = new URLSearchParams({ action, ...params }).toString();
    try {
      const response = await withTimeout(fetch(`${baseUrl}?${query}`, { method: 'GET' }), REQUEST_TIMEOUT_MS);
      const json = await response.json();
      return normalize(json);
    } catch (err) {
      return networkErrorResult(err);
    }
  }

  function normalize(json) {
    if (json && typeof json === 'object' && 'success' in json) return json;
    return { success: false, data: null, error: { code: 'BAD_RESPONSE', message: 'رد غير متوقع من الخادم.' } };
  }

  // ---- Public read endpoints -------------------------------------------
  const getCategories = () => get('getCategories');
  const getWorks = (category) => get('getWorks', category ? { category } : {});
  const getWork = (workId) => get('getWork', { workId });

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
   * Upload one image with real byte-level progress via XMLHttpRequest
   * (fetch() has no upload progress event). Resolves with the same
   * { success, data, error } shape as every other call — network errors
   * become a normal failure result rather than a rejected promise, so
   * callers don't need two error-handling paths.
   */
  function uploadImageWithProgress(workId, file, onProgress) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
      return Promise.resolve({
        success: false,
        data: null,
        error: { code: 'NOT_CONFIGURED', message: 'لم يتم ضبط رابط الخادم بعد (apiBaseUrl).' },
      });
    }
    const token = getToken();
    if (!token) {
      return Promise.resolve({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولًا.' } });
    }

    return readFileAsBase64(file)
      .then(
        (fileBase64) =>
          new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', baseUrl, true);
            xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
            xhr.timeout = 60000;

            if (xhr.upload && typeof onProgress === 'function') {
              xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
              };
            }

            xhr.onload = () => {
              try {
                resolve(normalize(JSON.parse(xhr.responseText)));
              } catch (err) {
                resolve({ success: false, data: null, error: { code: 'BAD_RESPONSE', message: 'رد غير متوقع من الخادم.' } });
              }
            };
            xhr.onerror = () => resolve(networkErrorResult(new Error('NETWORK_ERROR')));
            xhr.ontimeout = () => resolve(networkErrorResult(new Error('TIMEOUT')));

            xhr.send(JSON.stringify({ action: 'uploadImage', token, workId, fileName: file.name, mimeType: file.type, fileBase64 }));
          })
      )
      .catch(() =>
        Promise.resolve({ success: false, data: null, error: { code: 'FILE_READ_ERROR', message: 'تعذرت قراءة الملف.' } })
      );
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
