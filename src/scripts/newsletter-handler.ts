const BASE_CLASSES = "font-sans text-sm text-triba-red whitespace-nowrap";

export function setupNewsletterForm(formEl: HTMLFormElement, msgEl: HTMLElement) {
  msgEl.setAttribute("aria-live", "polite");

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = formEl.querySelector<HTMLInputElement>("[name=email]");
    const btn = formEl.querySelector<HTMLButtonElement>("[type=submit]");
    if (!input) return;
    if (btn) {
      btn.disabled = true;
    }

    const setMsg = (text: string, cls = BASE_CLASSES) => {
      msgEl.classList.remove("hidden");
      msgEl.textContent = text;
      msgEl.className = cls;
    };

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: input.value }),
      });
      const data = await res.json();

      if (data.ok) {
        setMsg("¡Gracias por suscribirte!");
        input.value = "";
      } else if (data.existing) {
        setMsg(
          data.resynced
            ? "Ya estás suscripta — te reenviamos la bienvenida"
            : "Ya estás suscripta",
        );
      } else {
        setMsg("Error al suscribirte. Intentalo de nuevo.");
      }
    } catch {
      setMsg("Error de conexión. Intentalo de nuevo.");
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  });
}
