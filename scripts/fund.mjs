// Give demo accounts what they need, from one funded testnet wallet:
// a little MON for fees, plus test AUSD from Agora's faucet.
//
//   FUNDER_PRIVATE_KEY=0x... npm run fund -- 0xSender 0xReceiver
//   MON_AMOUNT=0.2 to change how much MON each gets (default 0.1).
import { createPublicClient, createWalletClient, http, isAddress, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const key = process.env.FUNDER_PRIVATE_KEY;
if (!key) {
  console.error("Set FUNDER_PRIVATE_KEY to a testnet-only wallet that holds some MON.");
  process.exit(1);
}
const targets = process.argv.slice(2).filter((a) => isAddress(a));
if (!targets.length) {
  console.error("Pass one or more addresses: npm run fund -- 0xabc... 0xdef...");
  process.exit(1);
}

const RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const FAUCET = process.env.AUSD_FAUCET || "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const amount = parseEther(process.env.MON_AMOUNT || "0.1");

const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
const faucetAbi = parseAbi(["function requestFunds(address _receiver)"]);

console.log(`Funder ${account.address}: ${Number(await pub.getBalance({ address: account.address })) / 1e18} MON`);
for (const to of targets) {
  const h1 = await wallet.sendTransaction({ to, value: amount });
  await pub.waitForTransactionReceipt({ hash: h1 });
  console.log(`  ${to}: +${process.env.MON_AMOUNT || "0.1"} MON`);
  try {
    const h2 = await wallet.writeContract({ address: FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [to] });
    const rc = await pub.waitForTransactionReceipt({ hash: h2 });
    console.log(`  ${to}: AUSD faucet ${rc.status === "success" ? "ok" : "reverted (cooldown?)"}`);
  } catch (e) {
    console.log(`  ${to}: AUSD faucet failed: ${e.shortMessage || e.message}`);
  }
}
