/**
 * utils.js
 * Small, dependency-free helpers shared by the public site and the admin app.
 * No framework. No external libraries.
 */
'use strict';

const Utils = (() => {
  /** Shorthand querySelector */
  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  /** Shorthand querySelectorAll -> real array */
  function qsa(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  /** Debounce: waits for a pause in calls before running fn. */
  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** Throttle: runs fn at most once per `wait` ms. */
  function throttle(fn, wait) {
    let last = 0;
    let scheduled = null;
    return function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(scheduled);
        scheduled = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  /** Escape text before inserting into innerHTML to prevent XSS. */
  function escapeHTML(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Clamp a number between min and max. */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** Build a DOM element with attributes/children in one call. */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        node.setAttribute(key, value);
      }
    });
    [].concat(children).forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /** Format an ISO date string into a short Arabic-friendly date. */
  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    } catch (err) {
      return date.toLocaleDateString();
    }
  }

  /** Format bytes into a readable file-size string. */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['بايت', 'ك.بايت', 'م.بايت', 'ج.بايت'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  /** Build a wa.me link with a prefilled message. */
  function buildWhatsAppLink(phoneE164, message) {
    const digits = String(phoneE164 || '').replace(/[^\d]/g, '');
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return `https://wa.me/${digits}${text}`;
  }

  /** Detect iOS (including iPadOS on Safari, which reports as Mac + touch). */
  function isIOS() {
    const ua = window.navigator.userAgent;
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isTouchMac = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
    return isAppleMobile || isTouchMac;
  }

  /** Detect Safari specifically (needed for iOS install instructions). */
  function isSafari() {
    const ua = window.navigator.userAgent;
    return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  }

  /** True when the app is already running as an installed PWA. */
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  /** Read/write small non-sensitive UI flags in localStorage, fails silently. */
  const storage = {
    get(key, fallback = null) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* storage unavailable (private mode/quota) — degrade silently */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (err) { /* no-op */ }
    },
  };

  /** Lightweight toast notifications. Creates the region once, reuses it. */
  function toast(message, type = 'info', duration = 4000) {
    let region = qs('.toast-region');
    if (!region) {
      region = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(region);
    }
    const node = el('div', { class: `toast${type === 'error' ? ' is-error' : ''}${type === 'success' ? ' is-success' : ''}` }, message);
    region.appendChild(node);
    setTimeout(() => node.remove(), duration);
  }

  return {
    qs,
    qsa,
    debounce,
    throttle,
    escapeHTML,
    clamp,
    el,
    formatDate,
    formatBytes,
    buildWhatsAppLink,
    isIOS,
    isSafari,
    isStandalone,
    storage,
    toast,
  };
})();
