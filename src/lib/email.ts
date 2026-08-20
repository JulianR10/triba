import { logger } from "./logger";
import { sendEmail } from "./sender";
import { SITE_URL } from "./site-url";
import type { Locale } from "../i18n/ui";

function welcomeHtml(showCta: boolean, locale: Locale = "es") {
  const en = locale === "en";
  const htmlLang = en ? "en" : "es";
  const ctaLink = `${SITE_URL}${en ? "/en" : ""}/suscribirme`;
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
              <td align="center" style="padding:40px 40px 20px;">
                <img src="${SITE_URL}/logo-triba.svg" alt="Triba" width="120" style="display:block;margin-bottom:24px;" />
                <h1 style="font-family:Times New Roman,Georgia,serif;font-size:28px;color:#35220A;margin:0 0 8px;font-style:italic;">
                  ${en ? "Welcome to Triba!" : "¡Bienvenida a Triba!"}
                </h1>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#35220A;line-height:1.6;margin:0 0 20px;">
                  ${en
                    ? "Thanks for joining our community. We are a digital magazine written by and for women, about culture, art and identity."
                    : "Gracias por sumarte a nuestra comunidad. Somos una revista digital escrita por y para mujeres, sobre cultura, arte e identidad."}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;margin-bottom:12px;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> ${en
                          ? "Every month you'll get 2 journalistic articles + 1 article from our magazine"
                          : "Cada mes recibirás 2 artículos periodísticos + 1 artículo de nuestra revista"}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;margin-bottom:12px;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> ${en
                          ? "Exclusive content about culture, art and identity"
                          : "Contenido exclusivo sobre cultura, arte e identidad"}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;background-color:#FFF8EE;border-radius:8px;border:1px solid #35220A;">
                      <p style="font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#35220A;margin:0;">
                        <strong style="color:#E91A39;">✦</strong> ${en
                          ? "Made by women for women"
                          : "Hecho por mujeres para mujeres"}
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
                      <a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;text-decoration:none;letter-spacing:1px;color:#ffffff;">
                        ${en ? "Subscribe to Triba" : "Suscribite a Triba"}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:12px;color:#35220A;line-height:1.5;margin:16px 0 0;">
                  ${en
                    ? "Get access to the full magazine, the historical archive and PDF download."
                    : "Accedé a la revista completa, el archivo histórico y la descarga PDF."}
                </p>
              </td>
            </tr>` : ""}
            <tr>
              <td align="center" style="padding:20px 40px 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:11px;color:#35220A;line-height:1.5;margin:0;">
                  ${en
                    ? `If you have questions, reply to this email or write to us at <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>`
                    : `Si tenés preguntas, respondé este email o escribinos a <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>`}
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
  locale: Locale = "es",
): Promise<void> {
  try {
    await sendEmail(to, locale === "en" ? "Welcome to Triba!" : "¡Bienvenida a Triba!", welcomeHtml(showCta, locale));
  } catch (err) {
    logger.error({ err, to }, "Sender welcome email error");
    throw err;
  }
}

function newEditionHtml(edition: { title: string; edition_number: number | null; cover_url: string; description: string; id: number }, locale: Locale = "es") {
  const en = locale === "en";
  const htmlLang = en ? "en" : "es";
  const editionLabel = edition.edition_number
    ? `${en ? "Edition" : "Edición"} #${edition.edition_number}: ${edition.title}`
    : edition.title;
  const ctaLink = edition.edition_number
    ? `${SITE_URL}${en ? "/en" : ""}/revista/edicion-${edition.edition_number}`
    : `${SITE_URL}${en ? "/en" : ""}/revista`;
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
              <td align="center" style="padding:40px 40px 20px;">
                <img src="${SITE_URL}/logo-triba.svg" alt="Triba" width="120" style="display:block;margin-bottom:24px;" />
                <h1 style="font-family:Times New Roman,Georgia,serif;font-size:28px;color:#35220A;margin:0 0 4px;font-style:italic;">
                  ${en ? "New edition!" : "¡Nueva edición!"}
                </h1>
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:15px;color:#35220A;margin:0;">
                  ${editionLabel}
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
                      <a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;text-decoration:none;letter-spacing:1px;color:#ffffff;">
                        ${en ? "Read the magazine" : "Leer la revista"}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 40px 40px;">
                <p style="font-family:Montserrat,Arial,sans-serif;font-size:11px;color:#35220A;line-height:1.5;margin:0;">
                  ${en
                    ? `If you have questions, reply to this email or write to us at <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>`
                    : `Si tenés preguntas, respondé este email o escribinos a <a href="mailto:hola@comunidadtriba.com" style="color:#E91A39;text-decoration:underline;">hola@comunidadtriba.com</a>`}
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
  edition: { title: string; edition_number: number | null; cover_url: string; description: string; id: number },
  locale: Locale = "es",
): Promise<void> {
  const subject = edition.edition_number
    ? `${locale === "en" ? "New edition from Triba!" : "¡Nueva edición de Triba!"} #${edition.edition_number}`
    : locale === "en"
      ? "New edition from Triba!"
      : "¡Nueva edición de Triba!";
  try {
    await sendEmail(to, subject, newEditionHtml(edition, locale));
  } catch (err) {
    logger.error({ err, to, edition }, "Sender new edition email error");
    throw err;
  }
}
