// Synthetic fixture module for investigator evals — NOT part of the real DevDigest codebase.

import { PaymentService } from "./payment-service";

export function registerCheckoutRoutes(app: { post: Function }, gateway: any) {
  const payments = new PaymentService(gateway);

  app.post("/checkout", async (req: any, reply: any) => {
    const result = await payments.chargeCard(req.body.customerId, req.body.amountCents);
    reply.send(result);
  });
}
