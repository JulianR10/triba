// Traducción de los errores de la API para quien navega en inglés. Los endpoints responden
// `{ error: "<español>" }`; el middleware aplica `localizeApiError` cuando la usuaria está en
// inglés. Una frase sin traducción llega en español (nunca se rompe la respuesta).
// Al agregar un error visible para el público en un endpoint, sumar su traducción acá:
// tests/error-i18n.test.ts avisa si falta.

const EXACT_EN: Record<string, string> = {
  "Necesitás una suscripción Mail Club activa para gestionar tu dirección.": "You need an active Mail Club subscription to manage your address.",
  "No pudimos guardar tu dirección. Intentá de nuevo.": "We couldn't save your address. Please try again.",
  "No encontramos una suscripción cancelable.": "We couldn't find a subscription that can be canceled.",
  "Frenamos la recurrencia, pero no pudimos registrar el estado. Refrescá la página.": "We stopped the recurring charge, but couldn't record the status. Please refresh the page.",
  "El Mail Club está pausado por el momento. Anotate en la lista de espera.": "Mail Club is paused for now. Join the waitlist.",
  "La moneda no corresponde al proveedor de pago.": "The currency doesn't match the payment provider.",
  "No pudimos iniciar el pago. Intentá de nuevo en unos minutos.": "We couldn't start the payment. Please try again in a few minutes.",
  "Por ahora el Mail Club envía solo a Argentina.": "For now, Mail Club ships to Argentina only.",
  "El proveedor no corresponde al país de envío.": "The payment provider doesn't match the shipping country.",
  "Completá todos los campos obligatorios": "Please fill in all required fields.",
  "Email inválido": "Invalid email.",
  "Alguno de los campos es demasiado largo": "One of the fields is too long.",
  "El enlace a tu trabajo es demasiado largo": "The link to your work is too long.",
  "Elegí al menos un área": "Choose at least one area.",
  "Ya te postulaste recientemente. Esperá 24 horas para volver a intentar.": "You applied recently. Please wait 24 hours before trying again.",
  "No se pudo enviar la postulación. Intentalo de nuevo.": "We couldn't send your application. Please try again.",
  "Necesitás una suscripción Mail Club activa para volver al plan digital.": "You need an active Mail Club subscription to go back to the digital plan.",
  "No encontramos tu suscripción para gestionar.": "We couldn't find your subscription to manage.",
  "El mensaje no puede estar vacío": "The message can't be empty.",
  "El mensaje es demasiado largo": "The message is too long.",
  "Esperá un momento antes de enviar otro feedback": "Please wait a moment before sending more feedback.",
  "Ya enviaste ese mensaje. Esperá 24 horas para volver a enviarlo.": "You already sent that message. Please wait 24 hours before sending it again.",
  "No se pudo guardar el feedback": "We couldn't save your feedback. Please try again.",
  "Body inválido": "Invalid request.",
  "Locale inválido": "Invalid language.",
  "No pudimos anotarte. Intentalo más tarde.": "We couldn't sign you up. Please try again later.",
  "El newsletter gratuito ya no está disponible.": "The free newsletter is no longer available.",
  "ID inválido": "Invalid ID.",
  "Edición no encontrada": "Issue not found.",
  "Esta edición no tiene PDF": "This issue has no PDF.",
  "Necesitás una suscripción activa para leer este archivo.": "You need an active subscription to read this file.",
  "Iniciá sesión para leer este archivo.": "Log in to read this file.",
  "Error generando enlace de descarga": "We couldn't generate the download link. Please try again.",
  "No pudimos abrir el portal de gestión. Intentá de nuevo.": "We couldn't open the billing portal. Please try again.",
  "No encontramos una suscripción para gestionar.": "We couldn't find a subscription to manage.",
  "Tu suscripción no tiene una referencia de pago asociada.": "Your subscription has no payment reference linked to it.",
  "Necesitás una suscripción digital activa para pasarte al Mail Club.": "You need an active digital subscription to upgrade to Mail Club.",
  "Ya estás en el Mail Club.": "You're already in Mail Club.",
  "Ya tenés un upgrade en curso. Esperá unos minutos y volvé a intentar.": "You already have an upgrade in progress. Wait a few minutes and try again.",
  "No pudimos iniciar el upgrade. Intentá de nuevo.": "We couldn't start the upgrade. Please try again.",
  "Tu tarjeta fue rechazada. Podés intentar con otra tarjeta.": "Your card was declined. You can try another card.",
  "El servicio está temporalmente no disponible. Intentá de nuevo.": "The service is temporarily unavailable. Please try again.",
  "Demasiados intentos. Esperá un momento.": "Too many attempts. Please wait a moment.",
};

