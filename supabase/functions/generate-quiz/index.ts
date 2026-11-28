import { getUser, json, requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "questions"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question_text", "option_a", "option_b", "option_c", "option_d", "correct_option", "explanation"],
        properties: {
          question_text: { type: "string" },
          option_a: { type: "string" },
          option_b: { type: "string" },
          option_c: { type: "string" },
          option_d: { type: "string" },
          correct_option: { type: "string", enum: ["a", "b", "c", "d"] },
          explanation: { type: "string" },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = await getUser(req, supabaseUrl, supabaseAnonKey);
    if (!user) return json({ error: "Please sign in." }, 401);
    const denied = await requireRole(
      user,
      supabaseUrl,
      serviceKey,
      ["admin", "teacher", "dos"],
      "Only authorized academic staff can generate quizzes",
    );
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const material = String(body.material ?? "").trim().slice(0, 20000);
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 20);
    const level = String(body.level ?? "").slice(0, 100);
    if (material.length < 3) return json({ error: "Enter a lesson topic or paste course material." }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    const prompt = `Create a multiple-choice quiz with exactly ${count} questions${level ? ` for ${level} students` : ""}, based on the following lesson topic or course material. Each question has exactly 4 options (a-d) with one correct answer. Keep questions clear and age-appropriate, options under 150 characters, explanation one short sentence. Title under 100 characters, description one sentence.\n\nMATERIAL:\n${material}`;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: "You are an experienced teacher at College De Rebero who writes accurate school quizzes.",
        input: prompt,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "quiz", strict: true, schema } },
      }),
    });

    const aig: Record<string, string> = {
      "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
    };
    upstream.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith("x-lovable-aig-")) aig[k] = v;
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text();
      console.error("gateway error", upstream.status, t);
      let msg = "AI generation failed. Please try again later.";
      if (upstream.status === 429) msg = "Too many requests right now. Please wait a moment and try again.";
      else if (upstream.status === 402) msg = "AI credits are used up. Add credits in your workspace billing settings.";
      else { try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* ignore */ } }
      return json({ error: msg }, upstream.status, aig);
    }

    // Consume SSE stream
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let failure: string | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") failure = "The AI declined to create this quiz.";
          else if (ev.type === "response.failed" || ev.type === "error")
            failure = ev.response?.error?.message ?? ev.message ?? "AI generation failed.";
        } catch { /* partial */ }
      }
    }
    if (failure) return json({ error: failure }, 502, aig);
    if (!text.trim()) return json({ error: "The AI returned no quiz. Try different material." }, 502, aig);

    let quiz;
    try { quiz = JSON.parse(text); } catch { return json({ error: "Could not read the AI response." }, 502, aig); }
    quiz.questions = (quiz.questions ?? []).slice(0, count);
    return json(quiz, 200, aig);
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
