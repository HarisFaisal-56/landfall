import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { parseUnits } from "viem";
import { APP_NAME, MON_FAUCET, SESSION_LIMIT_USD, SESSION_MINUTES, addressUrl, txUrl } from "./config";
import { createAccount, forgetCredential, passkeyError, passkeysSupported, savedCredential, signIn } from "./passkey";
import {
  agoraRate,
  faucetWait,
  loadBalances,
  loadTokens,
  quoteOtherToAusd,
  requestGasTopUp,
  requestTestAusd,
  sendAusd,
  sendViaInstantSettlement,
  walletFor,
} from "./chain";
import { FAUCET_BUSY, cleanAmount, duration, friendlyError, money, parseAmount, parseRecipient, payLink, seconds, shortAddr } from "./format";

const SESSION_MS = SESSION_MINUTES * 60 * 1000;

/* ---------------------------------------------------------------- utils */

// Read the pay link once at load, outside React, so re-renders can't lose it.
const PAY_LINK_AT_LOAD = (() => {
  const found = parseRecipient(window.location.href);
  if (found) window.history.replaceState(null, "", window.location.pathname);
  return found;
})();

function activityKey(addr) {
  return `landfall.activity.${addr.toLowerCase()}`;
}
function loadActivity(addr) {
  try {
    return JSON.parse(localStorage.getItem(activityKey(addr)) || "[]");
  } catch {
    return [];
  }
}
function storeActivity(addr, list) {
  try {
    localStorage.setItem(activityKey(addr), JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

/** Re-render every `ms`. */
function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function minutesLeft(auth) {
  return Math.max(0, Math.ceil((auth.startedAt + SESSION_MS - Date.now()) / 60000));
}

/* ---------------------------------------------------------------- icons */

const Icon = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);
const ArrowUpRight = () => <Icon d={<path d="M7 17 17 7M9 7h8v8" />} />;
const ArrowDownLeft = () => <Icon d={<path d="M17 7 7 17M15 17H7V9" />} />;
const Drop = () => <Icon d={<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z" />} />;
const ChevronLeft = () => <Icon d={<path d="m15 18-6-6 6-6" />} />;
const Fingerprint = () => (
  <Icon
    d={
      <path d="M12 11v3.5M8.5 8.6A5 5 0 0 1 17 12v1.5M7 12v1a5 5 0 0 0 .6 2.4M17 16.5a9 9 0 0 1-1 2.5M12 7a5 5 0 0 0-1.3.2M4.5 9.5A8 8 0 0 1 19.6 9M4 14a8 8 0 0 0 .5 2.5M10 14v.5a6 6 0 0 0 1.5 4" />
    }
  />
);

/** The logo: an arc landing on a horizon. */
function Mark({ className = "mark" }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="lf-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efdcb6" />
          <stop offset="1" stopColor="#b39461" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="#161619" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
      <path d="M128 304 C 176 168, 296 150, 364 304" fill="none" stroke="url(#lf-gold)" strokeWidth="30" strokeLinecap="round" />
      <circle cx="364" cy="304" r="27" fill="url(#lf-gold)" />
      <path d="M104 372 H408" stroke="#f2efe9" strokeWidth="26" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      <Mark />
      {APP_NAME}
    </span>
  );
}

/** "$9,945.00" with the currency sign and cents set smaller, the way bank cards print them. */
function Amount({ text }) {
  const m = /^(\$)?(.*?)(\.\d+)?$/.exec(text) || [];
  return (
    <>
      {m[1] && <span className="cur">{m[1]}</span>}
      {m[2]}
      {m[3] && <span className="dec">{m[3]}</span>}
    </>
  );
}

/* -------------------------------------------------------------- welcome */

function Welcome({ pending, notice, onReady }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const hasSaved = !!savedCredential();
  const supported = passkeysSupported();

  async function go(kind) {
    setBusy(kind);
    setError("");
    try {
      const res = kind === "create" ? await createAccount() : await signIn();
      onReady(res, kind);
    } catch (e) {
      setError(passkeyError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="shell welcome">
      <header className="bar">
        <Wordmark />
      </header>

      <section className="intro">
        <svg className="horizon" viewBox="0 0 300 96" aria-hidden="true">
          <defs>
            <linearGradient id="lf-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#d6bc8e" stopOpacity="0" />
              <stop offset="0.5" stopColor="#efdcb6" />
              <stop offset="1" stopColor="#b39461" />
            </linearGradient>
          </defs>
          <path className="arc" d="M14 78 C 70 2, 190 2, 238 78" fill="none" stroke="url(#lf-arc)" strokeWidth="2" strokeLinecap="round" />
          <circle className="land" cx="238" cy="78" r="5" fill="#d6bc8e" />
          <circle className="land" cx="238" cy="78" r="12" fill="none" stroke="#d6bc8e" strokeOpacity="0.3" />
          <path d="M0 90 H300" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        </svg>
        <p className="eyebrow">Money, landed</p>
        <h1>
          Send dollars home with your <em>fingerprint.</em>
        </h1>
        <p className="lede">
          Your account is a passkey on this phone. No app to install, no seed phrase to write down. Money arrives in
          a couple of seconds.
        </p>
        <dl className="facts">
          <div>
            <dt>Passkey</dt>
            <dd>No seed phrase</dd>
          </div>
          <div>
            <dt>≈ 1.5 s</dt>
            <dd>To settle on Monad</dd>
          </div>
          <div>
            <dt>AUSD</dt>
            <dd>Dollars by Agora</dd>
          </div>
          <div>
            <dt>Gas covered</dt>
            <dd>For your first sends</dd>
          </div>
        </dl>
        {notice && <p className="pending">{notice}</p>}
        {pending && (
          <p className="pending">
            Someone asked you to pay {pending.amount ? `$${pending.amount}` : ""} to {shortAddr(pending.to)}. Sign in
            to continue.
          </p>
        )}
      </section>

      {!supported && (
        <p className="error" role="alert">
          Passkeys need a secure page. Open this over https (or localhost on this computer).
        </p>
      )}

      <section className="entry">
        {hasSaved ? (
          <button className="primary" disabled={!!busy || !supported} onClick={() => go("signin")}>
            <Fingerprint />
            {busy === "signin" ? "Waiting for your passkey…" : "Unlock with passkey"}
          </button>
        ) : (
          <button className="primary" disabled={!!busy || !supported} onClick={() => go("create")}>
            <Fingerprint />
            {busy === "create" ? "Waiting for your passkey…" : "Create account"}
          </button>
        )}
        <button
          className="quiet"
          disabled={!!busy || !supported}
          onClick={() => (hasSaved ? (forgetCredential(), go("create")) : go("signin"))}
        >
          {hasSaved ? "Create a new account instead" : "I already have an account"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="fine">Runs on Monad testnet with test dollars. Nothing here is real money.</p>
      </section>
    </main>
  );
}

/* ----------------------------------------------------------------- home */

function SessionChip({ auth, tokens, onLock }) {
  useTick(15000);
  const d = tokens?.ausdDecimals ?? 6;
  const limit = parseUnits(String(SESSION_LIMIT_USD), d);
  const left = limit > auth.spent ? limit - auth.spent : 0n;
  return (
    <p className="session">
      <span>
        <i className="pulse" aria-hidden="true" />
        Fingerprint-free for {minutesLeft(auth)} min or ${money(left, d, 0)} more
      </span>
      <button className="link" onClick={onLock}>
        Lock now
      </button>
    </p>
  );
}

function Home({ auth, me, tokens, bal, gas, activity, toast, onSend, onReceive, onFaucet, busy, onLock }) {
  const d = tokens?.ausdDecimals ?? 6;
  const needsMon = bal && bal.mon === 0n;
  const needsAusd = bal && bal.ausd === 0n;
  return (
    <main className="shell">
      <header className="bar">
        <Wordmark />
        <span className="chip">
          <i className="dot" aria-hidden="true" />
          {shortAddr(me)}
        </span>
      </header>

      <SessionChip auth={auth} tokens={tokens} onLock={onLock} />

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}

      <section className="hero">
        <div className="balance-card">
          <div className="card-top">
            <p className="label">Your balance</p>
            <span className="network">Monad</span>
          </div>
          {(() => {
            const text = bal ? `$${money(bal.ausd, d)}` : "…";
            return (
              <p className="big" aria-live="polite" style={{ "--chars": text.length }}>
                <Amount text={text} />
              </p>
            );
          })()}
          <p className="sub">{tokens?.ausdSymbol ?? "AUSD"}, a US dollar stablecoin by Agora, on Monad</p>
        </div>
        <div className="pair-actions">
          <button className="primary" onClick={onSend} disabled={!bal}>
            <ArrowUpRight />
            Send
          </button>
          <button className="ghost" onClick={onReceive}>
            <ArrowDownLeft />
            Receive
          </button>
        </div>
      </section>

      {(needsMon || needsAusd) && (
        <section className="setup">
          <div className="section-head">
            <h2 className="eyebrow">Before your first send</h2>
          </div>
          <ol>
            <li className={needsMon ? "" : "done"}>
              <span>{gas === "topping" ? "Covering your first network fees…" : "Network fees (MON)"}</span>
              {!needsMon ? (
                <span className="tick">Covered</span>
              ) : gas === "topping" ? null : (
                <span className="setup-actions">
                  <a className="ghost small" href={MON_FAUCET} target="_blank" rel="noreferrer">
                    Open MON faucet
                  </a>
                  <button className="link" onClick={() => navigator.clipboard?.writeText(me).catch(() => {})}>
                    Copy my address
                  </button>
                </span>
              )}
            </li>
            <li className={needsAusd ? "" : "done"}>
              <span>Get test AUSD from Agora's faucet.</span>
              {needsAusd ? (
                <button className="ghost small" onClick={onFaucet} disabled={!!busy || needsMon}>
                  {busy === "faucet" ? "Requesting…" : "Get test AUSD"}
                </button>
              ) : (
                <span className="tick">Done</span>
              )}
            </li>
          </ol>
        </section>
      )}

      <section className="activity">
        <div className="section-head">
          <h2 className="eyebrow">Activity on this device</h2>
        </div>
        {activity.length === 0 ? (
          <p className="empty">Nothing yet. Money you send or receive shows up here. Your balance always comes from the chain.</p>
        ) : (
          <ul>
            {activity.map((a) => (
              <li key={a.id}>
                <span className={`a-icon ${a.type === "out" ? "" : "in"}`}>
                  {a.type === "out" ? <ArrowUpRight /> : a.type === "faucet" ? <Drop /> : <ArrowDownLeft />}
                </span>
                <span className="a-main">
                  {a.type === "out" ? `Sent to ${shortAddr(a.to)}` : a.type === "faucet" ? "Test AUSD from faucet" : "Received"}
                  {a.ms != null && (
                    <em>
                      Settled in {seconds(a.ms)}
                      {a.via === "agora" ? " via Agora Instant Settlement" : ""}
                    </em>
                  )}
                </span>
                <span className={`a-amt ${a.type === "out" ? "" : "in"}`}>
                  {a.type === "out" ? "−" : "+"}${a.amount}
                  {a.hash && (
                    <a href={txUrl(a.hash)} target="_blank" rel="noreferrer">
                      Receipt
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ----------------------------------------------------------------- send */

function Send({ auth, tokens, bal, prefill, onBack, onSubmit, busy }) {
  const d = tokens.ausdDecimals;
  const pair = tokens.pair;
  const [to, setTo] = useState(prefill?.to || "");
  const [amount, setAmount] = useState(cleanAmount(prefill?.amount));
  const [via, setVia] = useState("ausd");
  const [rate, setRate] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  const canAgora = !!pair && !pair.paused && bal.approved && bal.other > 0n;

  useEffect(() => {
    if (!pair) return;
    agoraRate(tokens).then(setRate).catch(() => setRate(null));
  }, [pair, tokens]);

  const units = parseAmount(amount, via === "agora" ? pair?.otherDecimals ?? d : d);

  useEffect(() => {
    let off = false;
    setQuote(null);
    if (via !== "agora" || !units) return;
    const t = setTimeout(() => {
      quoteOtherToAusd(tokens, units)
        .then((q) => !off && setQuote(q))
        .catch(() => !off && setQuote(null));
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [via, units, tokens]);

  function onToChange(v) {
    const parsed = parseRecipient(v);
    if (parsed && parsed.to !== v.trim()) {
      setTo(parsed.to);
      if (parsed.amount) setAmount(cleanAmount(parsed.amount));
    } else setTo(v.trim());
  }

  const receives = via === "agora" ? quote : units;
  const limit = parseUnits(String(SESSION_LIMIT_USD), d);
  const needsConfirm = receives != null && (auth.spent + receives > limit || minutesLeft(auth) === 0);

  function submit(e) {
    e.preventDefault();
    setError("");
    const r = parseRecipient(to);
    if (!r) return setError("Paste their Landfall address or pay link. Addresses start with 0x.");
    if (r.to.toLowerCase() === bal.me.toLowerCase()) return setError("That's your own address. Pick someone else.");
    if (!units) return setError("Enter an amount, like 25 or 12.50.");
    const have = via === "agora" ? bal.other : bal.ausd;
    if (units > have) return setError(`You have $${money(have, via === "agora" ? pair.otherDecimals : d)}. Lower the amount.`);
    if (bal.mon === 0n) return setError("Network fees aren't covered yet. Wait a moment or use the MON faucet on the home screen.");
    if (via === "agora" && quote == null) return setError("Getting Agora's quote. Try again in a second.");
    onSubmit({ to: r.to, units, via, value: receives });
  }

  return (
    <main className="shell">
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Back to home">
          <ChevronLeft />
          Home
        </button>
      </header>

      <form className="sheet" onSubmit={submit} noValidate>
        <h1>Send dollars</h1>
        <label className="field">
          To
          <input
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            placeholder="0x… address or pay link"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
        </label>
        <label className="field">
          Amount
          <span className="money-input">
            <span aria-hidden="true">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value))}
              placeholder="25"
              inputMode="decimal"
              autoComplete="off"
            />
          </span>
        </label>

        <fieldset className="via">
          <legend>Pay with</legend>
          <label className={`opt ${via === "ausd" ? "on" : ""}`}>
            <input type="radio" name="via" checked={via === "ausd"} onChange={() => setVia("ausd")} />
            <span>
              <strong>AUSD balance</strong>
              <em>${money(bal.ausd, d)} available</em>
            </span>
          </label>
          {pair && (
            <label className={`opt ${via === "agora" ? "on" : ""} ${canAgora ? "" : "off"}`}>
              <input type="radio" name="via" disabled={!canAgora} checked={via === "agora"} onChange={() => setVia("agora")} />
              <span>
                <strong>{pair.otherSymbol}, converted by Agora</strong>
                <em>
                  {canAgora
                    ? `${money(bal.other, pair.otherDecimals)} ${pair.otherSymbol} available. Agora Instant Settlement swaps it and they receive AUSD in the same transaction.`
                    : pair.paused
                      ? "Agora's pair is paused right now."
                      : !bal.approved
                        ? "Waiting for Agora to approve this account for Instant Settlement."
                        : `No ${pair.otherSymbol} in this account.`}
                </em>
              </span>
            </label>
          )}
        </fieldset>

        <div className="summary">
          <p>
            <span>They receive</span>
            <strong>{receives ? `$${money(receives, d)} AUSD` : "—"}</strong>
          </p>
          {pair && rate != null && (
            <p className="rate">
              <span>Agora rate now</span>
              <span>
                1 {pair.otherSymbol} = {money(rate, d, 4)} AUSD
              </span>
            </p>
          )}
          <p className="rate">
            <span>Confirm with</span>
            <span>{needsConfirm ? `Fingerprint (over this session's $${SESSION_LIMIT_USD})` : "Nothing, you're inside your session"}</span>
          </p>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={!!busy}>
          {busy === "confirm" ? <Fingerprint /> : <ArrowUpRight />}
          {busy === "confirm"
            ? "Confirm with your passkey…"
            : busy === "send"
              ? "Sending…"
              : units
                ? `Send $${amount.replace(/^\$/, "")}`
                : "Send"}
        </button>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ sent */

function Sent({ result, tokens, onDone }) {
  return (
    <main className="shell sent">
      <section className="hero">
        <span className="badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="label">Sent to {shortAddr(result.to)}</p>
        <p className="big" style={{ "--chars": `$${money(result.received, tokens.ausdDecimals)}`.length }}>
          <Amount text={`$${money(result.received, tokens.ausdDecimals)}`} />
        </p>
        <p className="settled">
          Settled in <strong>{seconds(result.ms)}</strong>
        </p>
        <p className="sub">
          {result.via === "agora"
            ? "Paid in " + tokens.pair.otherSymbol + ". Agora Instant Settlement converted it and delivered AUSD in one transaction."
            : "Delivered as AUSD. It's in their balance already."}
        </p>
        <p className="links">
          <a href={txUrl(result.hash)} target="_blank" rel="noreferrer">
            View the receipt on MonadVision
            <ArrowUpRight />
          </a>
        </p>
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </section>
    </main>
  );
}

/* --------------------------------------------------------------- receive */

function Receive({ me, onBack }) {
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState("");
  const link = useMemo(() => payLink(me, parseAmount(amount, 6) ? amount.replace(/[$,\s]/g, "") : ""), [me, amount]);

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 0, width: 520, color: { dark: "#0C0C0E", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [link]);

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: `Pay me with ${APP_NAME}`,
        text: amount ? `Send me $${amount} with ${APP_NAME}` : `Send me money with ${APP_NAME}`,
        url: link,
      });
    } catch {
      /* closed */
    }
  }

  return (
    <main className="shell">
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Back to home">
          <ChevronLeft />
          Home
        </button>
      </header>
      <section className="sheet receive">
        <h1>Get paid</h1>
        <p className="hint">Show this code, or send the link on WhatsApp. It opens Landfall with your details filled in.</p>
        {qr && (
          <div className="qr-frame">
            <img className="qr" src={qr} alt="QR code with your pay link" width="260" height="260" />
          </div>
        )}
        <label className="field">
          Ask for an amount (optional)
          <span className="money-input">
            <span aria-hidden="true">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value))}
              placeholder="25"
              inputMode="decimal"
              autoComplete="off"
            />
          </span>
        </label>
        <div className="row-actions">
          {typeof navigator !== "undefined" && navigator.share && (
            <button className="primary" onClick={share}>
              <ArrowUpRight />
              Share pay link
            </button>
          )}
          <button className="ghost" onClick={() => copy(link, "link")}>
            {copied === "link" ? "Link copied" : "Copy pay link"}
          </button>
        </div>
        <p className="addr">
          <a href={addressUrl(me)} target="_blank" rel="noreferrer">
            {me}
          </a>
          <button className="link" onClick={() => copy(me, "addr")}>
            {copied === "addr" ? "Copied" : "Copy address"}
          </button>
        </p>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------- app */

export default function App() {
  const [pending, setPending] = useState(PAY_LINK_AT_LOAD);
  // auth: { account, session, startedAt, spent, fresh }
  const [auth, setAuth] = useState(null);
  const [notice, setNotice] = useState("");
  const [screen, setScreen] = useState("home");
  const [tokens, setTokens] = useState(null);
  const [bal, setBal] = useState(null);
  const [gas, setGas] = useState("idle");
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sent, setSent] = useState(null);
  const lastAusd = useRef(null);
  const expectingFaucet = useRef(false);
  const firstTxShown = useRef(false);

  const me = auth?.account.address;
  const wallet = useMemo(() => (auth ? walletFor(auth.account) : null), [auth?.account]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((text, ms = 5000) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? "" : t)), ms);
  }, []);

  const record = useCallback(
    (entry) => {
      setActivity((prev) => {
        const next = [{ id: `${Date.now()}-${Math.random()}`, ...entry }, ...prev];
        if (me) storeActivity(me, next);
        return next;
      });
    },
    [me]
  );

  /** Time-to-first-transaction, measured from when this page started loading. */
  const noteFirstTx = useCallback(() => {
    if (firstTxShown.current || !auth?.fresh) return;
    firstTxShown.current = true;
    showToast(`First transaction confirmed ${seconds(performance.now())} after you opened ${APP_NAME}.`, 7000);
  }, [auth?.fresh, showToast]);

  useEffect(() => {
    if (!me) return;
    setActivity(loadActivity(me));
    lastAusd.current = null;
    setGas("idle");
  }, [me]);

  // Token metadata. Retry until it loads: one RPC hiccup at startup shouldn't leave the app stuck on "…".
  useEffect(() => {
    if (!me) return;
    let stop = false;
    let timer;
    const attempt = () =>
      loadTokens()
        .then((t) => {
          if (stop) return;
          setTokens(t);
          setError("");
        })
        .catch((e) => {
          if (stop) return;
          setError(friendlyError(e));
          timer = setTimeout(attempt, 3000);
        });
    attempt();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [me]);

  // Session expiry: wipe the signing key and send the user back to unlock.
  useEffect(() => {
    if (!auth) return;
    const t = setTimeout(() => {
      auth.session.end();
      setAuth(null);
      setScreen("home");
      setNotice(`Your ${SESSION_MINUTES}-minute session ended, so the signing key was wiped from this tab. Unlock to keep going.`);
    }, Math.max(0, auth.startedAt + SESSION_MS - Date.now()));
    return () => clearTimeout(t);
  }, [auth?.session, auth?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!me || !tokens) return;
    try {
      const b = await loadBalances(me, tokens);
      const prev = lastAusd.current;
      if (prev != null && b.ausd > prev && !expectingFaucet.current) {
        const amt = money(b.ausd - prev, tokens.ausdDecimals);
        record({ type: "in", amount: amt });
        showToast(`You received $${amt}`);
      }
      lastAusd.current = b.ausd;
      setBal({ ...b, me });
    } catch (e) {
      // This runs every 2 seconds. Once a balance is on screen, a single failed poll
      // isn't worth an error banner; the next poll usually succeeds.
      if (lastAusd.current == null) setError(friendlyError(e));
    }
  }, [me, tokens, record, showToast]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // Cover a new account's first network fees through this deployment's /api/drip.
  useEffect(() => {
    if (!bal || bal.mon !== 0n || gas !== "idle") return;
    setGas("topping");
    requestGasTopUp(me).then((status) => {
      setGas(status === "unavailable" ? "unavailable" : "done");
      if (status === "funded") refresh();
    });
  }, [bal, gas, me, refresh]);

  function onReady(res, kind) {
    setAuth({ ...res, startedAt: Date.now(), spent: 0n, fresh: kind === "create" });
    setNotice("");
    setScreen(pending ? "send" : "home");
  }

  function lock() {
    auth?.session.end();
    setAuth(null);
    setBal(null);
    setTokens(null);
    setScreen("home");
    setNotice("");
  }

  async function faucet() {
    setBusy("faucet");
    setError("");
    expectingFaucet.current = true;
    try {
      // Read the balance before the request: the 2-second poll can update lastAusd while we wait.
      const before = (await loadBalances(me, tokens)).ausd;
      const hash = await requestTestAusd(wallet);
      const b = await loadBalances(me, tokens);
      lastAusd.current = b.ausd;
      setBal({ ...b, me });
      record({ type: "faucet", amount: money(b.ausd - before, tokens.ausdDecimals), hash });
      noteFirstTx();
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      if (msg === FAUCET_BUSY) {
        // Say exactly how long, read from the faucet contract itself.
        faucetWait()
          .then(({ left, every }) => {
            if (left > 0)
              setError(
                `Agora's test-dollar faucet is shared by everyone testing and gives out one request every ${duration(every)}. Try again in about ${duration(left)}.`
              );
          })
          .catch(() => {});
      }
    } finally {
      expectingFaucet.current = false;
      setBusy("");
    }
  }

  /** Above the session's limits, ask for the passkey again before signing. */
  async function reconfirm() {
    setBusy("confirm");
    const res = await signIn();
    if (res.account.address !== me) {
      res.session.end();
      throw new Error("That passkey opens a different account. Use the one you're signed in with.");
    }
    auth.session.end();
    const next = { ...res, startedAt: Date.now(), spent: 0n, fresh: auth.fresh };
    setAuth(next);
    return next;
  }

  async function send({ to, units, via, value }) {
    setError("");
    try {
      let a = auth;
      const limit = parseUnits(String(SESSION_LIMIT_USD), tokens.ausdDecimals);
      if (a.spent + value > limit || Date.now() > a.startedAt + SESSION_MS) {
        try {
          a = await reconfirm();
        } catch (e) {
          setBusy("");
          setError(e?.code ? passkeyError(e) : friendlyError(e));
          return;
        }
      }
      setBusy("send");
      const w = a === auth ? wallet : walletFor(a.account);
      const res = via === "agora" ? await sendViaInstantSettlement(w, tokens, to, units) : await sendAusd(w, to, units);
      setAuth((cur) => (cur ? { ...cur, spent: cur.spent + value } : cur));
      const amount = money(res.received, tokens.ausdDecimals);
      record({ type: "out", to, amount, hash: res.hash, ms: res.ms, via });
      setSent({ ...res, to, via });
      setPending(null);
      setScreen("sent");
      noteFirstTx();
      const b = await loadBalances(me, tokens);
      lastAusd.current = b.ausd;
      setBal({ ...b, me });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }

  if (!auth) return <Welcome pending={pending} notice={notice} onReady={onReady} />;

  const errorLine = error && (
    <p className="error floating" role="alert" onClick={() => setError("")}>
      {error}
    </p>
  );
  const toastLine = toast && screen !== "home" && (
    <p className="toast floating-top" role="status">
      {toast}
    </p>
  );

  if (screen === "send" && tokens && bal)
    return (
      <>
        <Send
          auth={auth}
          tokens={tokens}
          bal={bal}
          prefill={pending}
          busy={busy}
          onBack={() => (setPending(null), setScreen("home"))}
          onSubmit={send}
        />
        {errorLine}
      </>
    );
  if (screen === "receive") return <Receive me={me} onBack={() => setScreen("home")} />;
  if (screen === "sent" && sent && tokens)
    return (
      <>
        <Sent result={sent} tokens={tokens} onDone={() => setScreen("home")} />
        {toastLine}
      </>
    );

  return (
    <>
      <Home
        auth={auth}
        me={me}
        tokens={tokens}
        bal={bal}
        gas={gas}
        activity={activity}
        toast={toast}
        busy={busy}
        onSend={() => setScreen("send")}
        onReceive={() => setScreen("receive")}
        onFaucet={faucet}
        onLock={lock}
      />
      {errorLine}
    </>
  );
}
