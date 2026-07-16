(function () {
  var gallery = document.querySelector(".parallax-gallery");
  if (!gallery) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var cards = Array.from(gallery.children);
  var ticking = false;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        var rect = gallery.getBoundingClientRect();
        var windowH = window.innerHeight;
        var sectionH = rect.height;
        var offset = rect.top;

        var progress = 1 - (offset + sectionH) / (windowH + sectionH);
        progress = Math.max(0, Math.min(1, progress));
        progress = easeOutCubic(progress);

        // Move each card at different speeds based on position
        cards.forEach(function (card, i) {
          var speed = 0.6 + (i % 4) * 0.3;
          var y = progress * 80 * speed;
          card.style.transform = "translateY(" + y.toFixed(1) + "px)";
        });

        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // Support Lenis scroll
  if (window.lenis) {
    window.lenis.on("scroll", onScroll);
  }

  onScroll();
})();
