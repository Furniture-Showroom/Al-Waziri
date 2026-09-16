/**
 * pwa.js
 * Registers the service worker and manages install UX.
 * - Android/Chrome: listens for `beforeinstallprompt`, shows a CTA banner.
 * - iOS/Safari: `beforeinstallprompt` does not exist there; shows manual
 *   "Add to Home Screen" instructions instead, once, with a cooldown.
 */
'use strict';

const PWA = (() => {
  const DISMISS_KEY = 'showroom_install_dismissed_at';
  const DISMISS_COOLDOWN_DAYS = 14;
  let deferredPrompt = null;

  function daysSince(timestamp) {
    if (!timestamp) return Infinity;
    return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  }

  function wasRecentlyDismissed() {
    return daysSince(Utils.storage.get(DISMISS_KEY)) < DISMISS_COOLDOWN_DAYS;
  }

  function markDismissed() {
    Utils.storage.set(DISMISS_KEY, Date.now());
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        // Registration can fail (e.g. unsupported scope on some static
        // hosts); the site still works fully online without it.
      });
    });
  }

  function buildBanner({ title, desc, primaryLabel, onPrimary }) {
    const dismissBtn = Utils.el('button', {
      class: 'install-banner-dismiss btn-icon',
      type: 'button',
      'aria-label': 'إغلاق',
      text: '×',
    });
    const primaryBtn = Utils.el('button', { class: 'btn btn-gold btn-sm', type: 'button', text: primaryLabel });
    const banner = Utils.el('div', { class: 'install-banner', role: 'complementary', 'aria-label': 'تثبيت التطبيق' }, [
      Utils.el('img', { src: 'assets/icons/icon-192.png', alt: '', width: 40, height: 40 }),
      Utils.el('div', { class: 'install-banner-text' }, [
        Utils.el('div', { class: 'install-banner-title', text: title }),
        Utils.el('div', { class: 'install-banner-desc', text: desc }),
      ]),
      Utils.el('div', { class: 'install-banner-actions' }, [primaryBtn, dismissBtn]),
    ]);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));

    function hide() {
      banner.classList.remove('is-visible');
      setTimeout(() => banner.remove(), 300);
    }
    dismissBtn.addEventListener('click', () => {
      markDismissed();
      hide();
    });
    primaryBtn.addEventListener('click', () => {
      onPrimary();
      hide();
    });
    return { hide };
  }

  function setupAndroidInstall() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      if (wasRecentlyDismissed() || Utils.isStandalone()) return;
      buildBanner({
        title: `تثبيت ${SITE_CONFIG.shortName}`,
        desc: 'أضف الموقع إلى شاشتك الرئيسية للوصول السريع بدون متصفح.',
        primaryLabel: 'تثبيت',
        onPrimary: async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
        },
      });
    });
  }

  function setupIOSInstallHint() {
    if (!Utils.isIOS() || !Utils.isSafari() || Utils.isStandalone()) return;
    if (wasRecentlyDismissed()) return;
    buildBanner({
      title: `تثبيت ${SITE_CONFIG.shortName}`,
      desc: 'اضغط زر المشاركة، ثم "إضافة إلى الشاشة الرئيسية".',
      primaryLabel: 'فهمت',
      onPrimary: () => {},
    });
  }

  function init() {
    registerServiceWorker();
    setupAndroidInstall();
    // iOS hint appears a little later so it doesn't compete with the hero.
    setTimeout(setupIOSInstallHint, 2500);
  }

  return { init };
})();
