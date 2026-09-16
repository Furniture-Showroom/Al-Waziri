/**
 * validation.js
 * Client-side validation. This is a UX convenience layer only — the Apps
 * Script backend re-validates everything server-side, because client
 * checks can always be bypassed.
 */
'use strict';

const Validation = (() => {
  function getExtension(fileName) {
    const match = /\.[^.]+$/.exec(fileName || '');
    return match ? match[0].toLowerCase() : '';
  }

  /**
   * Validate a single image file against SITE_CONFIG.upload rules.
   * Returns { valid: boolean, reason?: string }.
   */
  function validateImageFile(file) {
    const rules = SITE_CONFIG.upload;
    if (!file) return { valid: false, reason: 'لم يتم اختيار ملف.' };

    if (!rules.allowedMimeTypes.includes(file.type)) {
      return { valid: false, reason: 'صيغة الملف غير مدعومة.' };
    }
    const ext = getExtension(file.name);
    if (!rules.allowedExtensions.includes(ext)) {
      return { valid: false, reason: 'امتداد الملف غير مدعوم.' };
    }
    if (file.size <= 0) {
      return { valid: false, reason: 'الملف فارغ أو تالف.' };
    }
    if (file.size > rules.maxFileSizeBytes) {
      return { valid: false, reason: `حجم الصورة أكبر من ${Utils.formatBytes(rules.maxFileSizeBytes)}.` };
    }
    return { valid: true };
  }

  /** Validate a batch of files: per-file result plus a count check. */
  function validateImageBatch(files, alreadyQueuedCount = 0) {
    const rules = SITE_CONFIG.upload;
    const total = files.length + alreadyQueuedCount;
    const countOk = total <= rules.maxFilesPerWork;
    const perFile = Array.from(files).map((file) => ({ file, ...validateImageFile(file) }));
    return {
      countOk,
      countReason: countOk ? null : `الحد الأقصى ${rules.maxFilesPerWork} صورة لكل عمل.`,
      perFile,
    };
  }

  /** Validate the "add work" form fields. */
  function validateWorkForm({ category, title, description }) {
    const errors = {};
    const categoryIds = SITE_CONFIG.categories.map((c) => c.id);

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) errors.title = 'اسم العمل مطلوب.';
    else if (trimmedTitle.length > 120) errors.title = 'اسم العمل طويل جدًا (الحد 120 حرفًا).';

    if (!category || !categoryIds.includes(category)) errors.category = 'اختر قسمًا صحيحًا.';

    if (description && description.length > 600) errors.description = 'الوصف طويل جدًا (الحد 600 حرف).';

    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** Validate login form fields before hitting the network. */
  function validateLoginForm({ username, password }) {
    const errors = {};
    if (!username || !username.trim()) errors.username = 'اسم المستخدم مطلوب.';
    if (!password) errors.password = 'كلمة المرور مطلوبة.';
    return { valid: Object.keys(errors).length === 0, errors };
  }

  return { validateImageFile, validateImageBatch, validateWorkForm, validateLoginForm };
})();
