import type { WalletClient } from 'viem';

interface PaymentOption {
  scheme: string;
  network: string;
  maxAmountRequired: string | number;
  payTo: string;
  asset: string;
  resource?: string;
  maxTimeoutSeconds?: number;
}

interface PaymentRequired {
  x402Version: number;
  accepts: PaymentOption[];
}

export async function payX402(
  paymentRequiredHeader: string,
  walletClient: WalletClient,
  address: `0x${string}`,
  preferredNetwork = 'eip155:84532'
): Promise<string> {
  let parsed: PaymentRequired;
  try {
    parsed = JSON.parse(atob(paymentRequiredHeader));
  } catch {
    throw new Error('Invalid payment-required header');
  }

  const option =
    parsed.accepts.find((a) => a.scheme === 'exact' && a.network === preferredNetwork) ??
    parsed.accepts[0];

  if (!option) throw new Error('No compatible payment option');

  const chainId = parseInt(option.network.split(':')[1], 10);
  const amount = BigInt(option.maxAmountRequired);
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const nonce = ('0x' + Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const signature = await walletClient.signTypedData({
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId,
      verifyingContract: option.asset as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: address,
      to: option.payTo as `0x${string}`,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  });

  const proof = {
    x402Version: 1,
    scheme: 'exact',
    network: option.network,
    payload: {
      signature,
      authorization: {
        from: address,
        to: option.payTo,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  return btoa(JSON.stringify(proof));
}
