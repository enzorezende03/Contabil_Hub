// Painel Gerencial — generate-backlog-snapshot
// Runs the SQL function public.generate_backlog_snapshot(force) which
// calculates all KPIs for the current ISO week and UPSERTs into
// public.backlog_snapshots. Idempotent.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let force = url.searchParams.get('force') === 'true';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && typeof body.force === 'boolean') force = body.force;
      } catch (_) { /* no body */ }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc('generate_backlog_snapshot', { p_force: force });
    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[generate-backlog-snapshot]', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
