import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { AGORA, monadTestnet } from "./config";
import { erc20Abi, faucetAbi, pairAbi } from "./abi";

// Poll fast: Monad blocks are ~400ms, and the default 4s polling would hide that.
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
  pollingInterval: 200,
});

export function walletFor(account) {
  return createWalletClient({ account, chain: monadTestnet, transport: http(), pollingInterval: 200 });
}

const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

/** Token metadata for AUSD and the pair's other token, read once. */
export async function loadTokens() {
  const [ausdDecimals, ausdSymbol] = await Promise.all([
    read(AGORA.ausd, erc20Abi, "decimals"),
    read(AGORA.ausd, erc20Abi, "symbol").catch(() => "AUSD"),
  ]);
  let pair = null;
  try {
    const [t0, t1, paused] = await Promise.all([
      read(AGORA.pair, pairAbi, "token0"),
      read(AGORA.pair, pairAbi, "token1"),
      read(AGORA.pair, pairAbi, "isPaused").catch(() => false),
    ]);
    const other = t0.toLowerCase() === AGORA.ausd.toLowerCase() ? t1 : t0;
    const hasAusd = [t0, t1].some((t) => t.toLowerCase() === AGORA.ausd.toLowerCase());
    if (hasAusd) {
      const [d, s] = await Promise.all([
        read(other, erc20Abi, "decimals"),
        read(other, erc20Abi, "symbol").catch(() => "CTK"),
      ]);
      pair = { address: AGORA.pair, other, otherDecimals: Number(d), otherSymbol: s, paused };
    }
  } catch {
    pair = null; // pair not reachable at this address; the app still sends AUSD directly
  }
  return { ausdDecimals: Number(ausdDecimals), ausdSymbol, pair };
}

export async function loadBalances(me, tokens) {
  const tasks = [
    read(AGORA.ausd, erc20Abi, "balanceOf", [me]),
    publicClient.getBalance({ address: me }),
  ];
  if (tokens.pair) {
    tasks.push(read(tokens.pair.other, erc20Abi, "balanceOf", [me]));
    tasks.push(read(tokens.pair.address, pairAbi, "hasRole", ["APPROVED_SWAPPER", me]).catch(() => false));
  }
  const [ausd, mon, other = 0n, approved = false] = await Promise.all(tasks);
  return { ausd, mon, other, approved };
}

/** How much AUSD the recipient gets for `amountIn` of the pair's other token. */
export async function quoteOtherToAusd(tokens, amountIn) {
  const amounts = await read(tokens.pair.address, pairAbi, "getAmountsOut", [amountIn, [tokens.pair.other, AGORA.ausd]]);
  return amounts[amounts.length - 1];
}

/** Agora's live rate: AUSD out for exactly 1 unit of the other token. */
export async function agoraRate(tokens) {
  const one = parseUnits("1", tokens.pair.otherDecimals);
  return quoteOtherToAusd(tokens, one);
}

/**
 * Send AUSD and time it from the moment the signed transaction leaves the
 * device until the receipt is back.
 */
export async function sendAusd(wallet, to, amount) {
  const t0 = performance.now();
  const hash = await wallet.writeContract({ address: AGORA.ausd, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 150 });
  if (receipt.status !== "success") throw new Error("The transfer was reverted onchain.");
  return { hash, ms: performance.now() - t0, received: amount };
}

/**
 * Pay with the pair's other token; Agora's Instant Settlement swaps it and
 * delivers AUSD straight to `to` in the same transaction.
 */
export async function sendViaInstantSettlement(wallet, tokens, to, amountIn, slippageBps = 30n) {
  const me = wallet.account.address;
  const allowance = await read(tokens.pair.other, erc20Abi, "allowance", [me, tokens.pair.address]);
  if (allowance < amountIn) {
    const h = await wallet.writeContract({ address: tokens.pair.other, abi: erc20Abi, functionName: "approve", args: [tokens.pair.address, amountIn] });
    await publicClient.waitForTransactionReceipt({ hash: h, pollingInterval: 150 });
  }
  const quoted = await quoteOtherToAusd(tokens, amountIn);
  const minOut = (quoted * (10000n - slippageBps)) / 10000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const t0 = performance.now();
  const hash = await wallet.writeContract({
    address: tokens.pair.address,
    abi: pairAbi,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, minOut, [tokens.pair.other, AGORA.ausd], to, deadline],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 150 });
  if (receipt.status !== "success") throw new Error("The swap was reverted onchain.");
  return { hash, ms: performance.now() - t0, received: quoted };
}

/**
 * Ask this deployment's /api/drip to cover the first network fees.
 * Returns "funded" | "already-funded" | "unavailable".
 */
export async function requestGasTopUp(address) {
  try {
    const r = await fetch("/api/drip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!r.ok) return "unavailable";
    const j = await r.json();
    return j.status || "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function requestTestAusd(wallet) {
  const hash = await wallet.writeContract({ address: AGORA.ausdFaucet, abi: faucetAbi, functionName: "requestFunds", args: [wallet.account.address] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 150 });
  if (receipt.status !== "success") throw new Error("The AUSD faucet refused the request. It may have a cooldown.");
  return hash;
}
