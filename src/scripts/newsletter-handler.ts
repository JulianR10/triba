const BASE_CLASSES = "font-sans text-sm text-triba-red whitespace-nowrap";

export function setupNewsletterForm(formEl: HTMLFormElement, msgEl: HTMLElement) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = formEl.querySelector<HTMLInputElement>("[name=email]");
    if (!input) return;

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: input.value }),
      });
      const data = await res.json();

      msgEl.classList.remove("hidden");

      if (data.ok) {
        msgEl.textContent = "¡Gracias por suscribirte!";
        msgEl.className = BASE_CLASSES;
        input.value = "";
      } else if (data.existing) {
        msgEl.textContent = "Ya estás suscripta";
        msgEl.className = BASE_CLASSES;
      } else {
        msgEl.textContent = "Error al suscribirte. Intentalo de nuevo.";
        msgEl.className = BASE_CLASSES;
      }
    } catch {
      msgEl.classList.remove("hidden");
      msgEl.textContent = "Error de conexión. Intentalo de nuevo.";
      msgEl.className = BASE_CLASSES;
    }
  });
}
