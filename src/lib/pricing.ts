export interface Plan {
  moneda: "EUR" | "USD" | "ARS";
  simbolo: string;
  precio: string;
  periodo: string;
  desc: string;
}

export const plans: Plan[] = [
  { moneda: "EUR", simbolo: "€", precio: "9.50", periodo: "/mes", desc: "Europa" },
  { moneda: "USD", simbolo: "U$S", precio: "10.50", periodo: "/mes", desc: "Latam" },
  { moneda: "ARS", simbolo: "$", precio: "12.500", periodo: "/mes", desc: "Argentina" },
];

export const MONTHLY_PRICE_CENTS: Record<string, number> = {
  EUR: 950,
  USD: 1050,
  ARS: 12500,
};
