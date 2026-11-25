const {
  beforeUserCreated,
  beforeUserSignedIn,
  HttpsError,
} = require('firebase-functions/v2/identity');

/**
 * Preserves existing custom claims and sets `{ role: 'authenticated' }` when missing,
 * allowing Supabase Third-Party Auth to map Firebase JWTs to the Postgres `authenticated` role.
 *
 * Returns `undefined` when `{ role: 'authenticated' }` is already present so repeat sign-ins
 * do not perform unnecessary claim updates.
 */
function ensureAuthenticatedRoleResponse(event) {
  try {
    const existingClaims = (event && event.data && event.data.customClaims) || {};
    if (existingClaims.role === 'authenticated') {
      return undefined;
    }

    return {
      customClaims: {
        ...existingClaims,
        role: 'authenticated',
      },
    };
  } catch (err) {
    const uid = (event && event.data && event.data.uid) || 'unknown';
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[CareScript] Custom role claim assignment failed for uid=${uid}: ${reason}`);
    throw new HttpsError(
      'internal',
      'Unable to assign required CareScript authentication role claim. Please try signing in again.'
    );
  }
}

/**
 * Runs synchronously before every new Firebase user is created (Email/Password, Google, etc.)
 * so the initial ID token immediately carries `{ role: 'authenticated' }`.
 *
 * Requires Firebase Authentication with Identity Platform and the Blaze plan.
 */
exports.beforeCareScriptUserCreated = beforeUserCreated((event) => {
  return ensureAuthenticatedRoleResponse(event);
});

/**
 * Runs synchronously before every sign-in so existing users created prior to
 * deploying these functions receive `{ role: 'authenticated' }` on their next login.
 *
 * Requires Firebase Authentication with Identity Platform and the Blaze plan.
 */
exports.beforeCareScriptUserSignedIn = beforeUserSignedIn((event) => {
  return ensureAuthenticatedRoleResponse(event);
});
