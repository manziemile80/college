import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Cron authentication (verify_jwt is intentionally false for cron) ----
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured; refusing retry job");
    return json({ error: "Cron secret is not configured" }, 403);
  }
  const providedSecret = req.headers.get("x-cron-secret");
  if (!providedSecret) {
    return json({ error: "Missing x-cron-secret header" }, 401);
  }
  if (providedSecret !== cronSecret) {
    return json({ error: "Invalid x-cron-secret" }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Retry failed SMS job started");

    // Get failed SMS notifications from the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: failedNotifications, error: fetchError } = await supabase
      .from("sms_notifications")
      .select("*, behavior_score:behavior_scores(student_id, score, score_date)")
      .eq("status", "failed")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error("Error fetching failed notifications:", fetchError);
      throw fetchError;
    }

    if (!failedNotifications || failedNotifications.length === 0) {
      console.log("No failed SMS notifications to retry");
      return json({ message: "No failed notifications to retry", retried: 0 }, 200);
    }

    console.log(`Found ${failedNotifications.length} failed notification(s) to retry`);

    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      console.error("INTERNAL_FUNCTION_SECRET not configured; cannot invoke SMS function");
      return json({ error: "Internal function secret is not configured" }, 500);
    }

    const results = [];

    for (const notification of failedNotifications) {
      const behaviorScore = notification.behavior_score;

      if (!behaviorScore) {
        console.log(`Skipping notification ${notification.id} - no behavior score found`);
        continue;
      }

      console.log(`Retrying SMS for notification ${notification.id}`);

      // Preserve history: never delete the failed row. Mark it as retrying
      // instead (status is a free-text column). If the update is rejected,
      // leave the row untouched and continue with the re-invocation.
      const { error: markError } = await supabase
        .from("sms_notifications")
        .update({ status: "retrying" })
        .eq("id", notification.id);
      if (markError) {
        console.error(`Could not mark notification ${notification.id} as retrying:`, markError);
      }

      // Call the send-sms-notification function with the trusted internal secret.
      const { data, error } = await supabase.functions.invoke("send-sms-notification", {
        body: {
          behaviorScoreId: notification.behavior_score_id,
          studentId: behaviorScore.student_id,
          score: behaviorScore.score,
          date: behaviorScore.score_date,
        },
        headers: {
          "x-internal-secret": internalSecret,
        },
      });

      if (error) {
        console.error(`Error retrying notification ${notification.id}:`, error);
        // Restore the original status for auditability.
        await supabase
          .from("sms_notifications")
          .update({ status: "failed", error_message: `Retry failed: ${error.message}` })
          .eq("id", notification.id);
        results.push({ id: notification.id, status: "error", error: error.message });
      } else {
        console.log(`Successfully retried notification ${notification.id}`);
        results.push({ id: notification.id, status: "retried", result: data });
      }
    }

    console.log("Retry job completed", results);

    return json({ success: true, retried: results.length, results }, 200);
  } catch (error: any) {
    console.error("Error in retry-failed-sms function:", error);
    return json({ error: error.message }, 500);
  }
};

serve(handler);
