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

/**
 * Keep only what a money field can hold: digits and one decimal point, with at most
 * `decimals` places. "$1,000.50x" -> "1000.50", "30mkk" -> "30", "1.2.3" -> "1.23".
 */
export function cleanAmount(text, decimals = 6) {
  let s = String(text ?? "").replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  return s;
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
    // The amount comes from a link anyone can craft, and it's shown on the welcome screen.
    // Reduce it to a plain number so a link can't put its own words in front of the payer.
    if (to && isAddress(to)) return { to, amount: cleanAmount(u.searchParams.get("amount") || "") };
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

export const FAUCET_BUSY =
  "Agora's test-dollar faucet is shared by everyone testing, and someone just used it. Wait a minute, then tap Get test AUSD again.";

/** 42 -> "42 seconds", 300 -> "5 minutes", 7200 -> "2 hours". */
export function duration(s) {
  if (s < 90) return `${Math.max(1, Math.round(s))} seconds`;
  if (s < 5400) return `${Math.ceil(s / 60)} minutes`;
  return `${Math.round(s / 3600)} hours`;
}

/** Wallet and RPC errors, rewritten as one line that says what to do. */
export function friendlyError(e) {
  const msg = String(e?.shortMessage || e?.details || e?.message || e);
  // viem puts a decoded custom error (e.g. MaxFrequencyExceeded) on a nested
  // ContractFunctionRevertedError, not in shortMessage, so look there too.
  let revertName = "";
  try {
    const rev = typeof e?.walk === "function" ? e.walk((x) => x?.name === "ContractFunctionRevertedError") : null;
    revertName = rev?.data?.errorName || rev?.signature || rev?.reason || "";
  } catch {
    /* not a viem error */
  }
  const all = `${revertName} ${msg} ${e?.details || ""} ${e?.message || ""}`;
  if (/MaxFrequencyExceeded|0x20e5bc67/i.test(all)) return FAUCET_BUSY;
  if (/MaxAllowedExceeded/i.test(all)) return "This account already holds as much test AUSD as Agora's faucet gives out.";
  if (revertName === "InsufficientFunds") return "Agora's test-dollar faucet is empty right now. Try again later.";
  if (/AddressIsNotRole|APPROVED_SWAPPER/i.test(all))
    return "Agora hasn't approved this account for Instant Settlement yet. Send in AUSD instead.";
  if (/PairIsPaused/i.test(all)) return "Agora's Instant Settlement pair is paused right now. Send in AUSD instead.";
  if (/InsufficientOutputAmount|InsufficientLiquidity/i.test(all)) return "The rate moved or liquidity is low. Try a smaller amount.";
  if (/insufficient funds|exceeds the balance of the account|gas required exceeds/i.test(msg))
    return "This account has no MON for network fees yet. Add a little from the MON faucet, then try again.";
  if (/transfer amount exceeds balance|ERC20InsufficientBalance|InsufficientTokens/i.test(all))
    return "Not enough balance for that amount.";
  if (/fetch|network|timeout|Failed to fetch/i.test(msg)) return "Can't reach Monad right now. Check your connection and try again.";
  return msg.length > 180 ? msg.slice(0, 177) + "…" : msg;
}
