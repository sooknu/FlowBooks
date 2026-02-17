import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client, Environment, OrdersController } = require('@paypal/paypal-server-sdk');
import { db } from '../db';
import { appSettings } from '../db/schema';
import { inArray } from 'drizzle-orm';

export async function getPayPalClient(): Promise<{ client: any; ordersController: any }> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [
      'paypal_client_id', 'paypal_client_secret',
      'paypal_test_client_id', 'paypal_test_client_secret',
      'paypal_test_mode',
    ]));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const isTestMode = map.paypal_test_mode === 'true';
  const clientId = isTestMode ? map.paypal_test_client_id : map.paypal_client_id;
  const clientSecret = isTestMode ? map.paypal_test_client_secret : map.paypal_client_secret;
  if (!clientId || !clientSecret) {
    throw new Error(isTestMode ? 'PayPal test credentials are not configured' : 'PayPal is not configured');
  }

  const client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: clientId,
      oAuthClientSecret: clientSecret,
    },
    environment: isTestMode ? Environment.Sandbox : Environment.Production,
  });

  return { client, ordersController: new OrdersController(client) };
}

export async function createPayPalOrder(amount: number, invoiceId: string, invoiceNumber: number | null): Promise<{ orderID: string }> {
  const { ordersController } = await getPayPalClient();

  const { result } = await ordersController.createOrder({
    body: {
      intent: 'CAPTURE',
      purchaseUnits: [{
        amount: {
          currencyCode: 'USD',
          value: amount.toFixed(2),
        },
        description: invoiceNumber ? `Invoice #${String(invoiceNumber).padStart(5, '0')}` : 'Invoice payment',
        customId: invoiceId,
      }],
    },
    prefer: 'return=minimal',
  });

  if (!result.id) throw new Error('Failed to create PayPal order');
  return { orderID: result.id };
}

export async function capturePayPalOrder(orderID: string): Promise<{ captureId: string; amount: number; status: string }> {
  const { ordersController } = await getPayPalClient();

  const { result } = await ordersController.captureOrder({
    id: orderID,
    prefer: 'return=representation',
  });

  if (result.status !== 'COMPLETED') {
    throw new Error(`PayPal order status: ${result.status}`);
  }

  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error('No capture found in PayPal response');

  return {
    captureId: capture.id || orderID,
    amount: parseFloat(capture.amount?.value || '0'),
    status: result.status!,
  };
}
