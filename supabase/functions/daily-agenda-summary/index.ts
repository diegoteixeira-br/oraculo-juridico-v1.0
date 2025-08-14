import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { AgendaSummaryEmail } from "./_templates/agenda-summary.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agenda-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const AGENDA_SECRET = Deno.env.get("DAILY_AGENDA_SECRET") as string;
const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

// Util: group by user_id
function groupBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce((acc: Record<string, T[]>, row: T) => {
    const k = String(row[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

async function renderEmailHTML(fullName: string, items: any[], timezone: string = 'America/Sao_Paulo') {
  return await renderAsync(
    React.createElement(AgendaSummaryEmail, { fullName, items, timezone })
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let payload: any = {};
  try {
    if (req.body) payload = await req.json();
  } catch (_) {}

  const url = new URL(req.url);
  const qsSecret = url.searchParams.get("secret") ?? "";
  const isPreview = ["1", "true", "yes"].includes((url.searchParams.get("preview") ?? "").toLowerCase());

  const providedSecret = req.headers.get("x-agenda-secret") || payload.secret || qsSecret;
  const source = payload?.source ?? "manual";
  const testEmail = payload?.test_email; // Email específico para teste

  // Preview endpoint: returns the HTML template for quick visual check
  if (isPreview) {
    const now = new Date();
    const sampleItems = [
      { title: "Audiência de conciliação", commitment_date: new Date(now.getTime() + 2*60*60*1000), location: "Fórum Central", process_number: "0001234-56.2025.8.26.0000", client_name: "Maria Silva" },
      { title: "Prazo: contestação", commitment_date: new Date(now.getTime() + 6*60*60*1000), location: "", process_number: "0009876-54.2025.8.26.0000", client_name: "João Souza" },
    ];
    const html = await renderEmailHTML("Exemplo", sampleItems, "America/Sao_Paulo");
    return new Response(html, {
      status: 200,
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      },
    });
  }

  // Authorization strategy:
  // - Prefer DAILY_AGENDA_SECRET via header, body or query param
  // - Allow pg_cron scheduled calls (they set source="pg_cron" in the body via migration)
  // - Allow manual tests from authenticated admin users
  const authorized = (AGENDA_SECRET && providedSecret === AGENDA_SECRET) || 
                    source === "pg_cron" || 
                    source === "manual_test";

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get commitments for next 24h, pending status
    const { data: commitments, error: commitmentsError } = await supabase
      .from("legal_commitments")
      .select("user_id, title, commitment_date, location, process_number, client_name")
      .gte("commitment_date", now.toISOString())
      .lt("commitment_date", in24h.toISOString())
      .eq("status", "pendente");

    if (commitmentsError) throw commitmentsError;

    if (!commitments || commitments.length === 0) {
      return new Response(JSON.stringify({ message: "No commitments in next 24h", sent: 0 }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Filter users by profile flag and get notification settings
    const userIds = Array.from(new Set(commitments.map((c) => c.user_id)));
    
    let profilesQuery = supabase
      .from("profiles")
      .select("user_id, full_name, receber_notificacao_agenda, timezone")
      .in("user_id", userIds);
    
    // Se é teste com email específico, filtrar apenas por esse usuário
    if (testEmail) {
      // Buscar o user_id pelo email
      const { data: userData } = await supabase.auth.admin.listUsers();
      const targetUser = userData.users.find(u => u.email === testEmail);
      
      if (!targetUser) {
        return new Response(JSON.stringify({ 
          message: `Usuário com email ${testEmail} não encontrado`, 
          sent: 0 
        }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      profilesQuery = profilesQuery.eq("user_id", targetUser.id);
    } else {
      // Apenas usuários que querem receber notificações
      profilesQuery = profilesQuery.eq("receber_notificacao_agenda", true);
    }

    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) throw profilesError;

    const allowedUserIds = new Set((profiles ?? []).map((p) => p.user_id));
    const filtered = commitments.filter((c) => allowedUserIds.has(c.user_id));

    if (filtered.length === 0 && !testEmail) {
      return new Response(JSON.stringify({ message: "No opted-in users to notify", sent: 0 }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Para teste com email específico, mesmo sem compromissos, enviar email de teste
    if (testEmail && filtered.length === 0 && profiles && profiles.length > 0) {
      const profile = profiles[0];
      const { data: user } = await supabase.auth.admin.getUserById(profile.user_id);
      
      if (user.user?.email) {
        const userTimezone = profile.timezone || 'America/Sao_Paulo';
        const sampleItems = [
          { 
            title: "Teste: Audiência de conciliação", 
            commitment_date: new Date(Date.now() + 2*60*60*1000), 
            location: "Fórum Central (TESTE)", 
            process_number: "0001234-56.2025.8.26.0000", 
            client_name: "Cliente Teste" 
          }
        ];
        
        const html = await renderEmailHTML(profile.full_name || "", sampleItems, userTimezone);

        const { data, error } = await resend.emails.send({
          from: "Oráculo Jurídico <agenda@oracurojuridico.com.br>",
          to: [user.user.email],
          subject: "📅 [TESTE] Resumo da Agenda Jurídica",
          html,
        });

        if (error) throw error;
        
        return new Response(
          JSON.stringify({ 
            message: `Teste enviado para ${testEmail} (sem compromissos reais)`, 
            sent: 1, 
            results: { [profile.user_id]: { status: "sent", email_id: data?.id, test_mode: true } } 
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Get notification settings including timezone and preferred time
    const { data: notificationSettings } = await supabase
      .from("notification_settings") 
      .select("user_id, agenda_email_time, agenda_timezone")
      .in("user_id", Array.from(allowedUserIds));

    // Group by user
    const grouped = groupBy(filtered, "user_id");

    // Send emails
    const results: Record<string, any> = {};
    let sent = 0;

    for (const [userId, items] of Object.entries(grouped)) {
      try {
        const profile = profiles?.find(p => p.user_id === userId);
        const settings = notificationSettings?.find(s => s.user_id === userId);
        
        // Usar timezone do usuário (perfil > configuração de notificação > padrão Brasil)
        const userTimezone = profile?.timezone || settings?.agenda_timezone || 'America/Sao_Paulo';
        
        const { data: user } = await supabase.auth.admin.getUserById(userId);
        if (!user.user?.email) continue;

        // Passar timezone para o template de email
        const html = await renderEmailHTML(profile?.full_name || "", items as any[], userTimezone);

        const { data, error } = await resend.emails.send({
          from: "Oráculo Jurídico <agenda@oracurojuridico.com.br>",
          to: [user.user.email],
          subject: "📅 Resumo da Agenda Jurídica - Próximas 24h",
          html,
        });

        if (error) throw error;
        results[userId] = { 
          status: "sent", 
          email_id: data?.id, 
          timezone: userTimezone,
          preferred_time: settings?.agenda_email_time 
        };
        sent++;
      } catch (e) {
        console.error("Error sending email to user", userId, e);
        results[userId] = { status: "email_exception", error: String(e) };
      }
    }

    return new Response(
      JSON.stringify({ processed_users: Object.keys(grouped).length, sent, results }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("daily-agenda-summary error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});