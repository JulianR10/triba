(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function init() {
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      if (el._magnetic) return;
      el._magnetic = true;

      el.addEventListener("mouseenter", function () {
        el.style.transition = "transform 0s";
      });

      el.addEventListener("mousemove", function (e) {
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;

        var maxDist = Math.min(rect.width, rect.height) * 0.12;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var clamped = Math.min(dist, maxDist) / Math.max(dist, 1);

        el.style.transform =
          "translate("+(dx * clamped * 0.15).toFixed(1)+"px, "+(dy * clamped * 0.15).toFixed(1)+"px) scale(1.02)";
      });

      el.addEventListener("mouseleave", function () {
        el.style.transition = "";
        el.style.transform = "";
      });
    });
  }

  init();
  document.addEventListener("astro:page-load", init);
})();
