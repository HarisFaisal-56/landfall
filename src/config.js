import { monadTestnet as base } from "viem/chains";

export const APP_NAME = "Landfall";

export const monadTestnet = {
  ...base,
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
};

// Agora addresses on Monad testnet, from docs.agora.finance
// (developer/contract-deployments and instant-settlement/protocol-deployments).
export const AGORA = {
  ausd: import.meta.env.VITE_AUSD_ADDRESS || "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  ausdFaucet: import.meta.env.VITE_AUSD_FAUCET || "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
  factory: "0x8468587Af422ad440F58a57E955eCA6A970b5375",
  // Instant Settlement pair (AUSD / CTK). Override if Agora gives you a different one.
  pair: import.meta.env.VITE_AGORA_PAIR || "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
};

export const MON_FAUCET = "https://faucet.monad.xyz";

// Prompt-free signing session: after one passkey check, sends need no further
// prompt for this long and up to this many dollars. Beyond either, ask again.
export const SESSION_MINUTES = Number(import.meta.env.VITE_SESSION_MINUTES || 15);
export const SESSION_LIMIT_USD = Number(import.meta.env.VITE_SESSION_LIMIT_USD || 100);

export const txUrl = (hash) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a) => `${monadTestnet.blockExplorers.default.url}/address/${a}`;
