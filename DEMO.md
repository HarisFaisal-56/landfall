# Demo video (under 2 minutes)

One video covers both bounties.

- **Agora** wants: passkey onboarding, an AUSD balance, a send/receive settled instantly.
- **Mera UX** wants: fast time to first transaction, prompt-free signing with a clear session, and the stateless test.

## Setup (before recording)

1. Deploy to Vercel with `FUNDER_PRIVATE_KEY` set (see README), so new accounts get fees automatically.
2. Two devices:
   - **Sender:** your phone, recorded with the built-in screen recorder.
   - **Receiver:** a second phone, or a laptop with Safari or Chrome (Google Password Manager).
3. On the receiver, create an account now. Open Receive and copy the pay link; send it to the sender phone (WhatsApp to yourself works).
4. On the sender, don't create the account yet. Do one practice run first, then clear the site's data so the welcome screen shows again. The practice passkey stays on the phone; that's fine.

## Script

**0:00 Welcome.** "My cousin works in Dubai and sends money home every month. Landfall makes that a fingerprint."

**0:06 One-tap sign-up.** Tap Create account, approve with your fingerprint. "That's the whole signup: one passkey, through Mera. No seed phrase, no app store, no email code."

**0:15 First transaction.** "Covered" appears next to network fees on its own. Tap Get test AUSD. The balance becomes $1,000.00 and the banner says "First transaction confirmed in X s after you opened Landfall." "Two taps from landing to a confirmed Monad transaction."

**0:30 Send, no prompt.** Point at "Fingerprint-free for 15 min or $100 more." Tap Send, paste the pay link: address and amount fill in. "Confirm with: Nothing, you're inside your session." Tap Send.

**0:45 Settled.** "Settled in 0.x s." Tap the receipt for two seconds.

**0:52 Receive.** Cut to the receiver: "You received $25.00." "She has it before I've put the phone down."

**1:02 Over the limit.** Send $120 (or pay with CTK through Agora if your account is approved). The form says "Confirm with: Fingerprint." Tap Send, fingerprint, done. "Small sends are instant. Big ones ask again."

**1:20 Stateless test.** On the sender: phone settings → clear this site's data, or open the link in a private tab. Tap "I already have an account", fingerprint. Same address, same balance. "Nothing stored on the phone or on a server. The passkey is the account."

**1:40 Close.** "Landfall. Dollars across borders with a passkey, settled on Monad in about a second and a half. Money, landed."

## If something breaks on camera

- "Network fees aren't covered": check `FUNDER_PRIVATE_KEY` in Vercel and that the wallet has MON.
- Passkey error on a laptop: use Safari, or Chrome signed in to Google Password Manager.
- The AUSD faucet may have a cooldown; fund the sender from the receiver's practice account if needed.
- Private/incognito tabs may not see passkeys on some phones. Clearing site data is the safer stateless demo.
