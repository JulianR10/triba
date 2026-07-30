const KIT_API_BASE = "https://api.kit.com/v4";

function apiKey() {
  return import.meta.env.KIT_API_KEY || "";
}

function isConfigured() {
  return !!apiKey();
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${KIT_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Kit-Api-Key": apiKey(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kit API ${res.status}: ${text}`);
  }
  return res.json();
}

interface KitSubscriber {
  id: number;
  email_address: string;
  first_name: string | null;
  state: string;
}

interface KitTag {
  id: number;
  name: string;
}

interface PaginatedData<T> {
  data: T[];
}

export async function addSubscriber(
  email: string,
  firstName?: string,
): Promise<KitSubscriber> {
  const { data } = await request<{ data: KitSubscriber }>("POST", "/subscribers", {
    email_address: email,
    first_name: firstName || null,
  });
  return data;
}

export async function tagSubscriberByEmail(
  email: string,
  tagId: number,
): Promise<void> {
  await request(`POST`, `/tags/${tagId}/subscribers`, { email_address: email });
}

export async function getOrCreateTag(name: string): Promise<KitTag> {
  const tags = await request<PaginatedData<KitTag>>("GET", `/tags?include=subscriber_count`);
  const existing = tags.data.find((t) => t.name === name);
  if (existing) return existing;
  const { data } = await request<{ data: KitTag }>("POST", "/tags", { name });
  return data;
}

export async function syncFreeSubscriber(email: string): Promise<void> {
  if (!isConfigured()) return;
  const tag = await getOrCreateTag("newsletter-gratuito");
  await addSubscriber(email);
  await tagSubscriberByEmail(email, tag.id);
}

export async function syncPaidSubscriber(email: string): Promise<void> {
  if (!isConfigured()) return;
  const tag = await getOrCreateTag("suscriptora-paga");
  await addSubscriber(email);
  await tagSubscriberByEmail(email, tag.id);
}
