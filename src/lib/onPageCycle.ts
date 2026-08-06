export function onPageCycle(fn: () => void): void {
  fn();
  document.addEventListener("astro:page-load", fn);
}
