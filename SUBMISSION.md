# Paste-ready submission text

## Project name

Landfall

## Live app

https://landfall-kohl.vercel.app (open on a phone; passkeys are bound to this domain)

## One-line description

Send dollars across borders with a passkey: AUSD on Monad, settled in about a second and a half.

## Core features (Agora field: how the app lets a user send AUSD to another person or across borders)

Landfall is a mobile payments app for sending dollars home. Sign-up is one fingerprint: Mera turns a passkey into an EVM account on Monad, so there's no seed phrase, no app store download and no custody service.

Once in, you see your AUSD balance. To send, paste the recipient's address or a pay link they shared on WhatsApp, enter an amount and tap Send. The transfer settles on Monad and the app shows how long it took, about 1.5 seconds in our tests. The recipient's screen shows "You received $25.00" as soon as it lands.

Senders can also pay with a different stablecoin. Agora's Instant Settlement pair converts it, and the recipient receives AUSD in the same transaction, using swapExactTokensForTokens with the recipient as the `to` address. The send screen shows Agora's live rate before you confirm.

To get paid, open Receive for a QR code and a pay link. Opening the link drops the payer onto a filled-in Send screen.

Built on Monad testnet against Agora's published contracts: AUSD, the AUSD faucet and the AUSD/CTK Instant Settlement pair.

## Mera UX bounty field: how Mera is the entire account layer

Landfall has no other account system. No wallet extension, no email or OTP, no seed phrase, no key server.

Sign-up is one tap and one passkey ceremony. Mera's PRF output becomes a standard EVM account (BIP-39 → m/44'/60'/0'/0/0), and our gas top-up covers the new account's first fees, so the first confirmed Monad transaction is two taps from the landing page. The app measures and shows that time.

One passkey check opens a signing session built on Mera's secp256k1 session and viem adapter. Inside it, sends are prompt-free up to $100 or 15 minutes, and the home screen shows what's left. A larger send says "Confirm with: Fingerprint" before you tap, runs one passkey check, verifies it's the same account and opens a fresh session. When time runs out, the key is zeroed with session.end() and the unlock screen says why.

Stateless test: clear site data or open Landfall on another device, tap "I already have an account", and the same account and balance come back from the passkey alone. Local storage only caches the credential ID and a device-only activity list.

Composability: Mera accounts drive gas sponsorship, Agora's AUSD and Agora's Instant Settlement.

## Notes for judges

- Instant Settlement swaps need Agora's APPROVED_SWAPPER role. [Edit this line: either "Our demo account is approved and the video shows a live swap", or "We requested approval; until it's granted the app shows the live Agora rate and sends AUSD directly."]
- Passkeys need https; the hosted version works on iOS 18+ and Android with Google Password Manager.
