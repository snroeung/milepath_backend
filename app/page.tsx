'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

// ─── Palette (matches crPal exactly) ─────────────────────────────────────────

const PAL = {
  light: {
    bg: '#f5f5f4', card: '#ffffff', ink: '#0c0c0d', muted: '#5f6066',
    line: '#e3e3e1', lineSoft: '#ededeb', sky: '#84cc16', navy: '#0a0a0a',
  },
  dark: {
    bg: '#0a0a0b', card: '#161618', ink: '#f3f3f1', muted: '#8a8a90',
    line: '#262629', lineSoft: '#1c1c1f', sky: '#84cc16', navy: '#000000',
  },
};

// ─── Ledger rows ──────────────────────────────────────────────────────────────

const LEDGER = [
  { n: '01', label: 'Every portal, searched at once.',          metric: '40+',  unit: 'PORTALS',   highlight: false },
  { n: '02', label: 'True cents-per-point on every row.',       metric: '¢/pt', unit: 'EVERY ROW', highlight: false },
  { n: '03', label: 'Save unlimited trips & itineraries.',      metric: '∞',    unit: 'TRIPS',     highlight: true  },
];

// ─── Google G mark ────────────────────────────────────────────────────────────

function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path fill="#4285F4" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-8.9 20-20 0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
      <path fill="#FBBC05" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.4-4.6 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5A20 20 0 0 0 24 44z"/>
      <path fill="#EA4335" d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4 5.1l6.3 5.2C41.4 35.9 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type View = 'form' | 'confirm';

