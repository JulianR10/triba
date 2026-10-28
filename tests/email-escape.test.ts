import { describe, expect, it } from "vitest";
import { escapeHtmlText } from "../src/lib/html-escape";
import { mailClubWelcomeHtml } from "../src/lib/email-templates";
import { mailClubDispatchHtml } from "../src/lib/email";

describe("escapeHtmlText", () => {
  it("neutraliza etiquetas y comillas", () => {
    expect(escapeHtmlText(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(escapeHtmlText(null)).toBe("");
  });
});

describe("mails de marca: texto de la clienta escapado", () => {
  const evil = `<a href="https://evil.test">cobrá acá</a>`;

  it("la bienvenida del Mail Club no inyecta HTML en nombre ni dirección", () => {
    const html = mailClubWelcomeHtml(
      { recipientName: evil, addressLines: [evil, "Calle 1"], shipmentMonth: "noviembre 2026", founderNumber: 7 },
      "es",
    );
    expect(html).not.toContain(evil);
    expect(html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;");
  });

  it("el aviso de despacho no inyecta HTML en el nombre", () => {
    const html = mailClubDispatchHtml({ recipientName: evil, shipmentMonth: "noviembre 2026" }, "es");
    expect(html).not.toContain(evil);
  });
});
