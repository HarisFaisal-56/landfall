// Vercel serverless function: give a brand-new Landfall account a little MON so
// its first transaction can go through without a faucet detour.
//
// This holds no user keys. It only pays network fees from a testnet wallet you
// control. Set in Vercel → Project → Settings → Environment Variables:
//   FUNDER_PRIVATE_KEY   testnet-only key holding some MON (required)
//   DRIP_MON             amount per new account, default 0.05
//   MONAD_RPC_URL        optional
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const AMOUNT = parseEther(process.env.DRIP_MON || "0.05");
// Only top up accounts that are nearly empty, so the endpoint can't be farmed.
const THRESHOLD = AMOUNT / 5n;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.FUNDER_PRIVATE_KEY;
  if (!key) return res.status(503).json({ error: "Gas top-up isn't configured on this deployment." });

  const address = req.body?.address;
  if (!isAddress(address || "")) return res.status(400).json({ error: "Send { address } as JSON." });

  try {
    const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
    const balance = await pub.getBalance({ address });
    if (balance >= THRESHOLD) return res.status(200).json({ status: "already-funded" });

    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
    const hash = await wallet.sendTransaction({ to: address, value: AMOUNT });
    await pub.waitForTransactionReceipt({ hash, pollingInterval: 200, timeout: 20_000 });
    return res.status(200).json({ status: "funded", hash });
  } catch (e) {
    return res.status(500).json({ error: e?.shortMessage || e?.message || "Top-up failed" });
  }
}
