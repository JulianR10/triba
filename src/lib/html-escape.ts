// Escape de texto para HTML de mails (servidor). `escape.ts` usa `document` y solo sirve en el navegador.
export function escapeHtmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
