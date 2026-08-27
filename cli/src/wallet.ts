import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadConfig, saveConfig } from "./config.js";

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(address: string): boolean {
  return EVM_RE.test(address);
}

export function generateWallet(): { address: string; privateKey: string } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

export interface WalletOpts {
  yes?: boolean;
  generate?: boolean;
  wallet?: string;
}

export async function ensureWallet(opts: WalletOpts = {}): Promise<string> {
  const existing = loadConfig().wallet;
  if (opts.wallet) {
    if (!isValidAddress(opts.wallet)) {
      throw new Error(`Invalid wallet address: ${opts.wallet}`);
    }
    saveConfig({ wallet: opts.wallet });
    return opts.wallet;
  }

  if (existing && (opts.yes || opts.generate === undefined)) {
    if (opts.yes) return existing;
  }

  if (opts.generate || (opts.yes && !existing)) {
    const { address, privateKey } = generateWallet();
    saveConfig({ wallet: address });
    console.log("\n✅ New wallet generated!");
    console.log(`   Address:     ${address}`);
    console.log(`   Private key: ${privateKey}`);
    console.log("\n   ⚠️  Save your private key now — Latent only stores the address.");
    return address;
  }

  if (existing) {
    const rl = createInterface({ input, output });
    try {
      const answer = (await rl.question(`Current wallet: ${existing}\nChange it? [y/N]: `)).trim().toLowerCase();
      if (answer !== "y") return existing;
    } finally {
      rl.close();
    }
  }

  const rl = createInterface({ input, output });
  try {
    console.log("\nHow would you like to set up your wallet?");
    console.log("  [1] Generate a new wallet (recommended)");
    console.log("  [2] Use my existing wallet address");
    const choice = (await rl.question("\nChoice [1/2]: ")).trim() || "1";

    if (choice === "2") {
      while (true) {
        const address = (await rl.question("\nEnter your EVM wallet address (0x...): ")).trim();
        if (isValidAddress(address)) {
          saveConfig({ wallet: address });
          console.log(`\n✅ Wallet saved`);
          return address;
        }
        console.log("❌ Invalid address. Must be 0x followed by 40 hex characters.");
      }
    }

    const { address, privateKey } = generateWallet();
    saveConfig({ wallet: address });
    console.log("\n✅ New wallet generated!");
    console.log(`   Address:     ${address}`);
    console.log(`   Private key: ${privateKey}`);
    console.log("\n   ⚠️  Save your private key now — Latent only stores the address.");
    await rl.question("Press Enter once you've saved your private key... ");
    return address;
  } finally {
    rl.close();
  }
}
