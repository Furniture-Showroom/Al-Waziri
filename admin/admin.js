/**
 * admin.js
 * Drives both admin/index.html (login) and admin/dashboard.html.
 * Each page only wires up the elements that actually exist on it.
 */
'use strict';

const MAX_CONCURRENT_UPLOADS = 2;

// ---- Shared: redirect home on session expiry ---------------------------
function handleAuthFailure(result) {
  if (result && result.error && (result.error.code === 'UNAUTHORIZED' || result.error.code === 'SESSION_EXPIRED')) {
    Api.clearToken();
    Utils.toast('انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.', 'error');
    setTimeout(() => { window.location.href = './index.html'; }, 1200);
    return true;
  }
  return false;
}

// =========================================================================
// Login page
// =========================================================================

/**
 * Pings a public, no-auth endpoint on page load and shows a plain-language
 * status on the login page itself. This turns "why won't it log in"
 * (wrong apiBaseUrl, deployment down, wrong access level, ...) into one
 * readable message instead of a multi-step dev-tools investigation.
 *
 * On failure it also keeps quietly retrying in the background every 15s,
 * so a transient hiccup (e.g. Apps Script waking up from a cold start)
 * clears itself without the person needing to notice and click "retry".
 */
const HEALTH_CHECK_RETRY_MS = 15000;
let healthCheckTimer = null;

async function runServerHealthCheck() {
  clearTimeout(healthCheckTimer);

  const statusEl = Utils.qs('#server-status');
  const textEl = Utils.qs('#server-status-text');
  if (!statusEl || !textEl) return;

  statusEl.className = 'server-status is-checking';
  textEl.textContent = 'جارٍ التحقق من الاتصال بالخادم…';
  Utils.qsa('.server-status-detail, .server-status-retry', statusEl).forEach((el) => el.remove());

  // See the note in js/api.js's getBaseUrl(): SITE_CONFIG is a `const`
  // global, never a `window` property, even though it loaded correctly.
  const configuredUrl = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG.apiBaseUrl) || '';

  if (!configuredUrl || configuredUrl.includes('REPLACE_WITH_YOUR_DEPLOYMENT_ID')) {
    // Not a transient problem — retrying automatically wouldn't help, so
    // we don't schedule a background retry for this specific case.
    showHealthError(
      'رابط الخادم (apiBaseUrl) غير مضبوط في js/config.js — عدّله من مستودع GitHub.',
      null
    );
    return;
  }

  const result = await Api.getCategories();

  if (result.success) {
    statusEl.className = 'server-status is-ok';
    textEl.textContent = 'متصل بالخادم بنجاح';
    return;
  }

  var friendly = {
    NETWORK_ERROR: 'تعذر الوصول للخادم — تأكد أن رابط Apps Script منشور ومتاح لأي شخص (Anyone).',
    TIMEOUT: 'استغرق الخادم وقتًا طويلاً للرد — جرّب مرة أخرى بعد قليل.',
    BAD_RESPONSE: 'رد الخادم غير متوقع — تأكد أن كل ملفات apps-script منسوخة بشكل صحيح.',
    UNKNOWN_ACTION: 'الخادم يرد لكن لا يعرف هذا الإجراء — تأكد أن Code.gs محدَّث ومنشور بآخر إصدار.',
    SERVER_NOT_CONFIGURED: 'إعداد الخادم غير مكتمل (تأكد من إنشاء الأوراق ومفتاح ImgBB في Script Properties).',
  }[result.error.code];

  showHealthError(friendly || result.error.message || 'تعذر الاتصال بالخادم لسبب غير معروف.', configuredUrl);
  healthCheckTimer = setTimeout(runServerHealthCheck, HEALTH_CHECK_RETRY_MS);
}

