import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { requireSupabase } from '../../lib/supabase';
import { recordOAuthCallbackError } from '../../lib/oauthCallback';

export const OAuthCallback: React.FC = () => {
  const exchangeStarted = useRef(false);

  useEffect(() => {
    // React StrictMode replays effects in development. A PKCE code is single-use,
    // so exchanging it twice can race a successful callback with an invalid-code error.
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    let cancelled = false;

    const complete = async () => {
      const currentUrl = new URL(window.location.href);
      const providerError = currentUrl.searchParams.get('error_description') || currentUrl.searchParams.get('error');

      if (providerError) {
        recordOAuthCallbackError(providerError);
        window.location.replace('/');
        return;
      }

      const code = currentUrl.searchParams.get('code');
      try {
        const client = requireSupabase();
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          if (!data.session) throw new Error('The Google sign-in callback did not include a session.');
        }

        window.history.replaceState({}, document.title, '/');
        window.location.replace('/');
      } catch (error) {
        recordOAuthCallbackError(
          error instanceof Error ? error.message : 'Google sign-in could not be completed.'
        );
        if (!cancelled) window.location.replace('/');
      }
    };

    void complete();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="cs-card px-6 py-5 text-sm font-semibold flex items-center gap-3" role="status">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        Completing secure sign-in…
      </div>
    </main>
  );
};
