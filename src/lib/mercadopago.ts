import { MercadoPagoConfig } from "mercadopago";

const mpAccessToken = import.meta.env.MP_ACCESS_TOKEN || "";

export const mpClient = mpAccessToken
  ? new MercadoPagoConfig({ accessToken: mpAccessToken })
  : null;
