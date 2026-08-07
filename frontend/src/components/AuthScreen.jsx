import React, { useRef, useState } from "react";
import { ArrowUpRightIcon, MoonIcon, SunIcon } from "./Icons.jsx";

export default function AuthScreen({
  dark,
  onToggleDark,
  onRequestLink,
  notice = "",
  configurationError = "",
}) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || configurationError) return;

    setBusy(true);
    setError("");
    try {
      await onRequestLink(normalizedEmail);
      setSentTo(normalizedEmail);
    } catch (requestError) {
      setError(requestError.message || "We could not send the sign-in link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function useDifferentEmail() {
    setSentTo("");
    setError("");
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  return (
    <div className="auth-page">
      <header className="auth-nav">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><ArrowUpRightIcon size={21} /></div>
          <div>
            <div className="logo">TermPilot</div>
            <div className="logo-sub">Plan the term. Fly the plan.</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="dark-toggle" type="button" onClick={onToggleDark} title="Toggle dark mode" aria-label="Toggle dark mode">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <a className="header-link" href="https://github.com/Lolu07/termpilot" target="_blank" rel="noreferrer">
            View source <ArrowUpRightIcon size={14} />
          </a>
        </div>
      </header>

      <main className="auth-shell">
        <section className="auth-story" aria-labelledby="auth-heading">
          <div className="auth-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div className="auth-story-copy">
            <div className="eyebrow">Your academic command center</div>
            <h1 id="auth-heading">Turn a dense syllabus into a clear flight plan.</h1>
            <p>TermPilot extracts deadlines, gives you an editable review checkpoint, and turns the semester into a focused weekly plan.</p>
          </div>

          <div className="auth-route" aria-label="How TermPilot works">
            <article><span>01</span><strong>Import</strong><small>Paste text or upload a PDF.</small></article>
            <article><span>02</span><strong>Verify</strong><small>Review every extracted deadline.</small></article>
            <article><span>03</span><strong>Navigate</strong><small>Prioritize the work that matters now.</small></article>
          </div>

          <div className="auth-proof">
            <span>Private workspace</span>
            <span>AI + deterministic fallback</span>
            <span>Review before save</span>
          </div>
        </section>

        <section className="auth-panel" aria-labelledby="sign-in-heading">
          <div className="auth-panel-topline"><span>Secure access</span><span className="auth-live-dot">Online</span></div>
          {sentTo ? (
            <div className="auth-sent" role="status">
              <div className="auth-mail-mark" aria-hidden="true">↗</div>
              <div>
                <div className="eyebrow">Link dispatched</div>
                <h2>Check your inbox</h2>
                <p>We sent a secure sign-in link to <strong>{sentTo}</strong>. Open it to continue to your private workspace.</p>
              </div>
              <button className="button-secondary" type="button" onClick={useDifferentEmail}>Use a different email</button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div>
                <div className="eyebrow">Welcome aboard</div>
                <h2 id="sign-in-heading">Sign in to your workspace</h2>
                <p>No password to remember. We’ll email you a secure magic link.</p>
              </div>

              {(notice || configurationError) && (
                <div className={`auth-alert${configurationError ? " error" : ""}`} role="status">
                  {configurationError || notice}
                </div>
              )}

              <label className="auth-email-field">
                <span>Email address</span>
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  disabled={busy || Boolean(configurationError)}
                  required
                  autoFocus
                />
              </label>

              {error && <div className="auth-alert error" role="alert">{error}</div>}

              <button className="auth-submit" type="submit" disabled={busy || !email.trim() || Boolean(configurationError)}>
                {busy ? <span className="loading-text"><span className="spinner" /> Sending secure link…</span> : <span>Continue with email <ArrowUpRightIcon size={16} /></span>}
              </button>
              <small className="auth-privacy">Your courses are isolated to your account and synced securely.</small>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export function AuthLoadingScreen({ dark, onToggleDark }) {
  return (
    <div className="auth-page auth-loading-page">
      <header className="auth-nav">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><ArrowUpRightIcon size={21} /></div>
          <div className="logo">TermPilot</div>
        </div>
        <button className="dark-toggle" type="button" onClick={onToggleDark} title="Toggle dark mode" aria-label="Toggle dark mode">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>
      <main className="auth-loading" aria-live="polite">
        <span className="auth-loader" aria-hidden="true" />
        <div>
          <strong>Preparing your flight plan</strong>
          <span>Restoring your secure session…</span>
        </div>
      </main>
    </div>
  );
}
