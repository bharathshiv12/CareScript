import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, MailCheck, UserCheck } from 'lucide-react';
import { isSupabaseConfigured, registerWithEmail, sendPasswordReset, signInWithEmail, signInWithGoogle } from '../lib/supabase';
import { consumeOAuthCallbackError } from '../lib/oauthCallback';
import { Logo } from './ui/Logo';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => consumeOAuthCallbackError());
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      if (!isSupabaseConfigured) {
        setError('Cloud sign-in is not configured yet.');
        return;
      }
      setLoading(true);
      try {
        await sendPasswordReset(trimmedEmail);
        setInfoMessage('Password reset email sent. Please check your inbox.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the password reset email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'register' && name.trim().length < 2) {
      setError('Please enter your name (at least 2 characters).');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Cloud sign-in is not configured yet.');
      }
      if (mode === 'register') {
        const { session } = await registerWithEmail(name.trim(), trimmedEmail, password);
        if (!session) {
          setInfoMessage('Account created. Check your email to confirm your address, then sign in.');
        }
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setInfoMessage('');
    if (!isSupabaseConfigured) {
      setError('Google sign-in is not configured yet.');
      return;
    }
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        {/* Left Welcome Panel */}
        <div
          className="md:col-span-5 rounded-2xl p-6 sm:p-8 flex flex-col justify-center text-white"
          style={{ backgroundColor: 'var(--color-sidebar)' }}
        >
          <div>
            <Logo onDark />
            <h1 className="mt-8 text-2xl sm:text-3xl font-bold leading-snug">
              Your Personal Prescription &amp; Medication Companion.
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed opacity-90">
              Understand your prescriptions in clear language, organize daily schedules, and keep track of every dose comfortably.
            </p>
          </div>

        </div>

        {/* Right Form Card */}
        <div className="md:col-span-7 cs-card p-6 sm:p-8 flex flex-col justify-center">
          <div
            className="inline-flex rounded-xl p-1 mb-5 self-start"
            style={{ backgroundColor: 'var(--color-light-blue)' }}
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError('');
                setInfoMessage('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: mode === 'login' ? 'var(--color-surface)' : 'transparent',
                color: mode === 'login' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError('');
                setInfoMessage('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: mode === 'register' ? 'var(--color-surface)' : 'transparent',
                color: mode === 'register' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              Create Account
            </button>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold">
            {mode === 'login'
              ? 'Welcome back'
              : mode === 'register'
              ? 'Create your CareScript account'
              : 'Reset your password'}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'login'
              ? 'Sign in to access your personal medication dashboard.'
              : mode === 'register'
              ? 'Only basic details are needed to start organizing your medicines.'
              : 'Enter your email address and we will send a password reset link.'}
          </p>

          {/* Google Sign-In */}
          {mode !== 'reset' && isSupabaseConfigured && (
            <div className="mt-5">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 rounded-xl border font-semibold text-sm sm:text-base flex items-center justify-center gap-3 transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  OR WITH EMAIL
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: 'var(--color-danger-bg)',
                color: 'var(--color-danger)',
              }}
            >
              {error}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="mt-4 p-3 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-success-bg)',
                color: 'var(--color-success)',
              }}
            >
              <MailCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-semibold mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  className="cs-input"
                  placeholder="e.g., Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-semibold mb-1.5">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                className="cs-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-sm font-semibold">
                    Password
                  </label>
                  {mode === 'login' && isSupabaseConfigured && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError('');
                        setInfoMessage('');
                      }}
                      className="text-xs font-semibold"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="cs-input pr-11"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cs-btn-primary w-full py-3 px-4 flex items-center justify-center gap-2 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  Please wait...
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5" aria-hidden="true" />
                  {mode === 'login'
                    ? 'Sign In'
                    : mode === 'register'
                    ? 'Create Account'
                    : 'Send Reset Link'}
                </>
              )}
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setInfoMessage('');
                }}
                className="cs-btn-secondary w-full py-2.5 text-sm"
              >
                Back to Sign In
              </button>
            )}
          </form>

        </div>
      </div>
    </div>
  );
};