const MONTHS_ES_EN: Record<string, string> = {
  enero: "January", febrero: "February", marzo: "March", abril: "April", mayo: "May", junio: "June",
  julio: "July", agosto: "August", septiembre: "September", octubre: "October", noviembre: "November", diciembre: "December",
};

// Frases con datos interpolados: se traducen por forma, conservando el dato.
const PATTERNS_EN: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /^Tu suscripción sigue activa hasta el (\d+) de (\p{L}+) de (\d+), porque ya programaste la baja\. Desde ese día podés volver a suscribirte\.$/u,
    (m) => `Your subscription stays active until ${MONTHS_ES_EN[m[2]] ?? m[2]} ${m[1]}, ${m[3]}, because you already scheduled the cancellation. You can subscribe again from that day.`,
  ],
  [
    /^Tu suscripción actual no admite cambio directo\. Escribinos a (\S+) y lo resolvemos\.$/,
    (m) => `Your current subscription doesn't support a direct change. Write to us at ${m[1]} and we'll sort it out.`,
  ],
  [
    /^Tu suscripción actual no admite upgrade directo\. Escribinos a (\S+) y lo resolvemos\.$/,
    (m) => `Your current subscription doesn't support a direct upgrade. Write to us at ${m[1]} and we'll sort it out.`,
  ],
  [
    /^El cambio quedó programado en tu medio de pago pero no pudimos registrarlo en tu cuenta\. No lo repitas: escribinos a (\S+) y lo completamos\.$/,
    (m) => `The change was scheduled with your payment method, but we couldn't record it in your account. Please don't repeat it: write to us at ${m[1]} and we'll complete it.`,
  ],
  [
    /^La dirección ingresada corresponde a envíos en (\w+), pero tu suscripción actual es en (\w+)\. El upgrade mantiene tu moneda y proveedor actual\.$/,
    (m) => `The address you entered ships in ${m[1]}, but your current subscription is in ${m[2]}. The upgrade keeps your current currency and provider.`,
  ],
];

export function translateErrorToEn(message: string): string {
  const exact = EXACT_EN[message];
  if (exact) return exact;
  for (const [pattern, build] of PATTERNS_EN) {
    const match = message.match(pattern);
    if (match) return build(match);
  }
  return message;
}

// Respuesta JSON de error de la API pública, traducida al inglés. Deja intacta cualquier otra
// respuesta (éxito, no JSON, sin `error` string o sin traducción).
export async function localizeApiError(response: Response): Promise<Response> {
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) return response;
  let body: any;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  if (typeof body?.error !== "string") return response;
  const translated = translateErrorToEn(body.error);
  if (translated === body.error) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({ ...body, error: translated }), { status: response.status, headers });
}

// Idioma de una llamada a la API: la página desde la que se hizo (Referer) manda; la cookie es el respaldo.
export function isEnglishApiCall(request: Request): boolean {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return /^\/en(\/|$)/.test(new URL(referer).pathname);
    } catch {
      /* referer inválido: se usa la cookie */
    }
  }
  return /(?:^|;\s*)triba_locale=en(?:;|$)/.test(request.headers.get("cookie") || "");
}
