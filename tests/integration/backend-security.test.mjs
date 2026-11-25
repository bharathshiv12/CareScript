import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL_A = process.env.SUPABASE_TEST_USER_A_EMAIL;
const PASSWORD_A = process.env.SUPABASE_TEST_USER_A_PASSWORD;
const EMAIL_B = process.env.SUPABASE_TEST_USER_B_EMAIL;
const PASSWORD_B = process.env.SUPABASE_TEST_USER_B_PASSWORD;
const HAS_LIVE_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const HAS_TEST_USERS = Boolean(HAS_LIVE_ENV && EMAIL_A && PASSWORD_A && EMAIL_B && PASSWORD_B);

async function callEdgeFunction(fnName, headers, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

test('Supabase integration environment prerequisite check', { skip: HAS_LIVE_ENV ? false : 'Requires .env.local loaded via --env-file' }, async () => {
  assert.ok(existsSync('frontend/node_modules/@supabase/supabase-js'));
  assert.ok(SUPABASE_URL && SUPABASE_ANON_KEY);
});

test('Unauthenticated and invalid-token requests are rejected across Postgres, Storage, and Edge Functions', { skip: !HAS_LIVE_ENV }, async () => {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const profRes = await anon.from('profiles').select('*');
  assert.ok(profRes.error, 'Anon select on profiles must be denied');
  const rpcRes = await anon.rpc('get_dashboard_summary', { p_local_date: new Date().toISOString().slice(0, 10), p_grace_minutes: 30 });
  assert.ok(rpcRes.error, 'Anon RPC get_dashboard_summary must be denied');
  const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/prescriptions/nonexistent.png`, { headers: { apikey: SUPABASE_ANON_KEY } });
  assert.ok(storageRes.status >= 400, 'Anon storage read must be rejected');
  for (const fn of ['ai-buddy', 'extract-prescription']) {
    const noAuth = await callEdgeFunction(fn, {}, fn === 'ai-buddy' ? { prompt: 'hello' } : { prescriptionId: '00000000-0000-0000-0000-000000000000' });
    assert.equal(noAuth.status, 401, `${fn} must reject requests without a token`);
    const badAuth = await callEdgeFunction(fn, { Authorization: 'Bearer malformed.jwt.token' }, {});
    assert.equal(badAuth.status, 401, `${fn} must reject malformed tokens`);
  }
});

test('Supabase profile persistence and RLS isolation for two prepared test accounts', { skip: !HAS_TEST_USERS ? 'Provide two dedicated SUPABASE_TEST_USER_* accounts in .env.local' : false }, async () => {
  const clientFor = async (email, password) => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    assert.equal(error, null, 'Dedicated Supabase test account must sign in');
    assert.ok(data.session?.access_token);
    return { client, user: data.user };
  };
  const a = await clientFor(EMAIL_A, PASSWORD_A);
  const b = await clientFor(EMAIL_B, PASSWORD_B);
  assert.equal(a.user.app_metadata?.provider, 'email');

  const bootstrap = await a.client.rpc('get_or_create_profile', { p_full_name: 'CareScript Integration A', p_email: EMAIL_A, p_timezone: 'Asia/Kolkata' });
  assert.equal(bootstrap.error, null);
  assert.equal(bootstrap.data.profile.user_id, a.user.id);
  const update = await a.client.from('profiles').update({ full_name: 'CareScript Integration A Updated', height: '172 cm' }).eq('user_id', a.user.id).select().single();
  assert.equal(update.error, null);
  assert.equal(update.data.height, '172 cm');

  const bBootstrap = await b.client.rpc('get_or_create_profile', { p_full_name: 'CareScript Integration B', p_email: EMAIL_B, p_timezone: 'Asia/Kolkata' });
  assert.equal(bBootstrap.error, null);
  const bReadA = await b.client.from('profiles').select('*').eq('user_id', a.user.id);
  assert.equal(bReadA.error, null);
  assert.equal(bReadA.data.length, 0, 'User B must not read User A profile');
  const bUpdateA = await b.client.from('profiles').update({ full_name: 'Tampered' }).eq('user_id', a.user.id).select();
  assert.equal(bUpdateA.error, null);
  assert.equal(bUpdateA.data.length, 0, 'User B must not update User A profile');
});

test('Gemini Edge Function accepts authenticated requests when the deployed key is configured', { skip: !HAS_TEST_USERS ? 'Requires dedicated Supabase test account' : false }, async (t) => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD_A });
  assert.equal(error, null);
  const response = await callEdgeFunction('ai-buddy', { Authorization: `Bearer ${data.session.access_token}` }, { prompt: 'What does BD mean on a prescription?' });
  if (response.status === 503) t.skip('GEMINI_API_KEY is not configured in Supabase Edge Function secrets');
  assert.equal(response.status, 200);
  assert.ok(typeof response.body?.reply === 'string' && response.body.reply.length > 0);
});
