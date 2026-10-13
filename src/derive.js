import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * Turn a passkey's 32-byte PRF output into an EVM private key.
 *
 * PRF output -> 24-word BIP-39 mnemonic -> seed -> m/44'/60'/0'/0/{index}.
 * Using the standard path keeps the account portable: the same mnemonic
 * imports into MetaMask or Rabby and lands on the same address.
 */
export function deriveEvmPrivateKey(prfOutput, index = 0) {
  if (!(prfOutput instanceof Uint8Array) || prfOutput.length !== 32) {
    throw new Error("Expected 32 bytes of passkey PRF output");
  }
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  const key = Uint8Array.from(node.privateKey);
  seed.fill(0);
  node.wipePrivateData?.();
  return key;
}
