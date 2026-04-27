const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  display_name: z.string().min(1),
  role: z.enum(['estagiario', 'assistente', 'analista', 'coordenacao']),
  app_role: z.enum(['admin', 'user']).default('user'),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the calling user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: callingUser }, error: getUserError } = await userClient.auth.getUser()
    if (getUserError || !callingUser) {
      console.error('getUser error', getUserError)
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: roleCheck, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) {
      console.error('roleCheck error', roleError)
    }

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem criar usuários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, display_name, role, app_role } = parsed.data

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    })

    if (createError || !newUser?.user) {
      console.error('createUser error', createError)
      return new Response(JSON.stringify({ error: createError?.message || 'Erro ao criar usuário' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert profile (handle_new_user trigger may have created a row already)
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({ user_id: newUser.user.id, display_name, role }, { onConflict: 'user_id' })

    if (profileError) {
      console.error('profile upsert error', profileError)
    }

    const { error: roleInsertError } = await adminClient
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role: app_role })

    if (roleInsertError) {
      console.error('user_roles insert error', roleInsertError)
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unhandled error', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
