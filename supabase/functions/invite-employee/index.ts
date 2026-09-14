import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createInviteHandler } from './handler.js';

Deno.serve(createInviteHandler(
  (authorization: string) => createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false } },
  ),
  () => createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ),
));
