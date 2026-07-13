import { Client, Environment, LogLevel, OrdersController } from "@paypal/paypal-server-sdk";

const paypalClientId = import.meta.env.PAYPAL_CLIENT_ID || "";
const paypalClientSecret = import.meta.env.PAYPAL_CLIENT_SECRET || "";

export const paypalClient = (paypalClientId && paypalClientSecret)
  ? new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: paypalClientId,
        oAuthClientSecret: paypalClientSecret,
      },
      timeout: 0,
      environment: Environment.Sandbox,
      logging: { logLevel: LogLevel.Info },
    })
  : null;

export const paypalOrders = paypalClient ? new OrdersController(paypalClient) : null;

export const PAYPAL_WEBHOOK_ID = import.meta.env.PAYPAL_WEBHOOK_ID || "";
export const PAYPAL_PLAN_IDS = {
  EUR: import.meta.env.PAYPAL_PLAN_EUR || "",
  USD: import.meta.env.PAYPAL_PLAN_USD || "",
  ARS: import.meta.env.PAYPAL_PLAN_ARS || "",
};
