import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const userId = 'af4c1219-a9f2-4b3f-b830-c265dcfc81ce'
  const newEmail = 'ana.ribeiro@2msaude.com'
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  })
  return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' } })
})
