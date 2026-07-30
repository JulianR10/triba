import { logger } from "./logger";

const RESEND_API = "https://api.resend.com";
const SITE_URL = "https://triba.vercel.app";

function apiKey() {
  return import.meta.env.RESEND_API_KEY || "";
}

function fromAddress() {
  const raw = import.meta.env.RESEND_FROM || "Triba <onboarding@resend.dev>";
  return raw.replace(/^"(.*)"$/, "$1");
}

function welcomeHtml(showCta: boolean) {
  return `<!DOCTYPE html>
<html lang="es">
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
              <td align="center" style="padding:40px 40px 20px;">
                <img src="https://comunidadtriba.com/logo-triba.svg" alt="Triba" width="120" style="display:block;margin-bottom:24px;" />
                <h1 style="font-family:Times New Roman,Georgia,serif;font-size:28px;color:#35220A;margin:0 0 8px;font-style:italic;">
                  ¡Bienvenida a Triba!
                </h1>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#35220A;line-height:1.6;margin:0 0 20px;">
                  Gracias por sumarte a nuestra comunidad. Somos una revista digital escrita por y para mujeres, sobre cultura, arte e identidad.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;margin-bottom:12px;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> Cada mes recibirás 2 artículos periodísticos + 1 artículo de nuestra revista
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;margin-bottom:12px;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> Contenido exclusivo sobre cultura, arte e identidad
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> Hecho por mujeres para mujeres
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${showCta ? `
            <tr>
              <td align="center" style="padding:36px 40px 20px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background-color:#E91A39;border-radius:50px;border:2px solid #35220A;">
                      <a href="https://comunidadtriba.com/suscribirme" target="_blank" style="display:inline-block;padding:14px 40px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;text-decoration:none;letter-spacing:1px;color:#ffffff;">
                        Suscribite a Triba
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:12px;color:#35220A;line-height:1.5;margin:16px 0 0;">
                  Accedé a la revista completa, el archivo histórico y la descarga PDF.
                </p>
              </td>
            </tr>` : ""}
            <tr>
              <td align="center" style="padding:20px 40px 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:11px;color:#35220A;line-height:1.5;margin:0;">
                  Si tenés preguntas, respondé este email o escribinos a <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>
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

export async function sendWelcomeEmail(
  to: string,
  showCta: boolean,
): Promise<void> {
  const key = apiKey();
  if (!key) {
    logger.warn({ to }, "Resend not configured — skipping welcome email");
    return;
  }

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: "¡Bienvenida a Triba!",
      html: welcomeHtml(showCta),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body, to }, "Resend send error");
    throw new Error(`Resend error: ${res.status}`);
  }
}

function newEditionHtml(edition: { title: string; edition_number: number; cover_url: string; description: string; id: number }) {
  return `<!DOCTYPE html>
<html lang="es">
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
              <td align="center" style="padding:40px 40px 20px;">
                <img src="https://comunidadtriba.com/logo-triba.svg" alt="Triba" width="120" style="display:block;margin-bottom:24px;" />
                <h1 style="font-family:Times New Roman,Georgia,serif;font-size:28px;color:#35220A;margin:0 0 4px;font-style:italic;">
                  ¡Nueva edición!
                </h1>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#35220A;margin:0;">
                  Edición #${edition.edition_number}: ${edition.title}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 40px 20px;">
                <img src="${edition.cover_url}" alt="${edition.title}" width="280" style="display:block;border-radius:8px;border:2px solid #35220A;max-width:100%;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#35220A;line-height:1.6;margin:0 0 24px;">
                  ${edition.description}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 40px 36px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background-color:#E91A39;border-radius:50px;border:2px solid #35220A;">
                      <a href="${SITE_URL}/revista/${edition.id}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;text-decoration:none;letter-spacing:1px;color:#ffffff;">
                        Leer la revista
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 40px 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:11px;color:#35220A;line-height:1.5;margin:0;">
                  Si tenés preguntas, respondé este email o escribinos a <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>
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

export async function sendNewEditionEmail(
  to: string,
  edition: { title: string; edition_number: number; cover_url: string; description: string; id: number },
): Promise<void> {
  const key = apiKey();
  if (!key) {
    logger.warn({ to, edition }, "Resend not configured — skipping new edition email");
    return;
  }

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: `¡Nueva edición de Triba! #${edition.edition_number}`,
      html: newEditionHtml(edition),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body, to, edition }, "Resend new edition error");
    throw new Error(`Resend error: ${res.status}`);
  }
}
