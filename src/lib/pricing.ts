export interface Plan {
  moneda: "EUR" | "USD" | "ARS";
  simbolo: string;
  precio: string;
  periodo: string;
  desc: string;
}

export const plans: Plan[] = [
  { moneda: "EUR", simbolo: "€ ", precio: "7", periodo: "/mes", desc: "Europa" },
  { moneda: "USD", simbolo: "U$S ", precio: "7", periodo: "/mes", desc: "Latam" },
  { moneda: "ARS", simbolo: "$ ", precio: "7.000", periodo: "/mes", desc: "Argentina" },
];

export const MONTHLY_PRICE_CENTS: Record<string, number> = {
  EUR: 700,
  USD: 700,
  ARS: 7000,
};
