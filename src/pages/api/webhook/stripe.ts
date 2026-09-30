import type { APIRoute } from "astro";
import type Stripe from "stripe";
import type { Database } from "../../../lib/database.types";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { ok, error } from "../../../lib/response";
import { logger } from "../../../lib/logger";
import { syncPaidSubscriber } from "../../../lib/sender";
import { sendWelcomeEmail } from "../../../lib/email";
import { getPreferredLocale } from "../../../lib/locale-pref";
import { sendMailClubActivation } from "../../../lib/mail-club-activation";
import { applyUpgrade } from "../../../lib/upgrade-apply";
import { STRIPE_PRICE_IDS, MAIL_CLUB_STRIPE_PRICE_IDS } from "../../../lib/stripe";

const VERIFY_SIGNATURES = true;

type StripeSubWithPeriod = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};

function periodRange(sub: Stripe.Subscription) {
  // This Stripe account (new billing model) does NOT expose current_period_start/end
  // on the subscription object, so fall back to start_date/created.
  const startSec = (sub as any).current_period_start ?? (sub as any).start_date ?? sub.created;
  const endSec =
    (sub as any).current_period_end ?? (startSec ? startSec + 30 * 24 * 60 * 60 : undefined);
  return {
    start: startSec ? new Date(startSec * 1000).toISOString() : undefined,
    end: endSec ? new Date(endSec * 1000).toISOString() : undefined,
  };
}

async function supersedeMigratedSub(userId: string) {
  if (!userId) return;
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "migrated");
}

