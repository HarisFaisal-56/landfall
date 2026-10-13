import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { nonceManager } from "viem";
import { deriveEvmPrivateKey } from "./derive";
import { APP_NAME } from "./config";

const STORE_KEY = "landfall.passkey.v1";

/** Only credential metadata is stored. The private key lives in memory for this tab only. */
export function savedCredential() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCredential(meta) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(meta));
  } catch {
    /* private mode: the user just signs in again next time */
  }
}

export function forgetCredential() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

function toAccount(prfOutput) {
  const privateKey = deriveEvmPrivateKey(prfOutput);
  prfOutput.fill(0);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  return { account: toViemAccount(session, { nonceManager }), session };
}

/** New account: one Face ID / fingerprint prompt (two on some devices). */
export async function createAccount() {
  const label = `${APP_NAME} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const res = await createPasskeyWithPrfOutput({
    rp: { id: window.location.hostname, name: APP_NAME },
    user: { name: label, displayName: label },
  });
  saveCredential({ credentialId: res.credentialId, transports: res.transports, label });
  return toAccount(res.prfOutput);
}

/** Returning user. With no saved credential the device lists every Landfall passkey it has. */
export async function signIn() {
  const saved = savedCredential();
  const res = await getPasskeyPrfOutput({
    rpId: window.location.hostname,
    credential: saved ? { credentialId: saved.credentialId, transports: saved.transports } : undefined,
  });
  if (!saved || saved.credentialId !== res.credentialId) {
    saveCredential({ credentialId: res.credentialId, label: saved?.label });
  }
  return toAccount(res.prfOutput);
}

export function passkeyError(e) {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "This device's passkey manager can't hold a Landfall account. Open Landfall on your phone, or on a computer use Safari with iCloud Keychain or Chrome with Google Password Manager.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey prompt was closed or isn't available here. Try again, and make sure the page is on https or localhost.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser can't run passkeys. Update it or try another browser.";
      default:
        return `Passkey error: ${e.message}`;
    }
  }
  return String(e?.message || e);
}

export function passkeysSupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && window.isSecureContext;
}
