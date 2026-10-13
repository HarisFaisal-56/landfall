import { formatUnits, isAddress, parseUnits } from "viem";

/**
 * 25000000n (6 decimals) -> "25.00". Rounds down, so a quote never promises
 * more than the receiver gets (9.995 shows as 9.99, not 10.00).
 */
export function money(amount, decimals, places = 2) {
  const a = amount ?? 0n;
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const [whole, frac = ""] = formatUnits(abs, decimals).split(".");
  const cents = (frac + "0".repeat(places)).slice(0, places);
  const grouped = BigInt(whole).toLocaleString("en-US");
  return `${neg ? "-" : ""}${grouped}${places ? "." + cents : ""}`;
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function parseAmount(text, decimals) {
  const t = String(text || "").replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  try {
    const v = parseUnits(t, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Accept a raw address or a Landfall pay link; return { to, amount } or null. */
export function parseRecipient(text) {
  const t = String(text || "").trim();
  if (isAddress(t)) return { to: t, amount: "" };
  try {
    const u = new URL(t);
    const to = u.searchParams.get("to");
    if (to && isAddress(to)) return { to, amount: u.searchParams.get("amount") || "" };
  } catch {
    /* not a URL */
  }
  return null;
}

export function payLink(address, amount) {
  const u = new URL(window.location.origin + window.location.pathname);
  u.searchParams.set("to", address);
  if (amount) u.searchParams.set("amount", amount);
  return u.toString();
}

export function seconds(ms) {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)} s`;
  return ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** Wallet and RPC errors, rewritten as one line that says what to do. */
export function friendlyError(e) {
  const msg = String(e?.shortMessage || e?.details || e?.message || e);
  if (/insufficient funds|exceeds the balance of the account|gas required exceeds/i.test(msg))
    return "This account has no MON for network fees yet. Add a little from the MON faucet, then try again.";
  if (/AddressIsNotRole|APPROVED_SWAPPER/i.test(msg))
    return "Agora hasn't approved this account for Instant Settlement yet. Send in AUSD instead.";
  if (/MaxFrequencyExceeded|0x20e5bc67/i.test(msg))
    return "Agora's test-dollar faucet is rate-limited and has had too many requests. Wait a minute, then tap Get test AUSD again.";
  if (/PairIsPaused/i.test(msg)) return "Agora's Instant Settlement pair is paused right now. Send in AUSD instead.";
  if (/InsufficientOutputAmount|InsufficientLiquidity/i.test(msg)) return "The rate moved or liquidity is low. Try a smaller amount.";
  if (/transfer amount exceeds balance|ERC20InsufficientBalance|InsufficientTokens/i.test(msg))
    return "Not enough balance for that amount.";
  if (/fetch|network|timeout|Failed to fetch/i.test(msg)) return "Can't reach Monad right now. Check your connection and try again.";
  return msg.length > 180 ? msg.slice(0, 177) + "…" : msg;
}
