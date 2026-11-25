import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface AuthContext {
  supabase: SupabaseClient;
  firebaseUid: string;
}

/**
 * Creates a user-scoped Supabase client using the incoming Firebase JWT
 * and verifies that Supabase Third-Party Auth accepts it + maps to a valid Firebase UID.
 * Never uses the service_role key.
 */
export async function requireAuthenticatedUser(req: Request): Promise<AuthContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Server Supabase configuration missing');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ResponseError(401, 'Missing Authorization bearer token');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Verify token validity and Firebase project claim directly inside Postgres RLS/JWT validator
  const { data: uid, error } = await supabase.rpc('firebase_uid');
  if (error || !uid || typeof uid !== 'string') {
    throw new ResponseError(401, 'Invalid or expired authentication token');
  }

  const { data: validProject, error: projErr } = await supabase.rpc('is_carescript_firebase_jwt');
  if (projErr || validProject !== true) {
    throw new ResponseError(403, 'Authentication token is not authorized for CareScript');
  }

  return { supabase, firebaseUid: uid };
}

export class ResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