function showHealthError(message, configuredUrl) {
  const statusEl = Utils.qs('#server-status');
  const textEl = Utils.qs('#server-status-text');
  statusEl.className = 'server-status is-error';
  textEl.textContent = message;

  if (configuredUrl) {
    const detail = Utils.el('div', { class: 'server-status-detail', text: `الرابط الحالي: ${configuredUrl}` });
    statusEl.appendChild(detail);
  }
  const retryBtn = Utils.el('button', {
    class: 'btn btn-outline btn-sm server-status-retry',
    type: 'button',
    text: 'إعادة المحاولة',
    style: 'color:var(--color-danger);border-color:var(--color-danger);',
    onClick: runServerHealthCheck,
  });
  statusEl.appendChild(retryBtn);
}

function setupLoginPage() {
  const form = Utils.qs('#login-form');
  if (!form) return;

  if (Api.isLoggedIn()) {
    window.location.href = './dashboard.html';
    return;
  }

  runServerHealthCheck();

  const submitBtn = Utils.qs('#login-submit');
  const submitLabel = Utils.qs('#login-submit-label');

  function setErrors(errors) {
    ['username', 'password'].forEach((field) => {
      const errorEl = Utils.qs(`#${field}-error`);
      if (!errorEl) return;
      const message = errors[field];
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = Utils.qs('#username').value.trim();
    const password = Utils.qs('#password').value;

    const { valid, errors } = Validation.validateLoginForm({ username, password });
    setErrors(errors);
    if (!valid) return;

    submitBtn.disabled = true;
    submitLabel.textContent = 'جارٍ الدخول…';

    const result = await Api.login(username, password);

    submitBtn.disabled = false;
    submitLabel.textContent = 'تسجيل الدخول';

    if (!result.success) {
      Utils.toast(result.error.message || 'تعذر تسجيل الدخول.', 'error');
      return;
    }
    window.location.href = './dashboard.html';
  });
}

// =========================================================================
// Dashboard page
// =========================================================================
function setupDashboardPage() {
  const addWorkForm = Utils.qs('#add-work-form');
  if (!addWorkForm) return;

  if (!Api.isLoggedIn()) {
    window.location.href = './index.html';
    return;
  }

  // ---- Logout -----------------------------------------------------------
  Utils.qs('#logout-btn').addEventListener('click', async () => {
    await Api.logout();
    window.location.href = './index.html';
  });

  // ---- Confirm modal helper ----------------------------------------------
  const modal = Utils.qs('#confirm-modal');
  const modalDesc = Utils.qs('#confirm-desc');
  const modalOk = Utils.qs('#confirm-ok');
  const modalCancel = Utils.qs('#confirm-cancel');
  let pendingConfirmAction = null;

  function askConfirm(message, onConfirm) {
    modalDesc.textContent = message;
    pendingConfirmAction = onConfirm;
    modal.classList.add('is-open');
  }
  function closeConfirm() {
    modal.classList.remove('is-open');
    pendingConfirmAction = null;
  }
  modalCancel.addEventListener('click', closeConfirm);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeConfirm(); });
  modalOk.addEventListener('click', async () => {
    const action = pendingConfirmAction;
    closeConfirm();
    if (action) await action();
  });

  // ---- Category select ----------------------------------------------------
  const categorySelect = Utils.qs('#work-category');
  SITE_CONFIG.categories.forEach((cat) => {
    categorySelect.appendChild(Utils.el('option', { value: cat.id }, cat.label));
  });

  // ---- Stats --------------------------------------------------------------
  async function loadStats() {
    const result = await Api.getDashboardStats();
    if (handleAuthFailure(result)) return;
    if (!result.success) {
      Utils.toast(result.error.message || 'تعذر تحميل الإحصائيات.', 'error');
      return;
    }
    const stats = result.data;
    Utils.qs('#stat-works').textContent = stats.totalWorks ?? 0;
    Utils.qs('#stat-images').textContent = stats.totalImages ?? 0;
    Utils.qs('#stat-active').textContent = stats.activeWorks ?? 0;
    Utils.qs('#stat-latest').textContent = stats.latestWorkTitle || 'لا يوجد';

    const list = Utils.qs('#category-stat-list');
    list.innerHTML = '';
    (stats.byCategory || []).forEach((row) => {
      list.appendChild(
        Utils.el('div', { class: 'category-stat-row' }, [
          Utils.el('span', { text: row.label }),
          Utils.el('strong', { text: `${row.count} عمل` }),
        ])
      );
    });
  }

  // ---- Works list -----------------------------------------------------
  async function loadWorks() {
    const tableEl = Utils.qs('#works-table');
    const result = await Api.getWorks();
    if (handleAuthFailure(result)) return;
    if (!result.success) {
      tableEl.innerHTML = '';
      tableEl.appendChild(
        Utils.el('div', { class: 'state-block' }, [
          Utils.el('p', { class: 'state-title', text: 'تعذر تحميل الأعمال حاليًا، يرجى إعادة المحاولة.' }),
          Utils.el('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إعادة المحاولة', onClick: loadWorks }),
        ])
      );
      return;
    }
    const works = result.data || [];
    tableEl.innerHTML = '';
    if (!works.length) {
      tableEl.appendChild(Utils.el('p', { class: 'section-desc', text: 'لا توجد أعمال بعد. أضف أول عمل من النموذج المجاور.' }));
      return;
    }
    works.forEach((work) => tableEl.appendChild(buildWorkRow(work)));
  }

  function categoryLabel(id) {
    const found = SITE_CONFIG.categories.find((c) => c.id === id);
    return found ? found.label : id;
  }

  function buildWorkRow(work) {
    const deleteBtn = Utils.el('button', { class: 'btn btn-sm', type: 'button', text: 'حذف', style: 'background:var(--color-danger-bg);color:var(--color-danger);' });
    deleteBtn.addEventListener('click', () => {
      askConfirm(`سيتم حذف العمل "${work.title}" وجميع صوره نهائيًا.`, async () => {
        const result = await Api.deleteWork(work.id);
        if (handleAuthFailure(result)) return;
        if (!result.success) {
          Utils.toast(result.error.message || 'تعذر حذف العمل.', 'error');
          return;
        }
        Utils.toast('تم حذف العمل.', 'success');
        Api.invalidateReadCache();
        loadWorks();
        loadStats();
      });
    });

    const toggleBtn = Utils.el('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'الصور' });
    const imagesPanel = Utils.el('div', { class: 'upload-list', hidden: true });
    let imagesLoaded = false;
    toggleBtn.addEventListener('click', async () => {
      imagesPanel.hidden = !imagesPanel.hidden;
      if (!imagesPanel.hidden && !imagesLoaded) {
        imagesLoaded = true;
        const result = await Api.getWork(work.id);
        if (handleAuthFailure(result)) return;
        if (!result.success) {
          imagesPanel.appendChild(Utils.el('p', { class: 'field-error', text: 'تعذر تحميل الصور.' }));
          return;
        }
        (result.data.images || []).forEach((image) => {
          const row = Utils.el('div', { class: 'upload-item' }, [
            Utils.el('img', { src: image.url, alt: '', loading: 'lazy', decoding: 'async' }),
            Utils.el('div', { class: 'upload-item-info', text: 'صورة' }),
          ]);
          const removeBtn = Utils.el('button', { class: 'btn btn-sm upload-item-retry', type: 'button', text: 'حذف' });
          removeBtn.addEventListener('click', () => {
            askConfirm('هل تريد حذف هذه الصورة؟', async () => {
              const delResult = await Api.deleteImage(image.id);
              if (handleAuthFailure(delResult)) return;
              if (!delResult.success) {
                Utils.toast(delResult.error.message || 'تعذر حذف الصورة.', 'error');
                return;
              }
              row.remove();
              Utils.toast('تم حذف الصورة.', 'success');
              Api.invalidateReadCache();
              loadStats();
            });
          });
          row.appendChild(removeBtn);
          imagesPanel.appendChild(row);
        });
      }
    });

    const row = Utils.el('div', { class: 'work-row' }, [
      Utils.el('img', { src: work.coverImageUrl || '', alt: '', loading: 'lazy', decoding: 'async' }),
      Utils.el('div', { class: 'work-row-info' }, [
        Utils.el('div', { class: 'work-row-title', text: work.title }),
        Utils.el('div', { class: 'work-row-meta' }, [
          `${categoryLabel(work.category)} · ${work.imageCount || 0} صورة · `,
          Utils.el('span', { class: `badge ${work.active ? 'badge-active' : 'badge-inactive'}`, text: work.active ? 'منشور' : 'غير منشور' }),
        ]),
      ]),
      Utils.el('div', { class: 'work-row-actions' }, [toggleBtn, deleteBtn]),
    ]);

    const wrapper = Utils.el('div', {}, [row, imagesPanel]);
    return wrapper;
  }

  // ---- Add-work form + uploader ------------------------------------------
  const fileInput = Utils.qs('#work-images');
  const dropzone = Utils.qs('#dropzone');
  const uploadListEl = Utils.qs('#upload-list');
  let queue = []; // { id, file, status, progress, error }
  let queueCounter = 0;

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    addFilesToQueue(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    addFilesToQueue(fileInput.files);
    fileInput.value = '';
  });

  function addFilesToQueue(fileList) {
    const errorEl = Utils.qs('#images-error');
    const { countOk, countReason, perFile } = Validation.validateImageBatch(fileList, queue.length);
    if (!countOk) {
      errorEl.textContent = countReason;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    perFile.forEach(({ file, valid, reason }) => {
      queueCounter += 1;
      const item = { id: queueCounter, file, status: valid ? 'queued' : 'failed', progress: 0, error: valid ? null : reason };
      queue.push(item);
    });
    renderQueue();
  }

  function renderQueue() {
    uploadListEl.innerHTML = '';
    queue.forEach((item) => uploadListEl.appendChild(buildQueueRow(item)));
  }

  function buildQueueRow(item) {
    const statusLabels = { queued: 'بالانتظار', uploading: 'جارٍ الرفع…', success: 'تم الرفع', failed: 'فشل الرفع', retrying: 'إعادة المحاولة…' };
    const thumb = Utils.el('img', { alt: '' });
    const reader = new FileReader();
    reader.onload = () => { thumb.src = reader.result; };
    if (item.file.type.startsWith('image/')) reader.readAsDataURL(item.file);

    const progressBar = Utils.el('div', { class: 'upload-progress-bar' });
    progressBar.style.width = `${item.progress}%`;
    const status = Utils.el('span', { class: 'upload-item-status', text: statusLabels[item.status] || '' });

    const row = Utils.el(
      'div',
      { class: `upload-item ${item.status === 'success' ? 'is-success' : ''} ${item.status === 'failed' ? 'is-failed' : ''}` },
      [
        thumb,
        Utils.el('div', { class: 'upload-item-info' }, [
          Utils.el('div', { class: 'upload-item-name', text: item.file.name }),
          Utils.el('div', { class: 'upload-item-meta', text: item.error || Utils.formatBytes(item.file.size) }),
          Utils.el('div', { class: 'upload-progress' }, progressBar),
        ]),
        status,
      ]
    );

    if (item.status === 'failed' && item.uploadAttempted) {
      const retryBtn = Utils.el('button', { class: 'btn btn-outline btn-sm upload-item-retry', type: 'button', text: 'إعادة' });
      retryBtn.addEventListener('click', () => retryUpload(item));
      row.appendChild(retryBtn);
    }
    const removeBtn = Utils.el('button', { class: 'btn btn-sm', type: 'button', text: '×', 'aria-label': 'إزالة', style: 'width:32px;padding:0;' });
    removeBtn.addEventListener('click', () => {
      queue = queue.filter((q) => q.id !== item.id);
      renderQueue();
    });
    row.appendChild(removeBtn);
    return row;
  }

  function updateItem(id, patch) {
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    Object.assign(item, patch);
    renderQueue();
  }

  async function uploadOne(workId, item) {
    if (item.status === 'failed' && item.error && !item.uploadAttempted) return; // client-validation failure, not retryable by re-sending
    updateItem(item.id, { status: 'uploading', progress: 0, uploadAttempted: true });
    const result = await Api.uploadImageWithProgress(workId, item.file, (pct) => updateItem(item.id, { progress: pct }));
    if (handleAuthFailure(result)) return result;
    if (result.success) {
      updateItem(item.id, { status: 'success', progress: 100 });
    } else {
      updateItem(item.id, { status: 'failed', error: result.error.message || 'فشل رفع الصورة.' });
    }
    return result;
  }

  function retryUpload(item) {
    if (!currentWorkId) return;
    uploadOne(currentWorkId, item);
  }

  /** Upload the whole queue with a small concurrency limit. */
  async function uploadQueue(workId) {
    const pending = queue.filter((item) => item.status === 'queued');
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor];
        cursor += 1;
        await uploadOne(workId, item);
      }
    }
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, pending.length) }, worker);
    await Promise.all(workers);
  }

  let currentWorkId = null;

  addWorkForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const category = categorySelect.value;
    const title = Utils.qs('#work-title').value;
    const description = Utils.qs('#work-description').value.trim();

    const { valid, errors } = Validation.validateWorkForm({ category, title, description });
    ['category', 'title', 'description'].forEach((field) => {
      const errorEl = Utils.qs(`#${field}-error`);
      errorEl.textContent = errors[field] || '';
      errorEl.hidden = !errors[field];
    });
    if (!valid) return;

    const validFiles = queue.filter((item) => item.status !== 'failed' || item.uploadAttempted);
    if (!validFiles.length) {
      Utils.qs('#images-error').textContent = 'أضف صورة واحدة على الأقل.';
      Utils.qs('#images-error').hidden = false;
      return;
    }

    const submitBtn = Utils.qs('#add-work-submit');
    const submitLabel = Utils.qs('#add-work-submit-label');
    submitBtn.disabled = true;
    submitLabel.textContent = 'جارٍ الحفظ…';

    const createResult = await Api.createWork({ category, title: title.trim(), description });
    if (handleAuthFailure(createResult)) return;
    if (!createResult.success) {
      Utils.toast(createResult.error.message || 'تعذر إنشاء العمل.', 'error');
      submitBtn.disabled = false;
      submitLabel.textContent = 'حفظ العمل';
      return;
    }

    currentWorkId = createResult.data.workId;
    await uploadQueue(currentWorkId);

    const successCount = queue.filter((item) => item.status === 'success').length;
    if (successCount === 0) {
      Utils.toast('تعذر رفع أي صورة، حاول مرة أخرى قبل إنهاء العمل.', 'error');
      submitBtn.disabled = false;
      submitLabel.textContent = 'حفظ العمل';
      return;
    }

    const finalizeResult = await Api.finalizeWork(currentWorkId);
    if (handleAuthFailure(finalizeResult)) return;

    submitBtn.disabled = false;
    submitLabel.textContent = 'حفظ العمل';

    if (!finalizeResult.success) {
      Utils.toast(finalizeResult.error.message || 'تم رفع الصور لكن تعذر نشر العمل.', 'error');
      return;
    }

    Utils.toast('تم إضافة العمل بنجاح.', 'success');
    Api.invalidateReadCache();
    addWorkForm.reset();
    queue = [];
    currentWorkId = null;
    renderQueue();
    loadWorks();
    loadStats();
  });

  loadStats();
  loadWorks();
}

document.addEventListener('DOMContentLoaded', () => {
  setupLoginPage();
  setupDashboardPage();
});
