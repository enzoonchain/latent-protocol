import type { WalletClient } from "viem";

// Canonical x402 v2 PaymentRequirements (camelCase, as the server serializes).
type PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string; // base units (USDC: 6 decimals), as a string
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string; [k: string]: unknown };
};

// payment-required challenge: { x402Version, accepts: [PaymentRequirements] }
type PaymentRequired = {
  x402Version?: number;
  accepts: PaymentRequirements[];
};

export async function payX402(
  paymentRequiredHeader: string,
  walletClient: WalletClient,
  address: `0x${string}`,
  preferredNetwork = "eip155:84532"
): Promise<string> {
  let parsed: PaymentRequired;
  try {
    parsed = JSON.parse(atob(paymentRequiredHeader));
  } catch {
    throw new Error("Invalid payment-required header");
  }

  const req =
    parsed.accepts.find(
      (a) => a.scheme === "exact" && a.network === preferredNetwork
    ) ?? parsed.accepts[0];
  if (!req) throw new Error("No compatible payment option");

  const chainId = parseInt(req.network.split(":")[1], 10);
  const amount = BigInt(req.amount);

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const nonce = ("0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;

  const validAfter = BigInt(0);
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000) + (req.maxTimeoutSeconds ?? 3600)
  );

  // EIP-712 domain comes from the challenge (token name/version vary per
  // USDC contract — Base Sepolia vs mainnet), so testnet mirrors mainnet.
  const tokenName = req.extra?.name ?? "USD Coin";
  const tokenVersion = req.extra?.version ?? "2";

  const signature = await walletClient.signTypedData({
    account: address,
    domain: {
      name: tokenName,
      version: tokenVersion,
      chainId,
      verifyingContract: req.asset as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: address,
      to: req.payTo as `0x${string}`,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  });

  // Canonical x402 v2 PaymentPayload. `payload` is the exact-EVM inner dict
  // (authorization values are strings); `accepted` echoes the requirements.
  const proof = {
    x402Version: 2,
    payload: {
      authorization: {
        from: address,
        to: req.payTo,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      signature,
    },
    accepted: req,
  };

  return btoa(JSON.stringify(proof));
}
