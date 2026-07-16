(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;

        if (el.hasAttribute("data-reveal-text") && !el._revealSplit) {
          el._revealSplit = true;
          var words = el.textContent.trim().split(/\s+/);
          if (words.length > 1) {
            el.innerHTML = words
              .map(function (w) {
                return '<span class="reveal-word" style="display:inline-block">' + w + '</span>';
              })
              .join(" ");
          }
        }

        el.classList.add("revealed");

        if (el.hasAttribute("data-reveal-once") || el.dataset.revealOnce !== undefined) {
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  function observeAll() {
    document.querySelectorAll("[data-reveal], [data-reveal-text], .reveal-stagger").forEach(function (el) {
      if (!el.classList.contains("revealed")) {
        observer.observe(el);
      }
    });
  }

  observeAll();

  // Re-run after View Transitions
  document.addEventListener("astro:page-load", observeAll);
})();
