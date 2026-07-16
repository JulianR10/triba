(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var cards = document.getElementById("scroll-cards");
  if (!cards) return;

  var covers = [];
  for (var i = 1; i <= 3; i++) {
    var el = document.getElementById("cover-" + i);
    if (el) covers.push(el);
  }

  if (covers.length === 0) return;

  var ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        var rect = cards.getBoundingClientRect();
        var windowH = window.innerHeight;
        var cardCenter = rect.top + rect.height / 2;
        var viewCenter = windowH / 2;
        var dist = Math.abs(cardCenter - viewCenter) / (windowH / 2 + rect.height / 2);
        dist = Math.min(1, dist);

        var s = 1 + (1 - dist) * 0.05;

        for (var j = 0; j < covers.length; j++) {
          covers[j].style.transform = "scale(" + s + ")";
        }

        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
