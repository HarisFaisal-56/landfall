// Vercel serverless function: give a brand-new Landfall account a little MON so
// its first transaction can go through without a faucet detour.
//
// This holds no user keys. It only pays network fees from a testnet wallet you
// control. Set in Vercel → Project → Settings → Environment Variables:
//   FUNDER_PRIVATE_KEY      testnet-only key holding some MON (required)
//   DRIP_MON                amount per new account, default 0.05
//   DRIP_PER_IP_PER_HOUR    top-ups one network address can trigger per hour, default 5
//   DRIP_PER_MINUTE         top-ups across everyone per minute, default 12
//   MONAD_RPC_URL           optional
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const AMOUNT = parseEther(process.env.DRIP_MON || "0.05");
// Only top up accounts that are nearly empty, so a funded account can't be refilled.
const THRESHOLD = AMOUNT / 5n;
const PER_IP_PER_HOUR = Number(process.env.DRIP_PER_IP_PER_HOUR || 5);
const PER_MINUTE = Number(process.env.DRIP_PER_MINUTE || 12);

// Fresh addresses cost nothing to make, so the balance check alone can't stop
// someone draining the funder with a script. These limits live in memory, so
// they reset when Vercel starts a new instance; they stop a simple loop, which
// is the realistic threat for a testnet demo.
const byIp = new Map(); // ip -> timestamps of top-ups in the last hour
let lastMinute = []; // timestamps of top-ups in the last minute, all callers

function clientIp(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function allow(ip, now = Date.now()) {
  lastMinute = lastMinute.filter((t) => now - t < 60_000);
  const mine = (byIp.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= PER_IP_PER_HOUR || lastMinute.length >= PER_MINUTE) return false;
  mine.push(now);
  byIp.set(ip, mine);
  lastMinute.push(now);
  return true;
}

// One send at a time per instance, so two requests can't pick the same nonce.
let queue = Promise.resolve();

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

    if (!allow(clientIp(req))) {
      return res.status(429).json({ error: "Too many top-ups right now. Use the MON faucet, or try again later." });
    }

    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
    const run = queue.then(async () => {
      const hash = await wallet.sendTransaction({ to: address, value: AMOUNT });
      await pub.waitForTransactionReceipt({ hash, pollingInterval: 200, timeout: 20_000 });
      return hash;
    });
    queue = run.catch(() => {});
    const hash = await run;
    return res.status(200).json({ status: "funded", hash });
  } catch (e) {
    return res.status(500).json({ error: e?.shortMessage || e?.message || "Top-up failed" });
  }
}
