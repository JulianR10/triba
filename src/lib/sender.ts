const SENDER_API_BASE = "https://api.sender.net/v2";

function apiKey() {
  return import.meta.env.SENDER_API_KEY || "";
}

function isConfigured() {
  return !!apiKey();
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${SENDER_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sender API ${res.status}: ${text}`);
  }
  return res.json();
}

interface SenderGroup {
  id: string;
  title: string;
}

export async function getOrCreateGroup(title: string): Promise<SenderGroup> {
  const res = await request<{ data: SenderGroup[] }>("GET", "/groups");
  const existing = res.data?.find((g) => g.title === title);
  if (existing) return existing;
  const created = await request<{ data: SenderGroup }>("POST", "/groups", { title });
  return created.data;
}

export async function addSubscriberToGroup(
  email: string,
  groupId: string,
  firstName?: string,
): Promise<void> {
  await request("POST", "/subscribers", {
    email,
    groups: [groupId],
    ...(firstName ? { firstname: firstName } : {}),
    trigger_automation: true,
  });
}

export async function syncFreeSubscriber(email: string, firstName?: string): Promise<void> {
  if (!isConfigured()) return;
  const group = await getOrCreateGroup("newsletter-gratuito");
  await addSubscriberToGroup(email, group.id, firstName);
}

export async function syncPaidSubscriber(email: string, firstName?: string): Promise<void> {
  if (!isConfigured()) return;
  const group = await getOrCreateGroup("suscriptora-paga");
  await addSubscriberToGroup(email, group.id, firstName);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = apiKey();
  if (!key) {
    throw new Error("Sender not configured");
  }

  const fromName = import.meta.env.SENDER_FROM_NAME || "Triba";
  const fromEmail = import.meta.env.SENDER_FROM_EMAIL || "hola@comunidadtriba.com";

  const res = await request("POST", "/message/send", {
    from: { email: fromEmail, name: fromName },
    to: { email: to },
    subject,
    html,
  });

  if (!res) return;
}
