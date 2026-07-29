// Synthetic fixture module for investigator evals — NOT part of the real DevDigest codebase.

export interface ChargeResult {
  chargeId: string;
  status: "succeeded" | "declined";
}

export class PaymentService {
  constructor(private readonly gateway: { charge(cents: number): Promise<ChargeResult> }) {}

  async chargeCard(customerId: string, amountCents: number): Promise<ChargeResult> {
    if (amountCents <= 0) throw new Error("amount must be positive");
    return this.gateway.charge(amountCents);
  }
}