export default function StartPage() {
  const { isDark } = useTheme();
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const t = isDark ? PAL.dark : PAL.light;

  const [view, setView]               = useState<View>('form');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split('@')[0] },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setView('confirm');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, fontFamily: 'var(--font-geist-sans), Inter, system-ui, sans-serif' }}>

      {/* ── Ribbon ─────────────────────────────────────────────────────── */}
      <div style={{
        background: t.navy, color: isDark ? t.muted : '#cfcfcc',
        fontSize: 10.5, padding: '5px 28px',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        letterSpacing: '0.06em',
      }}>
        <span>COVELO · POINTS ENGINE + TRAVEL PLANNER</span>
        <span>WAITLIST OPEN · BETA</span>
      </div>

      {/* ── Two-column body ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.85fr', minHeight: 'calc(100vh - 29px)' }}>

        {/* ── LEFT: brand ──────────────────────────────────────────── */}
        <div style={{
          background: t.card, padding: '56px 56px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          borderRight: `1px solid ${t.line}`,
        }}>
          <div>
            {/* Wordmark */}
            <Link href="/" style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.03em', color: t.ink, textDecoration: 'none' }}>
              covelo<span style={{ opacity: 0.55 }}>.</span>
            </Link>

            {/* Hero headline */}
            <h1 style={{
              fontSize: 96, lineHeight: 0.9, fontWeight: 800,
              letterSpacing: '-0.045em', margin: '72px 0 0', color: t.ink,
            }}>
              Travel,<br />by the<br />
              <span style={{ fontStyle: 'italic', fontWeight: 700 }}>cent</span>
              <span style={{ color: t.sky }}>.</span>
            </h1>

            {/* Tagline */}
            <p style={{ marginTop: 28, fontSize: 16, color: t.muted, lineHeight: 1.55, maxWidth: 460 }}>
              Covelo searches every points program at once — Chase, Amex, Capital One, Bilt — and ranks them by true cents-per-point value.
            </p>
          </div>

          {/* Ledger */}
          <div style={{ marginTop: 48 }}>
            <div style={{
              paddingBottom: 10, borderBottom: `1.5px solid ${t.ink}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-geist-mono)', color: t.ink, fontWeight: 800, letterSpacing: '0.1em' }}>
                WHAT YOU GET ON DAY ONE
              </span>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.08em' }}>
                FREE TIER · NO CARD
              </span>
            </div>

            {LEDGER.map((row) => (
              <div key={row.n} style={{
                display: 'grid', gridTemplateColumns: '44px 1fr auto auto', gap: 14,
                padding: '16px 4px', borderBottom: `1px dashed ${t.lineSoft}`, alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 800 }}>
                  {row.n}.
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: t.ink, letterSpacing: '-0.01em' }}>
                  {row.label}
                </span>
                <span style={{
                  fontSize: 16, fontFamily: 'var(--font-geist-mono)', fontWeight: 800, color: t.ink,
                  padding: row.highlight ? '2px 8px' : 0,
                  background: row.highlight ? t.sky : 'transparent',
                  borderRadius: row.highlight ? 3 : 0,
                }}>
                  {row.metric}
                </span>
                <span style={{ fontSize: 9.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.1em' }}>
                  {row.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: auth ───────────────────────────────────────────── */}
        <div style={{
          padding: '56px 48px', display: 'flex',
          flexDirection: 'column', justifyContent: 'center',
          background: t.bg,
        }}>
          {authLoading ? (
            /* ── Loading skeleton ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[80, 60, 100, 48].map((w, i) => (
                <div key={i} style={{ height: 18, width: `${w}%`, borderRadius: 6, background: t.line, opacity: 0.6 }} />
              ))}
            </div>
          ) : user ? (
            /* ── Signed-in welcome panel ── */
            <div>
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 10.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8 }}>
                  WELCOME BACK
                </p>
                <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 6px', color: t.ink, lineHeight: 1 }}>
                  {profile?.display_name || user.email?.split('@')[0]}<span style={{ color: t.sky }}>.</span>
                </h2>
                <p style={{ fontSize: 14, color: t.muted, margin: 0 }}>{user.email}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { href: '/search',      label: 'Search Flights and Hotels',      sub: 'Compare price across all credit card portals and travel partners' },
                  // Trip Planner temporarily hidden — ui:trip-planner disabled in lib/feature-flags.ts
                  // { href: '/trip-planner', label: 'Trip Planner',         sub: 'Plan your next adventure'         },
                  { href: '/offers',       label: 'Offers',  sub: 'Unlock deals tailored to you'      },
                ].map(({ href, label, sub }) => (
                  <Link key={href} href={href} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 18px', borderRadius: 10,
                    border: `1.5px solid ${t.line}`, background: t.card,
                    textDecoration: 'none', color: t.ink,
                  }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{label}</span>
                      <span style={{ fontSize: 12, color: t.muted }}>{sub}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-geist-mono)', color: t.muted, fontSize: 14 }}>→</span>
                  </Link>
                ))}
              </div>

              <button
                onClick={signOut}
                style={{
                  marginTop: 8, width: '100%', background: 'transparent',
                  border: `1.5px solid ${t.line}`, borderRadius: 10,
                  padding: '13px 16px', fontSize: 13.5, fontWeight: 700,
                  cursor: 'pointer', color: isDark ? '#f87171' : '#dc2626',
                  fontFamily: 'inherit', letterSpacing: '-0.01em',
                }}
              >
                Sign out
              </button>
            </div>
          ) : view === 'confirm' ? (
            /* ── Email confirmation screen ── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 8px', color: t.ink }}>
                Check your inbox
              </h2>
              <p style={{ fontSize: 14, color: t.muted, margin: '0 0 6px' }}>We sent a confirmation link to</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: t.ink, margin: '0 0 20px' }}>{email}</p>
              <p style={{ fontSize: 13, color: t.muted, lineHeight: 1.6, margin: '0 0 32px', maxWidth: 320 }}>
                Click the link in the email to activate your account. Check your spam folder if you don&apos;t see it within a minute.
              </p>
              <button
                onClick={() => { setView('form'); setPassword(''); setError(null); }}
                style={{
                  width: '100%', background: t.ink, color: isDark ? t.navy : '#fff',
                  border: 'none', borderRadius: 10, padding: '14px 18px',
                  fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.01em',
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            /* ── Sign-up form ── */
            <>
              <h2 style={{ fontSize: 44, lineHeight: 0.95, fontWeight: 800, letterSpacing: '-0.035em', margin: '0 0 8px' }}>
                Make it yours<span style={{ color: t.sky }}>.</span>
              </h2>
              <p style={{ fontSize: 14, color: t.muted, lineHeight: 1.55, margin: '0 0 28px', maxWidth: 380 }}>
                Create an account to save your trips, sync your cards, and get personalized recommendations. Giving it a try? No problem — continue as a guest.
              </p>

              {/* Google sign-in */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: t.ink, color: isDark ? t.navy : '#fff',
                  border: `1.5px solid ${t.ink}`, borderRadius: 10,
                  padding: '13px 16px', fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', letterSpacing: '-0.005em',
                  opacity: loading ? 0.65 : 1,
                }}
              >
                <span style={{ display: 'inline-flex', padding: 2, background: '#fff', borderRadius: 4 }}>
                  <GoogleG size={16} />
                </span>
                <span>{loading ? 'Redirecting…' : 'Continue with Google'}</span>
              </button>

              {/* OR divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: t.line }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.14em' }}>OR</span>
                <div style={{ flex: 1, height: 1, background: t.line }} />
              </div>

              <form onSubmit={handleSignUp}>
                {/* Display name */}
                <label style={{ display: 'block', fontSize: 9.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.12em' }}>
                  YOUR NAME
                </label>
                <div style={{ marginTop: 6, marginBottom: 14, padding: '0 4px 0 14px', border: `1.5px solid ${t.line}`, borderRadius: 10, display: 'flex', alignItems: 'center', background: t.card }}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, color: t.ink, fontFamily: 'inherit', fontWeight: 500 }}
                  />
                </div>

                {/* Email */}
                <label style={{ display: 'block', fontSize: 9.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.12em' }}>
                  EMAIL ADDRESS
                </label>
                <div style={{ marginTop: 6, padding: '0 4px 0 14px', border: `1.5px solid ${t.line}`, borderRadius: 10, display: 'flex', alignItems: 'center', background: t.card }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    required
                    autoComplete="email"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, color: t.ink, fontFamily: 'inherit', fontWeight: 500 }}
                  />
                </div>

                {/* Password */}
                <label style={{ display: 'block', fontSize: 9.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.12em', marginTop: 14 }}>
                  PASSWORD<span style={{ color: t.muted, marginLeft: 8, fontWeight: 600, letterSpacing: '0.06em' }}>· MIN 8 CHAR</span>
                </label>
                <div style={{ marginTop: 6, padding: '0 14px', border: `1.5px solid ${t.line}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, background: t.card }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="············"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, color: t.ink, fontFamily: 'inherit', fontWeight: 500, letterSpacing: '0.1em' }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} style={{ fontSize: 10.5, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', color: isDark ? '#fca5a5' : '#dc2626', fontSize: 13, lineHeight: 1.5 }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 18, width: '100%', background: t.ink,
                    color: isDark ? t.navy : '#fff', border: 'none', borderRadius: 10,
                    padding: '14px 18px', fontSize: 14, fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
                    letterSpacing: '-0.01em', opacity: loading ? 0.65 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {loading ? 'Creating account…' : 'Create account'}
                  {!loading && <span style={{ fontFamily: 'var(--font-geist-mono)', opacity: 0.7 }}>→</span>}
                </button>
              </form>

              {/* Continue as guest */}
              <Link href="/flights" style={{
                marginTop: 12, width: '100%', background: 'transparent', color: t.ink,
                border: `1.5px dashed ${t.line}`, borderRadius: 10,
                padding: '13px 16px', fontSize: 13.5, fontWeight: 700,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                textDecoration: 'none',
              }}>
                <span>Continue as guest</span>
                <span style={{ fontFamily: 'var(--font-geist-mono)', color: t.muted }}>→</span>
              </Link>

              {/* Footer */}
              <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${t.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Link href="/auth" style={{ fontSize: 11, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 700, letterSpacing: '0.08em', textDecoration: 'none' }}>
                  ALREADY A MEMBER?{' '}
                  <span style={{ color: t.ink }}>SIGN IN →</span>
                </Link>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)', color: t.muted, fontWeight: 600, letterSpacing: '0.04em' }}>
                  <span style={{ color: t.ink, fontWeight: 700 }}>Terms</span>
                  {' · '}
                  <span style={{ color: t.ink, fontWeight: 700 }}>Privacy</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
