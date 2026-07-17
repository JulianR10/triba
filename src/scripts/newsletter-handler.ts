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

      if (data.ok) {
        msgEl.textContent = "¡Gracias por suscribirte!";
        msgEl.className = "font-sans text-sm text-triba-green text-center";
        input.value = "";
      } else if (data.existing) {
        msgEl.textContent = "Ya estás suscripta";
        msgEl.className = "font-sans text-sm text-triba-red text-center";
      } else {
        msgEl.textContent = "Error al suscribirte. Intentalo de nuevo.";
        msgEl.className = "font-sans text-sm text-triba-red text-center";
      }
    } catch {
      msgEl.textContent = "Error de conexión. Intentalo de nuevo.";
      msgEl.className = "font-sans text-sm text-triba-red text-center";
    }
  });
}
