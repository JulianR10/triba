const BASE_CLASSES = "font-sans text-sm text-triba-red whitespace-nowrap";

export interface NewsletterMessages {
  thanks: string;
  existingResynced: string;
  existing: string;
  error: string;
  networkError: string;
}

const DEFAULT_MESSAGES: NewsletterMessages = {
  thanks: "¡Gracias por suscribirte!",
  existingResynced: "Ya estás suscripta — te reenviamos la bienvenida",
  existing: "Ya estás suscripta",
  error: "Error al suscribirte. Intentalo de nuevo.",
  networkError: "Error de conexión. Intentalo de nuevo.",
};

export function setupNewsletterForm(
  formEl: HTMLFormElement,
  msgEl: HTMLElement,
  messages: NewsletterMessages = DEFAULT_MESSAGES,
) {
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
        setMsg(messages.thanks);
        input.value = "";
      } else if (data.existing) {
        setMsg(data.resynced ? messages.existingResynced : messages.existing);
      } else {
        setMsg(messages.error);
      }
    } catch {
      setMsg(messages.networkError);
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  });
}
