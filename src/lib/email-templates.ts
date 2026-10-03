// Plantillas de email puras (sin `import.meta.env`), para poder reutilizarlas
// desde scripts de prueba sin duplicar HTML. El envío real vive en `email.ts`.

export interface MailClubWelcomeData {
  recipientName: string;
  addressLines: string[];
  shipmentMonth: string;
  founderNumber: number | null;
}

/* Hallmark · scope: email (component, no log rotation) · genre: editorial · theme: triba-brand (locked tokens)
 * welcome = left-aligned letter + parcel-label address box · dispatch = centered stamp composition
 * copy/subjects/data unchanged · table layout + inline styles (email clients) */
export function mailClubWelcomeHtml(
  data: MailClubWelcomeData,
  locale: "es" | "en" = "es",
  siteUrl = "https://www.universotriba.com",
) {
  const en = locale === "en";
  const htmlLang = en ? "en" : "es";
  const address = data.addressLines.map((l) => `<br />${l}`).join("");
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background-color:#FFF8EE;font-family:Montserrat,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;border:2px solid #35220A;overflow:hidden;">
            <tr>
              <td align="left" style="padding:0 40px;background-color:#FFCCE4;border-bottom:2px solid #35220A;">
                <img src="${siteUrl}/logo-triba.svg" alt="Triba" width="110" style="display:block;padding:24px 0;" />
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:32px 40px 0;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#E91A39;margin:0 0 12px;">
                  TRIBA MAIL CLUB
                </p>
                <h1 style="font-family:Times New Roman,Georgia,serif;font-size:32px;line-height:1.2;color:#35220A;margin:0 0 12px;font-style:italic;">
                  ${en ? "Welcome to the Triba Mail Club! ✉️" : "¡Bienvenida al Mail Club de Triba! ✉️"}
                </h1>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#35220A;line-height:1.6;margin:0 0 24px;">
                  ${en
                    ? `Hi, ${data.recipientName}! You're part of the Triba Mail Club. Your envelope will go out with the <strong>${data.shipmentMonth}</strong> dispatch and we'll let you know when it's on its way.`
                    : `¡Hola, ${data.recipientName}! Ya sos parte del Mail Club de Triba. Tu sobre va a salir en el envío de <strong>${data.shipmentMonth}</strong> y te vamos a avisar cuando esté en camino.`}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:2px dashed #35220A;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;color:#35220A;margin:0 0 6px;">
                        <strong>${en ? "We'll send it to this address:" : "Lo vamos a mandar a esta dirección:"}</strong>
                      </p>
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#35220A;line-height:1.6;margin:0;">${address}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${data.founderNumber ? `
            <tr>
              <td align="left" style="padding:24px 40px 0;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:16px;font-weight:700;color:#E91A39;margin:0;">
                  ${en
                    ? `✦ You are founding member #${data.founderNumber}.`
                    : `✦ Sos la socia fundadora #${data.founderNumber}.`}
                </p>
              </td>
            </tr>` : ""}
            <tr>
              <td align="left" style="padding:24px 40px 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:11px;color:#35220A;line-height:1.5;margin:0;">
                  ${en
                    ? `If something looks wrong, you can correct it from your profile before the 15th.`
                    : `Si ves algo mal, podés corregirla desde tu perfil antes del 15.`}
                </p>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#35220A;line-height:1.6;margin:16px 0 0;">
                  ${en
                    ? `Thanks for joining our universe. Team Triba`
                    : `Gracias por sumarte a nuestro universo. Equipo Triba`}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
