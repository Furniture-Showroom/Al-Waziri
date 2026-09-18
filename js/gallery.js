/**
 * gallery.js
 * Fullscreen lightbox for browsing a single work's images.
 * Only the current image + its immediate neighbors are ever loaded at
 * full resolution — everything else stays lazy until it's needed.
 */
'use strict';

const Gallery = (() => {
  let rootEl = null;
  let stageImg = null;
  let titleEl = null;
  let metaEl = null;
  let counterEl = null;
  let dotsEl = null;
  let thumbsEl = null;
  let prevBtn = null;
  let nextBtn = null;
  let closeBtn = null;
  let whatsappBtn = null;

  let work = null; // { title, category, images: [{id, url}] }
  let currentIndex = 0;
  let touchStartX = 0;
  let touchDeltaX = 0;
  let isZoomed = false;
  let lastFocusedEl = null;

  function ensureBuilt() {
    if (rootEl) return;
    rootEl = Utils.el('div', {
      class: 'lightbox',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'عرض صور العمل',
    });

    closeBtn = Utils.el('button', { class: 'lightbox-close btn-icon', type: 'button', 'aria-label': 'إغلاق' }, iconClose());
    titleEl = Utils.el('div', { class: 'lightbox-title' });
    metaEl = Utils.el('div', { class: 'lightbox-meta' });
    const header = Utils.el('div', { class: 'lightbox-header' }, [
      Utils.el('div', {}, [titleEl, metaEl]),
      closeBtn,
    ]);

    stageImg = Utils.el('img', { alt: '', decoding: 'async' });
    prevBtn = Utils.el('button', { class: 'lightbox-nav prev', type: 'button', 'aria-label': 'الصورة السابقة' }, iconChevron('right'));
    nextBtn = Utils.el('button', { class: 'lightbox-nav next', type: 'button', 'aria-label': 'الصورة التالية' }, iconChevron('left'));
    const stage = Utils.el('div', { class: 'lightbox-stage' }, [prevBtn, stageImg, nextBtn]);

    counterEl = Utils.el('div', { class: 'lightbox-counter' });
    whatsappBtn = Utils.el('a', { class: 'btn btn-whatsapp btn-sm', target: '_blank', rel: 'noopener' }, [
      iconWhatsApp(),
      'استفسار عبر واتساب',
    ]);
    const footer = Utils.el('div', { class: 'lightbox-footer' }, [counterEl, whatsappBtn]);

    dotsEl = Utils.el('div', { class: 'lightbox-dots', role: 'tablist', 'aria-label': 'صور العمل' });
    thumbsEl = Utils.el('div', { class: 'lightbox-thumbs' });

    rootEl.append(header, stage, dotsEl, footer, thumbsEl);
    document.body.appendChild(rootEl);

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', showPrev);
    nextBtn.addEventListener('click', showNext);
    rootEl.addEventListener('click', (event) => {
      if (event.target === rootEl) close();
    });
    stageImg.addEventListener('click', toggleZoom);

    document.addEventListener('keydown', handleKeydown);

    stage.addEventListener('touchstart', handleTouchStart, { passive: true });
    stage.addEventListener('touchmove', handleTouchMove, { passive: true });
    stage.addEventListener('touchend', handleTouchEnd);
  }

  function iconClose() {
    return svgIcon('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
  }
  function iconChevron(direction) {
    const d = direction === 'right' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
    return svgIcon(`<path d="${d}" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  function iconWhatsApp() {
    return svgIcon('<path fill="currentColor" d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.4-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.4 3.8 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3z"/>');
  }
  function svgIcon(inner) {
    const span = Utils.el('span', { class: 'icon', 'aria-hidden': 'true' });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">${inner}</svg>`;
    return span.firstChild;
  }

  function preload(url) {
    if (!url) return;
    const img = new Image();
    img.src = url;
  }

  function render() {
    if (!work) return;
    const image = work.images[currentIndex];

    // Cross-fade instead of an abrupt swap — feels like a polished
    // screenshot-style viewer rather than a plain image tag changing src.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      stageImg.src = image.url;
    } else {
      stageImg.style.opacity = '0';
      const swap = () => {
        stageImg.src = image.url;
        stageImg.onload = () => { stageImg.style.opacity = '1'; };
      };
      setTimeout(swap, 120);
    }
    stageImg.alt = `${work.title} — صورة ${currentIndex + 1}`;
    isZoomed = false;
    stageImg.style.transform = '';
    stageImg.style.cursor = 'zoom-in';

    titleEl.textContent = work.title;
    metaEl.textContent = work.category;
    counterEl.textContent = `${currentIndex + 1} / ${work.images.length}`;

    const message = `السلام عليكم، أرغب في الاستفسار عن العمل: ${work.title} من ${SITE_CONFIG.businessName}.`;
    whatsappBtn.href = Utils.buildWhatsAppLink(SITE_CONFIG.whatsapp, message);

    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= work.images.length - 1;

    renderDots();
    renderThumbs();

    // Only warm the immediate neighbors — never the whole set.
    preload(work.images[currentIndex - 1] && work.images[currentIndex - 1].url);
    preload(work.images[currentIndex + 1] && work.images[currentIndex + 1].url);
  }

  function renderDots() {
    dotsEl.innerHTML = '';
    if (work.images.length <= 1) return; // a single image needs no dots
    work.images.forEach((_, index) => {
      const dot = Utils.el('button', {
        class: `lightbox-dot${index === currentIndex ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-label': `صورة ${index + 1}`,
        'aria-selected': index === currentIndex ? 'true' : 'false',
        onClick: () => {
          currentIndex = index;
          render();
        },
      });
      dotsEl.appendChild(dot);
    });
  }

  function renderThumbs() {
    thumbsEl.innerHTML = '';
    work.images.forEach((image, index) => {
      const thumb = Utils.el('img', {
        src: image.thumbUrl || image.url, // small ImgBB thumbnail, not the full photo
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        class: index === currentIndex ? 'is-active' : '',
        onClick: () => {
          currentIndex = index;
          render();
        },
      });
      thumbsEl.appendChild(thumb);
    });
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
    stageImg.style.transform = isZoomed ? 'scale(1.9)' : '';
    stageImg.style.cursor = isZoomed ? 'zoom-out' : 'zoom-in';
  }

  function showPrev() {
    if (currentIndex <= 0) return;
    currentIndex -= 1;
    render();
  }
  function showNext() {
    if (currentIndex >= work.images.length - 1) return;
    currentIndex += 1;
    render();
  }

  function handleKeydown(event) {
    if (!rootEl || !rootEl.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    // RTL: ArrowLeft moves forward, ArrowRight moves backward (see carousel.js).
    else if (event.key === 'ArrowLeft') showNext();
    else if (event.key === 'ArrowRight') showPrev();
  }

  function handleTouchStart(event) {
    touchStartX = event.touches[0].clientX;
    touchDeltaX = 0;
  }
  function handleTouchMove(event) {
    touchDeltaX = event.touches[0].clientX - touchStartX;
  }
  function handleTouchEnd() {
    const threshold = 50;
    if (Math.abs(touchDeltaX) > threshold) {
      if (touchDeltaX < 0) showNext();
      else showPrev();
    }
    touchDeltaX = 0;
  }

  /** Open the lightbox for a given work. `startIndex` optionally focuses one image. */
  function open(workData, startIndex = 0) {
    ensureBuilt();
    work = workData;
    currentIndex = Utils.clamp(startIndex, 0, workData.images.length - 1);
    lastFocusedEl = document.activeElement;
    render();
    rootEl.classList.add('is-open');
    document.body.classList.add('lightbox-open');
    closeBtn.focus();
  }

  function close() {
    if (!rootEl) return;
    rootEl.classList.remove('is-open');
    document.body.classList.remove('lightbox-open');
    stageImg.src = '';
    work = null;
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  }

  return { open, close };
})();
