/**
 * app.js
 * Orchestrates the public homepage: navigation, category filters, the
 * Featured Works carousel, and the lightbox. Reads data through Api and
 * never touches ImgBB or Sheets directly (that all lives server-side).
 */
'use strict';

(function initPublicSite() {
  const state = {
    activeCategory: 'all',
    works: [],
  };

  // ---- Header / mobile nav ------------------------------------------
  function setupNav() {
    const toggle = Utils.qs('.nav-toggle');
    const mobileMenu = Utils.qs('.nav-mobile');
    if (!toggle || !mobileMenu) return;
    toggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    Utils.qsa('a', mobileMenu).forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  // ---- Contact links, populated from config (single source of truth) --
  function setupContactLinks() {
    const waMessage = `السلام عليكم، أرغب في الاستفسار عن الأثاث من ${SITE_CONFIG.businessName}.`;
    const waLink = Utils.buildWhatsAppLink(SITE_CONFIG.whatsapp, waMessage);
    Utils.qsa('[data-link="whatsapp"]').forEach((a) => { a.href = waLink; });
    Utils.qsa('[data-link="phone"]').forEach((a) => { a.href = `tel:${SITE_CONFIG.phone}`; });
    Utils.qsa('[data-link="facebook"]').forEach((a) => { a.href = SITE_CONFIG.facebook; });
    Utils.qsa('[data-text="phone"]').forEach((el) => { el.textContent = SITE_CONFIG.phone; });
    Utils.qsa('[data-text="business-name"]').forEach((el) => { el.textContent = SITE_CONFIG.businessName; });
  }

  // ---- Filter pills -------------------------------------------------
  function renderFilterPills() {
    const container = Utils.qs('#filter-pills');
    if (!container) return;
    container.innerHTML = '';
    const allPill = Utils.el(
      'button',
      { type: 'button', class: 'filter-pill is-active', 'data-category': 'all', onClick: () => selectCategory('all') },
      'الكل'
    );
    container.appendChild(allPill);
    SITE_CONFIG.categories.forEach((cat) => {
      const pill = Utils.el(
        'button',
        { type: 'button', class: 'filter-pill', 'data-category': cat.id, onClick: () => selectCategory(cat.id) },
        cat.label
      );
      container.appendChild(pill);
    });
  }

  function selectCategory(categoryId, scrollToWorks = false) {
    state.activeCategory = categoryId;
    Utils.qsa('.filter-pill').forEach((pill) => {
      pill.classList.toggle('is-active', pill.dataset.category === categoryId);
    });
    renderCarouselCards();
    if (scrollToWorks) {
      const target = Utils.qs('#featured-works');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- Featured Works carousel --------------------------------------
  let carouselInstance = null;

  function getFilteredWorks() {
    if (state.activeCategory === 'all') return state.works;
    return state.works.filter((work) => work.category === state.activeCategory);
  }

  function categoryLabel(categoryId) {
    const found = SITE_CONFIG.categories.find((c) => c.id === categoryId);
    return found ? found.label : categoryId;
  }

  function renderCarouselCards() {
    const viewport = Utils.qs('#carousel-viewport');
    if (!viewport) return;
    const works = getFilteredWorks();

    if (!works.length) {
      viewport.innerHTML = '';
      viewport.classList.add('is-empty');
      showCarouselState('empty');
      return;
    }
    viewport.classList.remove('is-empty');
    viewport.innerHTML = '';
    works.forEach((work) => {
      const card = Utils.el(
        'div',
        { class: 'carousel-card', tabindex: '-1', role: 'option', onClick: () => openWork(work.id) },
        [
          Utils.el('div', { class: 'carousel-card-media' }, [
            Utils.el('img', {
              src: work.coverImageUrl || '',
              alt: work.title,
              loading: 'lazy',
              decoding: 'async',
            }),
          ]),
          Utils.el('div', { class: 'carousel-card-body' }, [
            Utils.el('div', { class: 'carousel-card-cat', text: categoryLabel(work.category) }),
            Utils.el('div', { class: 'carousel-card-title', text: work.title }),
            Utils.el('div', { class: 'carousel-card-count', text: `${work.imageCount || 1} صورة` }),
          ]),
        ]
      );
      viewport.appendChild(card);
    });

    if (!carouselInstance) {
      carouselInstance = Carousel.create({ root: Utils.qs('#featured-carousel') });
    }
    carouselInstance.refresh();
    showCarouselState('ready');
  }

  function showCarouselState(mode) {
    const wrap = Utils.qs('#featured-carousel');
    if (!wrap) return;
    Utils.qsa('[data-state]', wrap).forEach((node) => {
      node.hidden = node.dataset.state !== mode;
    });
  }

  async function openWork(workId) {
    Utils.toast('جارٍ تحميل صور العمل…', 'info', 1500);
    const result = await Api.getWork(workId);
    if (!result.success) {
      Utils.toast(result.error.message || 'تعذر تحميل صور العمل.', 'error');
      return;
    }
    const work = result.data;
    if (!work.images || !work.images.length) {
      Utils.toast('لا توجد صور متاحة لهذا العمل حاليًا.', 'error');
      return;
    }
    Gallery.open(
      { title: work.title, category: categoryLabel(work.category), images: work.images },
      0
    );
  }

  async function loadWorks() {
    showCarouselState('loading');
    const result = await Api.getWorks();
    if (!result.success) {
      showCarouselState('error');
      const errorBlock = Utils.qs('[data-state="error"] .state-desc');
      if (errorBlock) errorBlock.textContent = result.error.message || 'تعذر تحميل الأعمال حاليًا، يرجى إعادة المحاولة.';
      return;
    }
    state.works = result.data || [];
    renderCarouselCards();
  }

  function setupRetry() {
    const retryBtn = Utils.qs('[data-action="retry-works"]');
    if (retryBtn) retryBtn.addEventListener('click', loadWorks);
  }

  // ---- Boot ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    setupNav();
    setupContactLinks();
    renderFilterPills();
    setupRetry();
    loadWorks();
    // See js/api.js's getBaseUrl() note: PWA is a `const` global, not a
    // `window` property, even when pwa.js loaded successfully.
    if (typeof PWA !== 'undefined') PWA.init();
  });
})();
