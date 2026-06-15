import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";

const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
const chain = chainId === "8453" ? base : baseSepolia;

export const config = getDefaultConfig({
  appName: "Latent",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || "latent",
  chains: [chain],
  ssr: true,
});

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://api.latentprotocol.xyz";
