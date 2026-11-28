import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getUser,
  isUuid,
  json,
  requireInternalSecret,
  requireRole,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const STAFF_ROLES = ["admin", "teacher", "dos", "dod"];

interface EmailRequest {
  behaviorScoreId: string;
  studentId: string;
  score: number;
  date: string;
  isSmsBackup?: boolean;
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

/** Send via the Resend REST API using Deno's global fetch. */
async function sendWithResend(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response; handled below.
  }
  if (!response.ok) {
    return {
      ok: false,
      id: null,
      error: payload?.message ?? payload?.error ?? `Resend error [${response.status}]`,
    };
  }
  return { ok: true, id: payload?.id ?? null, error: null };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return json({ error: "Email service not configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Authorization -----------------------------------------------------
    // Normal calls: verified JWT + academic-staff DB role.
    // SMS backup calls: trusted server-to-server path guarded by the shared secret.
    if (req.headers.has("x-internal-secret")) {
      const denied = requireInternalSecret(req);
      if (denied) return denied;
      console.log("Email request authorized via internal secret (SMS backup)");
    } else {
      const user = await getUser(req, supabaseUrl, supabaseAnonKey);
      const denied = await requireRole(
        user,
        supabaseUrl,
        supabaseServiceKey,
        STAFF_ROLES,
      );
      if (denied) return denied;
      console.log(`Email request authorized for user: ${user!.id}`);
    }

    // --- Input validation --------------------------------------------------
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "Invalid request body" }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const behaviorScoreId = body.behaviorScoreId;
    const studentId = body.studentId;
    const score = body.score;
    const date = body.date;
    const isSmsBackup = body.isSmsBackup === true;

    if (!isUuid(behaviorScoreId)) {
      return json({ error: "behaviorScoreId must be a valid UUID" }, 400);
    }
    if (!isUuid(studentId)) {
      return json({ error: "studentId must be a valid UUID" }, 400);
    }
    if (typeof score !== "number" || !Number.isFinite(score)) {
      return json({ error: "score must be a finite number" }, 400);
    }
    if (!isDateString(date)) {
      return json({ error: "date must be a valid date string" }, 400);
    }

    console.log(`Processing email notification for student: ${studentId}, score: ${score}`);
    console.log(`Is SMS backup: ${isSmsBackup}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Re-read the real score row; never use a caller-supplied score in the email.
    const { data: behaviorScore, error: scoreError } = await supabase
      .from("behavior_scores")
      .select("id, student_id, score, score_date")
      .eq("id", behaviorScoreId)
      .maybeSingle();

    if (scoreError) {
      console.error("Error loading behavior score:", scoreError);
      return json({ error: "Could not verify behavior score" }, 500);
    }
    if (!behaviorScore) {
      return json({ error: "Behavior score not found" }, 404);
    }
    if (behaviorScore.student_id !== studentId) {
      return json({ error: "Behavior score does not belong to this student" }, 403);
    }
    const trustedScore = Number(behaviorScore.score);
    if (!Number.isFinite(trustedScore)) {
      return json({ error: "Stored behavior score is invalid" }, 500);
    }
    const trustedDate = String(behaviorScore.score_date ?? date).slice(0, 10);

    // Get student details
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("first_name, last_name, class:classes(name)")
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
      console.error("Student not found:", studentError);
      return json({ error: "Student not found" }, 404);
    }

    console.log(`Student found: ${student.first_name} ${student.last_name}`);

    // Get primary contact parents with email
    const { data: parentLinks } = await supabase
      .from("student_parents")
      .select("parent:parents(*)")
      .eq("student_id", studentId)
      .eq("is_primary_contact", true);

    if (!parentLinks || parentLinks.length === 0) {
      console.log("No primary contact parent found for student");
      return json({ message: "No primary contact parent found" }, 200);
    }

    console.log(`Found ${parentLinks.length} primary contact parent(s)`);

    // Determine "from" address - use verified domain if available
    const fromDomain = Deno.env.get("RESEND_FROM_DOMAIN");
    const fromAddress = fromDomain
      ? `Behavior Tracker <notifications@${fromDomain}>`
      : "Behavior Tracker <onboarding@resend.dev>";
    console.log(`Sending from: ${fromAddress}`);

    const results = [];

    for (const link of parentLinks) {
      const parent = link.parent as any;
      if (!parent || !parent.email) {
        console.log("Parent has no email, skipping");
        continue;
      }

      const subject = isSmsBackup
        ? `[Important] Behavior Score Update for ${student.first_name} ${student.last_name}`
        : `Behavior Score Update for ${student.first_name} ${student.last_name}`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Behavior Score Update</h2>
          ${isSmsBackup ? '<p style="color: #e74c3c; font-size: 14px;"><em>Note: SMS delivery failed, sending this email as backup notification.</em></p>' : ''}
          <p>Dear ${parent.full_name},</p>
          <p>We would like to inform you that the behavior score for your child has been updated:</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Student:</strong> ${student.first_name} ${student.last_name}</p>
            <p style="margin: 5px 0;"><strong>Score:</strong> ${trustedScore}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${trustedDate}</p>
          </div>
          <p>Thank you for your continued support in your child's education.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from the Student Behavior Management System.
          </p>
        </div>
      `;

      console.log(`Sending email to ${parent.email}`);

      let emailStatus = "pending";
      let errorMessage = null;
      let resendMessageId = null;

      try {
        const result = await sendWithResend(
          resendApiKey,
          fromAddress,
          [parent.email],
          subject,
          htmlContent,
        );
        if (result.ok) {
          console.log(`Email sent successfully to ${parent.email}:`, result.id);
          emailStatus = "sent";
          resendMessageId = result.id;
        } else {
          console.error(`Failed to send email to ${parent.email}:`, result.error);
          emailStatus = "failed";
          errorMessage = result.error;
        }
      } catch (emailError: any) {
        console.error(`Failed to send email to ${parent.email}:`, emailError);
        emailStatus = "failed";
        errorMessage = emailError.message;
      }

      // Log to email_notifications table
      const { error: insertError } = await supabase
        .from("email_notifications")
        .insert({
          behavior_score_id: behaviorScoreId,
          parent_id: parent.id,
          email_address: parent.email,
          subject: subject,
          message: htmlContent,
          status: emailStatus,
          sent_at: emailStatus === "sent" ? new Date().toISOString() : null,
          error_message: errorMessage,
          is_sms_backup: isSmsBackup,
          resend_message_id: resendMessageId,
        });

      if (insertError) {
        console.error("Error logging email notification:", insertError);
      }

      results.push({
        parentId: parent.id,
        email: parent.email,
        status: emailStatus,
        messageId: resendMessageId,
        error: errorMessage,
      });
    }

    return json({ success: true, results }, 200);
  } catch (error: any) {
    console.error("Error in send-email-notification function:", error);
    return json({ error: error.message }, 500);
  }
};

serve(handler);
