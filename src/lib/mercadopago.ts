import { MercadoPagoConfig, Preference } from "mercadopago";

const mpAccessToken = import.meta.env.MP_ACCESS_TOKEN || "";

export const mpClient = mpAccessToken
  ? new MercadoPagoConfig({ accessToken: mpAccessToken })
  : null;

export const mpPreference = mpClient ? new Preference(mpClient) : null;
