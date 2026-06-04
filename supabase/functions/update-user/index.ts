const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const BodySchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  app_role: z.enum(['admin', 'user']).optional(),
  new_password: z.string().min(6).optional(),
  archived: z.boolean().optional(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: callingUser } } = await userClient.auth.getUser()
    if (!callingUser) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: roleCheck } = await adminClient.from('user_roles').select('role').eq('user_id', callingUser.id).eq('role', 'admin').maybeSingle()
    if (!roleCheck) return new Response(JSON.stringify({ error: 'Apenas administradores podem editar usuários' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const rawBody = await req.json()
    const parsed = BodySchema.safeParse(rawBody)
    if (!parsed.success) {
      console.error('validation failed:', JSON.stringify(parsed.error.flatten().fieldErrors))
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { user_id, display_name, role, app_role, new_password } = parsed.data

    if (display_name || role) {
      const update: Record<string, string> = {}
      if (display_name) update.display_name = display_name
      if (role) update.role = role
      const { error } = await adminClient.from('profiles').update(update).eq('user_id', user_id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (new_password) {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (app_role) {
      // remove existing admin row, then insert if desired role is admin; user role implied by absence
      await adminClient.from('user_roles').delete().eq('user_id', user_id).eq('role', 'admin')
      if (app_role === 'admin') {
        await adminClient.from('user_roles').insert({ user_id, role: 'admin' })
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
