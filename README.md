# Landfall

Money, landed. Send dollars home with your fingerprint.

Landfall is a mobile payments app on Monad. The name is the moment money crosses the water and arrives. You sign up with a passkey, hold AUSD, and send it to anyone with an address or a pay link. It arrives in about a second. There's nothing to install from an app store and no seed phrase.

Built for Monad Metropolis, **Consumer Products & Payments** track, targeting the **Agora Cross-Border Payments** and **Best Mera-Powered UX** bounties.

## What it does

- **Passkey onboarding with Mera.** "Create account" is one tap and one Face ID / fingerprint prompt. No form fields. Mera returns the passkey's PRF output, which we turn into a standard EVM account (BIP-39 → `m/44'/60'/0'/0/0`). No smart-account contract, no custody service, no key stored on any server. Signing in on another device with the same synced passkey restores the same account.
- **AUSD balance.** The home screen shows the account's real AUSD balance on Monad testnet, read from Agora's token contract every two seconds.
- **Send.** Paste an address or a Landfall pay link, enter an amount, tap Send. The app times the transfer from submit to receipt and shows it ("Settled in 0.84 s").
- **Instant Settlement.** You can also pay with another stablecoin (CTK on testnet). Agora's Instant Settlement pair swaps it and delivers AUSD straight to the recipient in the same transaction (`swapExactTokensForTokens` with `to = recipient`). The send screen shows Agora's live rate from `getAmountsOut`.
- **Receive.** A QR code and a pay link (`?to=0x…&amount=25`) you can share on WhatsApp. Opening the link takes the payer straight to a filled-in Send screen, after signing in if needed.
- **Received notification.** The receiver's screen shows "You received $25.00" as soon as the transfer lands, with no refresh.

## Mera as the whole account layer

Mera is the only account system. There's no wallet extension, no email/OTP, no seed phrase and no server that holds keys.

- **Time to first transaction.** Landing → tap Create account → fingerprint → the app's `/api/drip` function covers the new account's first network fees → tap Get test AUSD → confirmed. Two taps and one fingerprint. The app shows the measured time ("First transaction confirmed 4.1 s after you opened Landfall").
- **Session design.** One passkey check opens a signing session. Inside it, sends are prompt-free up to **$100 or 15 minutes**, whichever comes first. The home screen shows what's left ("No fingerprint needed for 12 min or $75 more"). A send above the limit shows "Confirm with: Fingerprint" before you tap, runs one passkey check, confirms it's the same account, and starts a fresh session. When 15 minutes pass, the signing key is zeroed (`session.end()`) and the app explains why it's asking you to unlock. "Lock now" ends it early.
- **Stateless test.** Clear site data or open Landfall on a new device, tap "I already have an account", and the same account comes back from the passkey alone. The only thing kept in local storage is the passkey's credential ID, which saves one picker step, and a device-only activity list. Balances always come from the chain.
- **Stack composability.** Gas sponsorship (`api/drip.js`) plus Agora's Instant Settlement and AUSD, all driven by Mera-derived accounts. Accounts use the standard BIP-44 path, so the same passkey's mnemonic would import into MetaMask or Rabby.

Settings: `VITE_SESSION_MINUTES` and `VITE_SESSION_LIMIT_USD` change the session window.

## Why Monad and AUSD

Families sending money home care about two things: what arrives and when. Monad blocks are around 400 ms, so a transfer settles before the sender puts the phone down. AUSD is a dollar stablecoin, so the recipient holds dollars rather than a volatile token. Passkeys remove the step where most people give up on crypto apps, which is writing down 24 words.

The business model we'd test first: a small spread on the Instant Settlement conversion, paid by the sender and shown upfront, against bank and transfer-service fees that are often several percent plus a multi-day wait.

## Where the integrations live

| | File |
| --- | --- |
| Mera passkey create / sign-in | `src/passkey.js` |
| PRF → EVM key derivation | `src/derive.js` |
| AUSD balance, transfer, faucet | `src/chain.js` |
| Agora Instant Settlement quote + swap, approval check | `src/chain.js` (`agoraRate`, `quoteOtherToAusd`, `sendViaInstantSettlement`) |
| Agora addresses (Monad testnet) | `src/config.js` |

Agora contracts used (Monad testnet, from docs.agora.finance):

- AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`
- AUSD faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`
- Instant Settlement pair (AUSD/CTK) `0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae`

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Passkeys need https, or localhost on the same machine. To use a phone, deploy (below) and open the https URL.

Desktop browsers: Safari with iCloud Keychain, or Chrome with Google Password Manager. Other password managers may not support the PRF extension that Mera needs; the app says so if that happens.

### Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On vercel.com: Add New → Project → import the repo. Vercel detects Vite.
3. Before deploying, open Environment Variables and add `FUNDER_PRIVATE_KEY`: a testnet-only wallet with some MON from faucet.monad.xyz. It pays new users' first fees (0.05 MON each, only for empty accounts; change with `DRIP_MON`). Click Deploy.
4. Open the https URL on your phone. Optionally Add to Home Screen; it installs like an app.

Without `FUNDER_PRIVATE_KEY` the app still works; new users see a link to the MON faucet instead.

For local dev, put `FUNDER_PRIVATE_KEY=0x…` in `.env.local` and `npm run dev` serves the same `/api/drip`.

Or from the folder: `npx vercel --prod`.

### Helper scripts

```bash
# Is the Instant Settlement pair live, and is my account approved to swap?
npm run check-agora -- 0xYourAddress

