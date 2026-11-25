const CALLBACK_ERROR_KEY = 'carescript_oauth_callback_error';

export function recordOAuthCallbackError(message: string): void {
  try {
    sessionStorage.setItem(CALLBACK_ERROR_KEY, message);
  } catch {
    // Keep the callback redirect usable when browser storage is restricted.
  }
}

export function consumeOAuthCallbackError(): string {
  try {
    const message = sessionStorage.getItem(CALLBACK_ERROR_KEY) || '';
    sessionStorage.removeItem(CALLBACK_ERROR_KEY);
    return message;
  } catch {
    return '';
  }
}
