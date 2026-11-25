import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Creates a user-scoped Supabase client using the incoming Supabase Auth JWT
 * and verifies the token with Supabase Auth before any user-scoped database work.
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

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) throw new ResponseError(401, 'Missing Authorization bearer token');

  const { data: authData, error } = await supabase.auth.getUser(accessToken);
  if (error || !authData.user?.id) {
    throw new ResponseError(401, 'Invalid or expired authentication token');
  }

  return { supabase, userId: authData.user.id };
}

export class ResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
