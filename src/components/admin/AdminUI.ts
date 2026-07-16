export function showToast(message: string, type: "success" | "error" | "info" = "success") {
  const container = document.getElementById("admin-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `admin-toast admin-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("admin-toast-visible");
  });

  setTimeout(() => {
    toast.classList.remove("admin-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("admin-confirm-overlay");
    const titleEl = document.getElementById("admin-confirm-title");
    const messageEl = document.getElementById("admin-confirm-message");
    const confirmBtn = document.getElementById("admin-confirm-accept");
    const cancelBtn = document.getElementById("admin-confirm-cancel");

    if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(window.confirm(`${title}\n${message}`));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.remove("hidden");

    const cleanup = (result: boolean) => {
      overlay.classList.add("hidden");
      resolve(result);
    };

    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}
