/**
 * app.js
 * Orchestrates the public homepage: navigation, category filters, the
 * Featured Works carousel, and the lightbox. Reads data through Api and
 * never touches ImgBB or Sheets directly (that all lives server-side).
 */
'use strict';

(function initPublicSite() {
  const CATEGORY_ICONS = {
    bedrooms: '<path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18v2M21 18v2M5 13V9a2 2 0 012-2h2a2 2 0 012 2v1m2-1a2 2 0 012-2h2a2 2 0 012 2v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    kids: '<circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 21v-3a4 4 0 014-4h6a4 4 0 014 4v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    reception: '<path d="M4 13a2 2 0 012-2h12a2 2 0 012 2v4H4v-4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M4 17v3M20 17v3M6 11V8a2 2 0 012-2h8a2 2 0 012 2v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    dining: '<ellipse cx="12" cy="8" rx="8" ry="2.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 8v3c0 1.3 3.6 2.4 8 2.4s8-1.1 8-2.4V8M12 13.4V21M8 21h8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    corners: '<path d="M4 20V9a2 2 0 012-2h3v9M4 20h16M9 16h11v-3a2 2 0 00-2-2h-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    kitchens: '<path d="M4 8h16M6 8v10a2 2 0 002 2h8a2 2 0 002-2V8M9 8V6a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M9 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    'home-furniture': '<path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  };

  const state = {
    activeCategory: 'all',
    works: [],
  };

  function icon(markup, size = 24) {
    const span = document.createElement('span');
    span.innerHTML = `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${markup}</svg>`;
    return span.firstChild;
  }

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

  // ---- Categories grid --------------------------------------------------
  function renderCategories() {
    const grid = Utils.qs('#category-grid');
    if (!grid) return;
    grid.innerHTML = '';
    SITE_CONFIG.categories.forEach((cat) => {
      const card = Utils.el(
        'button',
        {
          type: 'button',
          class: 'category-card',
          'data-category': cat.id,
          onClick: () => selectCategory(cat.id, true),
        },
        [
          Utils.el('span', { class: 'category-card-icon' }, icon(CATEGORY_ICONS[cat.id] || '', 28)),
          Utils.el('span', { class: 'category-card-label', text: cat.label }),
          Utils.el('span', { class: 'category-card-count', 'data-count-for': cat.id, text: '' }),
        ]
      );
      grid.appendChild(card);
    });
  }

  function updateCategoryCounts() {
    const counts = state.works.reduce((acc, work) => {
      acc[work.category] = (acc[work.category] || 0) + 1;
      return acc;
    }, {});
    Utils.qsa('[data-count-for]').forEach((el) => {
      const count = counts[el.dataset.countFor] || 0;
      el.textContent = count ? `${count} عمل` : '';
    });
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
    Utils.qsa('.category-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.category === categoryId);
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
    updateCategoryCounts();
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
    renderCategories();
    renderFilterPills();
    setupRetry();
    loadWorks();
    // See js/api.js's getBaseUrl() note: PWA is a `const` global, not a
    // `window` property, even when pwa.js loaded successfully.
    if (typeof PWA !== 'undefined') PWA.init();
  });
})();
