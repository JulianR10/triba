(function () {
  var gallery = document.querySelector(".parallax-gallery");
  if (!gallery) return;

  var ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        var rect = gallery.getBoundingClientRect();
        var windowH = window.innerHeight;
        var sectionH = rect.height;
        var offset = rect.top;

        var progress = 1 - (offset + sectionH) / (windowH + sectionH);
        progress = Math.max(0, Math.min(1, progress));

        gallery.style.transform = "translateY(" + (progress * 120) + "px)";

        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
