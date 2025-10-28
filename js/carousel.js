/**
 * carousel.js
 * Универсальная карусель на базе CSS Scroll-Snap + управляемая прокрутка.
 * Особенности:
 * - Ожидание загрузки изображений перед инициализацией
 * - Центровка слайдов и корректный расчёт при ресайзе (ResizeObserver/fallback)
 * - IntersectionObserver для точного определения активного слайда
 * - Prev/Next с циклической (loop) навигацией (после последнего — первый и т.д.)
 * - Кнопки, точки (dots), клавиши стрелок, пауза при hover/focus, автоплей (опционально)
 * - Работает с любым количеством слайдов
 *
 * Поддерживаемые data-атрибуты на контейнере .carousel:
 * - data-autoplay="true" | "false" (по умолчанию включён)
 * - data-autoplay-delay="ms" (по умолчанию 4500)
 *
 * Требования к HTML: одна .carousel-track-wrap → один .carousel-track → N .carousel-slide
 */

(function () {
  'use strict';

  // Wait for DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const nodes = Array.from(document.querySelectorAll('.carousel'));
    nodes.forEach(initCarousel);
  });

  function initCarousel(carousel) {
    if (!carousel) return;

    const trackWrap = carousel.querySelector('.carousel-track-wrap');
    const track = carousel.querySelector('.carousel-track');
    if (!trackWrap || !track) return;

    const slides = Array.from(track.querySelectorAll('.carousel-slide'));
    if (!slides.length) return;

    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const dotsWrap = carousel.querySelector('.carousel-dots');

    // Options from data-attributes
    const autoplayAttr = carousel.dataset.autoplay;
    const AUTOPLAY = autoplayAttr === undefined || autoplayAttr !== 'false';
    const AUTOPLAY_DELAY = parseInt(carousel.dataset.autoplayDelay || 4500, 10);

    let currentIndex = 0;
    let dots = [];
    let autoplayTimer = null;
    let io = null; // IntersectionObserver
    let resizeObserver = null;

    // Wait for all images in this carousel to load (or error) before init
    const imgs = Array.from(track.querySelectorAll('img'));
    const imgPromises = imgs.map(img => {
      return new Promise((res) => {
        if (img.complete) return res();
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      });
    });

    Promise.all(imgPromises).then(() => {
      buildDots();
      setupIntersectionObserver();
      setupResizeHandling();
      attachControls();
      startAutoplayIfNeeded();
      // Align to first slide (in case of initial scroll)
      setTimeout(() => scrollToIndex(currentIndex, { behavior: 'auto' }), 40);
    });

    /* ---------- functions ---------- */

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = slides.map((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'dot';
        btn.type = 'button';
        btn.setAttribute('aria-label', `Перейти к слайду ${i + 1}`);
        btn.dataset.index = i;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          goTo(i);
        });
        dotsWrap.appendChild(btn);
        return btn;
      });
      updateDots();
    }

    function updateDots() {
      if (!dots.length) return;
      dots.forEach(d => d.classList.remove('active'));
      const idx = clampIndex(currentIndex);
      if (dots[idx]) dots[idx].classList.add('active');
    }

    function clampIndex(idx) {
      const n = slides.length;
      if (n === 0) return 0;
      return ((idx % n) + n) % n;
    }

    // core navigation: scroll to index (centers slide in view)
    function scrollToIndex(index, opts = { behavior: 'smooth' }) {
      index = clampIndex(index);
      const wrapWidth = trackWrap.clientWidth || trackWrap.getBoundingClientRect().width || 0;
      const left = index * wrapWidth;
      try {
        trackWrap.scrollTo({ left, behavior: opts.behavior });
      } catch (err) {
        // fallback
        trackWrap.scrollLeft = left;
      }
      // set currentIndex immediately for faster UI feedback
      currentIndex = index;
      updateDots();
    }

    // Go to slide index (with wrapping)
    function goTo(index) {
      const newIndex = clampIndex(index);
      scrollToIndex(newIndex, { behavior: 'smooth' });
    }

    function next() {
      goTo(currentIndex + 1);
    }
    function prev() {
      goTo(currentIndex - 1);
    }

    // Attach prev/next, keyboard, touch pause, hover pause
    function attachControls() {
      if (nextBtn) nextBtn.addEventListener('click', () => { next(); restartAutoplay(); });
      if (prevBtn) prevBtn.addEventListener('click', () => { prev(); restartAutoplay(); });

      // Keyboard navigation (Left/Right)
      document.addEventListener('keydown', (e) => {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowRight') { next(); restartAutoplay(); }
        if (e.key === 'ArrowLeft') { prev(); restartAutoplay(); }
      });

      // Pause on hover / focus
      carousel.addEventListener('mouseenter', stopAutoplay);
      carousel.addEventListener('mouseleave', startAutoplayIfNeeded);
      carousel.addEventListener('focusin', stopAutoplay);
      carousel.addEventListener('focusout', startAutoplayIfNeeded);

      // Touch: pause autoplay while touching
      trackWrap.addEventListener('touchstart', stopAutoplay, { passive: true });
      trackWrap.addEventListener('touchend', () => { startAutoplayIfNeeded(); }, { passive: true });

      // Optional: click on slide -> no-op or could open lightbox
    }

    // IntersectionObserver to detect which slide is mostly visible
    function setupIntersectionObserver() {
      if (!('IntersectionObserver' in window)) {
        // fallback: listen to scroll and set currentIndex by calculation
        trackWrap.addEventListener('scroll', throttle(() => {
          const idx = getIndexFromScroll();
          if (idx !== currentIndex) {
            currentIndex = idx;
            updateDots();
          }
        }, 120));
        return;
      }

      // Root is trackWrap, threshold near 0.55 means at least 55% visible
      io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = slides.indexOf(entry.target);
            if (idx >= 0) {
              currentIndex = idx;
              updateDots();
            }
          }
        });
      }, { root: trackWrap, threshold: 0.55 });

      slides.forEach(s => io.observe(s));
    }

    // Resize handling: ensure after resize the scrollLeft matches index * width
    function setupResizeHandling() {
      const doRealign = throttle(() => {
        // reposition to maintain the same slide in view
        const idx = clampIndex(currentIndex);
        const wrapWidth = trackWrap.clientWidth || trackWrap.getBoundingClientRect().width || 0;
        trackWrap.scrollLeft = idx * wrapWidth;
      }, 120);

      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(doRealign);
        resizeObserver.observe(trackWrap);
        // Also observe each slide because images may change dimensions
        slides.forEach(s => resizeObserver.observe(s));
      } else {
        window.addEventListener('resize', doRealign);
      }
    }

    // Helpers: get index from current scrollLeft (rounded)
    function getIndexFromScroll() {
      const wrapWidth = trackWrap.clientWidth || 1;
      const idx = Math.round(trackWrap.scrollLeft / wrapWidth);
      return clampIndex(idx);
    }

    /* ---------- Autoplay ---------- */
    function startAutoplayIfNeeded() {
      if (!AUTOPLAY || slides.length <= 1) return;
      stopAutoplay();
      autoplayTimer = setInterval(() => {
        next();
      }, AUTOPLAY_DELAY);
    }
    function stopAutoplay() {
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    }
    function restartAutoplay() {
      stopAutoplay();
      startAutoplayIfNeeded();
    }

    /* ---------- Utility functions ---------- */
    function throttle(fn, wait = 100) {
      let last = 0;
      return function (...args) {
        const now = Date.now();
        if (now - last >= wait) {
          last = now;
          fn.apply(this, args);
        }
      };
    }

    // Expose small API on carousel element (optional, helpful for debugging)
    carousel.carouselAPI = {
      next,
      prev,
      goTo: (i) => goTo(i),
      startAutoplay: startAutoplayIfNeeded,
      stopAutoplay,
      getCurrentIndex: () => currentIndex
    };
  }
})();