# Give demo accounts MON for fees and test AUSD, from one funded testnet wallet
FUNDER_PRIVATE_KEY=0x... npm run fund -- 0xSender 0xReceiver
```

Only the sender needs MON. Receiving costs nothing.

## Known limits

- Testnet only. Test dollars, not money.
- Swapping through Instant Settlement requires Agora to grant the account the `APPROVED_SWAPPER` role. Until then the CTK option is shown but disabled, the live rate still displays, and sends go out as direct AUSD transfers.
- Gas top-up is a simple funded endpoint that only pays empty accounts. A production version would use a paymaster with real abuse limits.
- Activity history is stored on the device; balances always come from the chain.
- Mera is in preview, and this app has not had a security review.

## Architecture

```
 phone / browser (React + Vite, no backend for signing)
 ├─ Mera: passkey (WebAuthn PRF)  →  32 bytes  →  BIP-39 → m/44'/60'/0'/0/0  →  EVM key (in memory only)
 ├─ viem                          →  reads balances, quotes, sends transactions to Monad testnet RPC
 └─ /api/drip (Vercel function)   →  tops up gas for brand-new, empty accounts

 Monad testnet
 ├─ AUSD token (Agora)            →  balance reads, transfers
 ├─ AUSD faucet (Agora)           →  test dollars
 └─ Instant Settlement pair       →  swap another stablecoin and deliver AUSD to the recipient in one transaction
```

The private key exists only inside a Mera signing session in browser memory. It is never sent to a server and never written to storage. When the session ends, `session.end()` zeroes it. The one server piece is `api/drip.js`, which holds a testnet-only funding key and sends a small amount of MON to empty accounts. It never sees a user's key.

This project deploys no contracts of its own. It uses Agora's published Monad testnet contracts (addresses above).

## Monad integration

- Chain: Monad testnet (chain ID 10143, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadvision.com`).
- Every send is a Monad transaction. The app measures submit-to-receipt time and shows it, and each receipt links to MonadVision.
- Why Monad: sub-second finality is what makes "money lands before you put the phone down" true. Balance polling every 2 seconds also works because blocks are around 400 ms apart.
- Contracts used: AUSD, AUSD faucet and Instant Settlement pair, all listed under "Agora contracts used".

## Tech stack

React 18, Vite, viem, `@category-labs/mera` (passkey accounts), `@scure/bip32` and `@scure/bip39` (key derivation), `qrcode`, and a Vercel serverless function. Test tooling: Playwright with Chromium virtual authenticators, and Hardhat for local stand-in contracts.

## AI use and attribution

This project was built with AI coding assistance (Claude, by Anthropic). The AI wrote and revised most of the code and documentation under the direction of the author, who chose the product, tracks and bounties, and tested the result.

Nothing in this repo was copied from a pre-existing product. External pieces are open-source libraries listed in `package.json` (Mera by Category Labs, viem, React, Vite, @scure, qrcode), and Agora's published testnet contracts and ABIs, used through their public addresses.

## License

MIT. See `LICENSE`.

## Testing

The full flow was run in Chromium with WebAuthn virtual authenticators (PRF enabled) against a local chain with stand-ins matching Agora's contract interfaces. Checked: one-tap sign-up, automatic gas top-up, time-to-first-transaction, prompt-free send inside the session (zero passkey assertions), over-limit send triggering exactly one passkey check, Instant Settlement send, the receiver's notification, clearing storage and recovering the same account, session expiry after 15 minutes, and opening a pay link while signed out.
