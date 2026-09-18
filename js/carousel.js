/**
 * carousel.js
 * Visible-Edge Card Carousel.
 *
 * Built on native CSS scroll-snap rather than a custom drag/physics engine:
 * the browser already provides correct touch momentum, RTL-safe scrolling,
 * and pointer/trackpad support for free. This module only tracks which
 * card is centered (to toggle active styles + dots) and exposes
 * prev/next/keyboard controls that scroll to a target card.
 *
 * Usage:
 *   const carousel = Carousel.create({
 *     root: document.querySelector('#featured-carousel'),
 *   });
 *   carousel.setCount(5);
 *   carousel.on('activate', (index) => { ... });
 */
'use strict';

const Carousel = (() => {
  function create({ root }) {
    const viewport = Utils.qs('.carousel-viewport', root);
    const prevBtn = Utils.qs('.carousel-arrow.prev', root);
    const nextBtn = Utils.qs('.carousel-arrow.next', root);
    const dotsEl = Utils.qs('.carousel-dots', root);

    let activeIndex = 0;
    let cardCount = 0;
    let listeners = { activate: [] };
    let isPointerDown = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    function getCards() {
      return Utils.qsa('.carousel-card', viewport);
    }

    function emit(event, payload) {
      (listeners[event] || []).forEach((fn) => fn(payload));
    }

    function on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    }

    /** Find whichever card's center is closest to the viewport's center. */
    function detectActiveIndex() {
      const cards = getCards();
      if (!cards.length) return 0;
      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenter = viewportRect.left + viewportRect.width / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      return closestIndex;
    }

    function updateActiveStyles(index) {
      getCards().forEach((card, i) => {
        card.classList.toggle('is-active', i === index);
        card.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      if (dotsEl) {
        Utils.qsa('.carousel-dot', dotsEl).forEach((dot, i) => {
          dot.classList.toggle('is-active', i === index);
        });
      }
      if (prevBtn) prevBtn.disabled = index <= 0;
      if (nextBtn) nextBtn.disabled = index >= cardCount - 1;
    }

    function handleScroll() {
      const index = detectActiveIndex();
      if (index !== activeIndex) {
        activeIndex = index;
        updateActiveStyles(activeIndex);
        emit('activate', activeIndex);
      } else {
        updateActiveStyles(activeIndex);
      }
    }
    const throttledScroll = Utils.throttle(handleScroll, 120);

    function scrollToIndex(index, behavior = 'smooth') {
      const cards = getCards();
      const target = cards[Utils.clamp(index, 0, cards.length - 1)];
      if (!target) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : behavior,
        inline: 'center',
        block: 'nearest',
      });
    }

    function next() {
      scrollToIndex(activeIndex + 1);
    }
    function prev() {
      scrollToIndex(activeIndex - 1);
    }

    function buildDots() {
      if (!dotsEl) return;
      dotsEl.innerHTML = '';
      for (let i = 0; i < cardCount; i += 1) {
        const dot = Utils.el('button', {
          class: 'carousel-dot',
          type: 'button',
          'aria-label': `الانتقال إلى العمل رقم ${i + 1}`,
          onClick: () => scrollToIndex(i),
        });
        dotsEl.appendChild(dot);
      }
    }

    /** Call after the caller has rendered `.carousel-card` children into the viewport. */
    function refresh() {
      cardCount = getCards().length;
      buildDots();
      activeIndex = 0;
      updateActiveStyles(0);
      // Let layout settle before measuring/centering the first card.
      requestAnimationFrame(() => scrollToIndex(0, 'auto'));
    }

    // Keyboard support. In this RTL layout, ArrowLeft moves toward later
    // (visually leftward) cards; ArrowRight moves toward earlier ones.
    viewport.setAttribute('tabindex', '0');
    viewport.setAttribute('role', 'listbox');
    viewport.setAttribute('aria-label', 'أعمال مميزة');
    viewport.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        prev();
      }
    });

    viewport.addEventListener('scroll', throttledScroll, { passive: true });

    // Pointer drag-to-scroll for desktop mice/trackpads (touch already
    // works natively via scroll-snap + overflow-x, so it's skipped here).
    //
    // Deliberately NOT using setPointerCapture: capturing the pointer on
    // `viewport` can interfere with the browser's own click dispatch on
    // the card underneath, which was silently breaking "click a work to
    // open its photos" on desktop. Tracking movement via listeners on
    // `document` (added only while a drag is in progress) gives the same
    // "keep tracking even if the cursor leaves the viewport" behavior
    // without touching click delivery at all — a plain click (no
    // movement) reaches the card's onClick exactly as any other click
    // would, and a real drag naturally does not fire a click, per how
    // browsers dispatch click events (mouseup must land without
    // meaningful movement from mousedown).
    function handlePointerMove(event) {
      if (!isPointerDown) return;
      const delta = event.clientX - dragStartX;
      viewport.scrollLeft = dragStartScroll - delta;
    }
    function endDrag() {
      if (!isPointerDown) return;
      isPointerDown = false;
      viewport.classList.remove('is-dragging');
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
      scrollToIndex(detectActiveIndex());
    }
    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return; // native touch scrolling handles this
      isPointerDown = true;
      dragStartX = event.clientX;
      dragStartScroll = viewport.scrollLeft;
      viewport.classList.add('is-dragging');
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', endDrag);
    });

    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);

    window.addEventListener(
      'resize',
      Utils.debounce(() => scrollToIndex(activeIndex, 'auto'), 200)
    );

    return {
      refresh,
      next,
      prev,
      on,
      getActiveIndex: () => activeIndex,
    };
  }

  return { create };
})();
