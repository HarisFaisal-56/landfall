// Check Agora's Instant Settlement pair on Monad testnet and whether a wallet
// is approved to swap through it.
//
//   npm run check-agora                 # pair status + approved swappers
//   npm run check-agora -- 0xYourAddr   # also: is this address approved?
import { createPublicClient, http, parseAbi, formatUnits, isAddress } from "viem";
import { monadTestnet } from "viem/chains";

const RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const AUSD = process.env.AUSD_ADDRESS || "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const PAIRS = (process.env.AGORA_PAIR ? [process.env.AGORA_PAIR] : [
  "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae", // docs.agora.finance protocol-deployments
  "0x237591AaF2FCCb34464Ceae9EeA1eb6f375843AF", // agora-finance/stable-swap-examples
]);
const who = process.argv[2];

const client = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
const erc20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"]);
const pair = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function isPaused() view returns (bool)",
  "function hasRole(string, address) view returns (bool)",
  "function getRoleMembers(string) view returns (address[])",
]);
const r = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });

console.log(`RPC ${RPC} (chain ${await client.getChainId()})`);
const ausdCode = await client.getCode({ address: AUSD });
console.log(`AUSD ${AUSD}: ${ausdCode && ausdCode !== "0x" ? "deployed" : "NOT FOUND"}`);

for (const p of PAIRS) {
  console.log(`\nPair ${p}`);
  const code = await client.getCode({ address: p });
  if (!code || code === "0x") {
    console.log("  no contract at this address on Monad testnet");
    continue;
  }
  try {
    const [t0, t1, paused] = await Promise.all([r(p, pair, "token0"), r(p, pair, "token1"), r(p, pair, "isPaused").catch(() => "?")]);
    const [s0, s1] = await Promise.all([r(t0, erc20, "symbol").catch(() => "?"), r(t1, erc20, "symbol").catch(() => "?")]);
    console.log(`  token0 ${s0} ${t0}\n  token1 ${s1} ${t1}\n  paused: ${paused}`);
    const members = await r(p, pair, "getRoleMembers", ["APPROVED_SWAPPER"]).catch(() => null);
    if (members) console.log(`  approved swappers (${members.length}): ${members.slice(0, 10).join(", ")}${members.length > 10 ? " …" : ""}`);
    if (who && isAddress(who)) {
      const ok = await r(p, pair, "hasRole", ["APPROVED_SWAPPER", who]);
      console.log(`  ${who} approved: ${ok ? "YES" : "no"}`);
      for (const t of [t0, t1]) {
        const [b, d, s] = await Promise.all([r(t, erc20, "balanceOf", [who]), r(t, erc20, "decimals"), r(t, erc20, "symbol").catch(() => "?")]);
        console.log(`  ${s} balance: ${formatUnits(b, d)}`);
      }
    }
  } catch (e) {
    console.log(`  could not read pair: ${e.shortMessage || e.message}`);
  }
}