// Upgrade digital -> Mail Club (Stripe): pago único de la diferencia ya
// cobrado en un Checkout mode=payment. Cambia la tarifa recurrente sin
// prorrateo para la próxima renovación. Idempotente por upgrade_id.
async function handleMailClubUpgradePayment(session: Stripe.Checkout.Session): Promise<void> {
  if (!stripe) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    logger.info({ sessionId: session.id }, "mail club upgrade unpaid — leaving pending");
    return;
  }
  const upgradeId = session.metadata?.upgrade_id || "";
  const userId = session.client_reference_id || session.metadata?.user_id || "";
  if (!upgradeId || !userId) {
    logger.warn({ sessionId: session.id }, "mail club upgrade without upgrade_id/user — skipping");
    return;
  }

  const { data: row } = await supabaseAdmin
    .from("mail_club_upgrades")
    .select("*")
    .eq("id", upgradeId)
    .maybeSingle();
  if (!row || (row as any).status !== "pending") return;
  if ((row as any).user_id !== userId) {
    logger.warn({ upgradeId, userId }, "mail club upgrade user mismatch — skipping");
    return;
  }

  try {
    await supabaseAdmin
      .from("mail_club_upgrades")
      .update({ status: "payment_confirmed", updated_at: new Date().toISOString() })
      .eq("id", upgradeId);
    await applyUpgrade(upgradeId);
  } catch (err: any) {
    logger.error({ err, upgradeId, userId }, "mail club upgrade apply error (stripe)");
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return error("Stripe not configured", 500);
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  let event;
  try {
    if (VERIFY_SIGNATURES) {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(body);
    }
  } catch {
    return error("Invalid signature", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "payment") {
          if (session.metadata?.plan === "mail_club_upgrade") {
            await handleMailClubUpgradePayment(session);
          }
          break;
        }
        if (session.mode !== "subscription") break;

        const stripeSub = (await stripe.subscriptions.retrieve(
          session.subscription as string,
        )) as unknown as StripeSubWithPeriod;
        const period = periodRange(stripeSub);
        const userId = session.client_reference_id || session.metadata?.user_id || "";

        let email = session.customer_email || session.customer_details?.email || undefined;
        if (!email && userId) {
          const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
          email = user?.user?.email;
        }

        const plan = session.metadata?.plan === "mail_club" ? "mail_club" : "digital";
        // En Mail Club, checkout.session.completed puede llegar con el pago
        // aún en proceso: solo se activa con cobro confirmado. Si no, la
        // suscripción queda 'incomplete' hasta que invoice.paid la confirme.
        const mailClubPaid =
          plan !== "mail_club" ||
          session.payment_status === "paid" ||
          session.payment_status === "no_payment_required";

        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, status")
          .eq("provider", "stripe")
          .eq("provider_subscription_id", stripeSub.id)
          .maybeSingle();

        const { data: subs } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          provider: "stripe",
          provider_subscription_id: stripeSub.id,
          status: (plan === "mail_club" && !mailClubPaid
            ? "incomplete"
            : stripeSub.status) as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated",
          plan_currency: (session.metadata?.currency || "USD") as "EUR" | "USD" | "ARS",
          plan_type: plan,
          ...(period.start ? { current_period_start: period.start } : {}),
          ...(period.end ? { current_period_end: period.end } : {}),
        }, { onConflict: "provider, provider_subscription_id" }).select("id").single();

        if (!mailClubPaid) {
          logger.info({ userId, subId: stripeSub.id }, "mail club checkout pending payment — waiting invoice.paid");
          break;
        }

          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            ...(email ? { email } : {}),
            role: "subscriber",
            subscription_id: subs?.id || null,
            updated_at: new Date().toISOString(),
          } as Database["public"]["Tables"]["profiles"]["Insert"], { onConflict: "id" });

          await supersedeMigratedSub(userId);

          if (email) {
            syncPaidSubscriber(email).catch((err) =>
              logger.error({ err, email }, "Sender sync error (stripe)"),
            );
            if (plan === "mail_club") {
              // Solo la primera activación: una fila previa 'incomplete' que
              // ahora se confirma también recibe fundadora + bienvenida.
              // Eventos repetidos de una sub ya activa no reenvían nada.
              if (!(existingSub as any)?.id || (existingSub as any)?.status !== "active") {
                try {
                  await sendMailClubActivation(userId, email);
                } catch (err) {
                  logger.error({ err, email }, "Mail Club welcome email error (stripe)");
                }
              }
            } else {
              getPreferredLocale(userId).then((locale) =>
                sendWelcomeEmail(email, false, locale),
              ).catch((err) =>
                logger.error({ err, email }, "Welcome email error (stripe)"),
              );
            }
          }

        break;
      }

      case "invoice.paid": {
        // Primera confirmación de un Mail Club que quedó 'incomplete' en el
        // checkout (pago asincrónico). Las renovaciones (status active) se
        // ignoran: invoice repetidos no reactivan ni reenvían bienvenida.
        const invoice = event.data.object as any;
        const stripeSubId: string | undefined =
          typeof invoice.subscription === "string" ? invoice.subscription : undefined;
        if (!stripeSubId) break;

        const { data: row } = await supabaseAdmin
          .from("subscriptions")
          .select("id, user_id, plan_type, status")
          .eq("provider", "stripe")
          .eq("provider_subscription_id", stripeSubId)
          .maybeSingle();
        if (!row || (row as any).plan_type !== "mail_club" || (row as any).status === "active") break;

        const stripeSub = (await stripe.subscriptions.retrieve(
          stripeSubId,
        )) as unknown as StripeSubWithPeriod;
        const period = periodRange(stripeSub);
        const userId = (row as any).user_id as string;

        // Transición atómica incomplete -> active: si otro evento ya la
        // activó, no hay fila afectada y se omite la bienvenida.
        const { data: flipped } = await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            ...(period.start ? { current_period_start: period.start } : {}),
            ...(period.end ? { current_period_end: period.end } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", (row as any).id)
          .neq("status", "active")
          .select("id");
        if (!flipped || (flipped as any[]).length === 0) break;

        await supabaseAdmin.from("profiles").upsert({
          id: userId,
          role: "subscriber",
          subscription_id: (row as any).id,
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["profiles"]["Insert"], { onConflict: "id" });

        await supersedeMigratedSub(userId);

        let email: string | undefined = (invoice as any).customer_email;
        if (!email) {
          const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
          email = user?.user?.email;
        }
        if (email) {
          syncPaidSubscriber(email).catch((err) =>
            logger.error({ err, email }, "Sender sync error (stripe invoice)"),
          );
          try {
            await sendMailClubActivation(userId, email);
          } catch (err) {
            logger.error({ err, email }, "Mail Club welcome email error (stripe invoice)");
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubWithPeriod;
        const period = periodRange(sub);

        // Sincroniza el plan desde el precio vigente: al completarse un
        // downgrade programado, los ítems pasan al precio digital.
        const currentPriceId = (sub as any).items?.data?.[0]?.price?.id as string | undefined;
        const digitalIds = new Set(Object.values(STRIPE_PRICE_IDS).filter(Boolean));
        const clubIds = new Set(Object.values(MAIL_CLUB_STRIPE_PRICE_IDS).filter(Boolean));
        const planFromPrice =
          currentPriceId && clubIds.has(currentPriceId)
            ? "mail_club"
            : currentPriceId && digitalIds.has(currentPriceId)
              ? "digital"
              : undefined;

        // El downgrade programado se completa cuando el precio pasa a digital;
        // con precio Mail Club vigente NO se tocan los flags programados.
        await supabaseAdmin.from("subscriptions").update({
          status: sub.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated",
          cancel_at_period_end: !!(sub as any).cancel_at_period_end,
          ...(planFromPrice ? { plan_type: planFromPrice } : {}),
          ...(planFromPrice === "digital"
            ? { scheduled_plan_type: null, scheduled_plan_at: null }
            : {}),
          ...(period.start ? { current_period_start: period.start } : {}),
          ...(period.end ? { current_period_end: period.end } : {}),
          updated_at: new Date().toISOString(),
        }).eq("provider_subscription_id", sub.id).eq("provider", "stripe");

        if (sub.status === "canceled" || sub.status === "past_due") {
          const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("provider_subscription_id", sub.id)
            .eq("provider", "stripe")
            .maybeSingle();

          if (existing) {
        await supabaseAdmin.from("profiles").update({
            role: "free",
            subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.user_id);
          }
        }

        break;
      }
    }

    return ok({ received: true });
  } catch (err: any) {
    logger.error({ err, eventType: event?.type }, "stripe webhook error");
    return error("Internal server error", 500);
  }
};
