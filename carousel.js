// carousel.js — надежная карусель на базе scroll-snap
document.addEventListener('DOMContentLoaded', () => {
    const carousels = Array.from(document.querySelectorAll('.carousel'));
    carousels.forEach(initCarousel);
  });
  
  function initCarousel(carousel) {
    const trackWrap = carousel.querySelector('.carousel-track-wrap');
    const track = carousel.querySelector('.carousel-track');
    const slides = Array.from(track.querySelectorAll('.carousel-slide'));
    const prevBtn = carousel.querySelector('.carousel .prev') || carousel.querySelector('.prev');
    const nextBtn = carousel.querySelector('.carousel .next') || carousel.querySelector('.next');
    const dotsWrap = carousel.querySelector('.carousel-dots');
  
    if (!trackWrap || !track || slides.length === 0) return;
  
    const autoplayAttr = carousel.dataset.autoplay;
    const AUTOPLAY = autoplayAttr === undefined || autoplayAttr !== 'false';
    const AUTOPLAY_DELAY = parseInt(carousel.dataset.autoplayDelay || 4500, 10);
  
    let dots = [];
    let autoplayTimer = null;
  
    // Создание точек
    function createDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = slides.map((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'dot';
        btn.type = 'button';
        btn.setAttribute('aria-label', `Перейти к слайду ${i+1}`);
        btn.dataset.index = i;
        btn.addEventListener('click', () => {
          scrollToIndex(i);
          restartAutoplay();
        });
        dotsWrap.appendChild(btn);
        return btn;
      });
    }
  
    // Прокрутка к индексу (по ширине видимой области)
    function scrollToIndex(index) {
      if (index < 0) index = 0;
      if (index >= slides.length) index = slides.length - 1;
      const wrapWidth = trackWrap.clientWidth;
      const targetLeft = index * wrapWidth;
      trackWrap.scrollTo({ left: targetLeft, behavior: 'smooth' });
      // визуально активируем dot в момент окончания скролла через IntersectionObserver
    }
  
    // Обновление активной точки
    function setActiveDot(index) {
      if (!dots || !dots.length) return;
      dots.forEach(d => d.classList.remove('active'));
      if (dots[index]) dots[index].classList.add('active');
    }
  
    // Автоплей
    function startAutoplay() {
      if (!AUTOPLAY || slides.length <= 1) return;
      stopAutoplay();
      autoplayTimer = setInterval(() => {
        const current = getCurrentIndex();
        const next = (current + 1) % slides.length;
        scrollToIndex(next);
      }, AUTOPLAY_DELAY);
    }
    function stopAutoplay() { if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; } }
    function restartAutoplay() { stopAutoplay(); startAutoplay(); }
  
    // Получаем текущий индекс (примерно) по scrollLeft
    function getCurrentIndex() {
      const wrapWidth = trackWrap.clientWidth || 1;
      const idx = Math.round(trackWrap.scrollLeft / wrapWidth);
      return Math.min(Math.max(idx, 0), slides.length - 1);
    }
  
    // IntersectionObserver следит за слайдами, чтобы точно знать, какой в центре
    let io = null;
    function setupIntersectionObserver() {
      if ('IntersectionObserver' in window) {
        const options = { root: trackWrap, threshold: 0.55 }; // если 55% видимости — активный
        io = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const idx = slides.indexOf(entry.target);
              if (idx >= 0) setActiveDot(idx);
            }
          });
        }, options);
        slides.forEach(s => io.observe(s));
      } else {
        // fallback: при scroll обновляем dot
        trackWrap.addEventListener('scroll', throttle(() => setActiveDot(getCurrentIndex()), 120));
      }
    }
  
    // ResizeObserver: при изменении ширины пересчитать позиции (scroll-snap работает автоматически)
    function setupResizeObserver() {
      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => {
          // при ресайзе — корректируем скролл на текущий индекс, чтобы выровнять слайды
          const idx = getCurrentIndex();
          // без анимации (instant) — сначала напрямую, потом плавно будет включено пользователем
          const wrapWidth = trackWrap.clientWidth || 0;
          trackWrap.scrollLeft = idx * wrapWidth;
        });
        ro.observe(trackWrap);
        ro.observe(document.body);
      } else {
        window.addEventListener('resize', throttle(() => {
          const idx = getCurrentIndex();
          const wrapWidth = trackWrap.clientWidth || 0;
          trackWrap.scrollLeft = idx * wrapWidth;
        }, 120));
      }
    }
  
    // Prev/Next
    if (prevBtn) prevBtn.addEventListener('click', () => { scrollToIndex(getCurrentIndex() - 1); restartAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { scrollToIndex(getCurrentIndex() + 1); restartAutoplay(); });
  
    // Pause on hover/focus
    trackWrap.addEventListener('mouseenter', stopAutoplay);
    trackWrap.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', startAutoplay);
  
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { scrollToIndex(getCurrentIndex() + 1); restartAutoplay(); }
      if (e.key === 'ArrowLeft') { scrollToIndex(getCurrentIndex() - 1); restartAutoplay(); }
    });
  
    // Touch: native scroll-snap handles UX; additionally we ensure autoplay pauses when touching
    trackWrap.addEventListener('touchstart', stopAutoplay, { passive: true });
    trackWrap.addEventListener('touchend', () => { restartAutoplay(); }, { passive: true });
  
    // Инициализация: дождёмся загрузки картинок в слайдах
    Promise.all(Array.from(track.querySelectorAll('img')).map(img => {
      return new Promise(res => {
        if (img.complete) return res();
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      });
    })).then(() => {
      // выставим ширину слайдов через CSS (flex:0 0 100% уже задан)
      createDots();
      setupIntersectionObserver();
      setupResizeObserver();
      // прокрутка к текущему индексу (если страница загружена с дефолтным скроллом)
      setTimeout(() => {
        const idx = getCurrentIndex();
        scrollToIndex(idx);
        startAutoplay();
      }, 50);
    });
  
    // Вспомогательные: throttle
    function throttle(fn, wait=100){
      let last = 0;
      return function(...args){
        const now = Date.now();
        if (now - last >= wait){ last = now; fn.apply(this, args); }
      };
    }
  }
  