import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  setPersistence(authInstance, browserLocalPersistence).catch(() => {
    // Fallback to default persistence if storage restricted
  });
}

export const firebaseAuth = authInstance;

const ROLE_REFRESH_COOLDOWN_MS = 30_000;
let pendingClaimRefresh: { uid: string; promise: Promise<string> } | null = null;
const lastForcedRefreshByUid = new Map<string, number>();

/**
 * Ensures the Firebase ID token includes `{ role: 'authenticated' }`
 * required by Supabase Third-Party Auth, coalescing concurrent refreshes
 * and backing off briefly if an async claim assignment is propagating.
 */
export async function ensureSupabaseRoleClaim(user: User, maxForcedRefreshes = 3): Promise<string> {
  const cached = await user.getIdTokenResult(false);
  if (cached.claims?.role === 'authenticated') {
    return cached.token;
  }

  if (pendingClaimRefresh && pendingClaimRefresh.uid === user.uid) {
    return await pendingClaimRefresh.promise;
  }

  const refreshPromise = (async () => {
    const retryDelaysMs = [0, 700, 1400];
    let latest = cached;
    const attempts = Math.min(maxForcedRefreshes, retryDelaysMs.length);

    for (let i = 0; i < attempts; i++) {
      const delay = retryDelaysMs[i];
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      lastForcedRefreshByUid.set(user.uid, Date.now());
      latest = await user.getIdTokenResult(true);
      if (latest.claims?.role === 'authenticated') {
        return latest.token;
      }
    }

    return latest.token;
  })();

  pendingClaimRefresh = { uid: user.uid, promise: refreshPromise };
  try {
    return await refreshPromise;
  } finally {
    if (pendingClaimRefresh?.promise === refreshPromise) {
      pendingClaimRefresh = null;
    }
  }
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = authInstance?.currentUser;
  if (!user) return null;

  if (forceRefresh) {
    lastForcedRefreshByUid.set(user.uid, Date.now());
    const refreshed = await user.getIdTokenResult(true);
    return refreshed.token;
  }

  const current = await user.getIdTokenResult(false);
  if (current.claims?.role === 'authenticated') {
    return current.token;
  }

  const lastAttempt = lastForcedRefreshByUid.get(user.uid) ?? 0;
  if (Date.now() - lastAttempt >= ROLE_REFRESH_COOLDOWN_MS) {
    return await ensureSupabaseRoleClaim(user, 2);
  }

  return current.token;
}

export async function hasCurrentUserRoleClaim(): Promise<boolean> {
  const user = authInstance?.currentUser;
  if (!user) return false;
  const res = await user.getIdTokenResult(false);
  return res.claims?.role === 'authenticated';
}

export async function signInWithGoogle(): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(authInstance, provider);
  await ensureSupabaseRoleClaim(result.user);
  return result.user;
}

export async function signInWithFirebaseEmail(email: string, password: string): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const result = await signInWithEmailAndPassword(authInstance, email, password);
  await ensureSupabaseRoleClaim(result.user);
  return result.user;
}

export async function registerWithFirebaseEmail(
  name: string,
  email: string,
  password: string
): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const result = await createUserWithEmailAndPassword(authInstance, email, password);
  if (name.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  await ensureSupabaseRoleClaim(result.user);
  return result.user;
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  if (!authInstance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  await sendPasswordResetEmail(authInstance, email.trim());
}

export async function signOutFirebase(): Promise<void> {
  if (!authInstance) return;
  await signOut(authInstance);
}

export function subscribeToFirebaseAuth(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(authInstance, callback);
}

export function formatFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In window was closed before completing sign-in.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Console (Authentication -> Settings -> Authorized domains).';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled yet in Firebase Console -> Authentication -> Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}
