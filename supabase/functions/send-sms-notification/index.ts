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
const MAX_PER_CATEGORY = 40;

interface SmsRequest {
  behaviorScoreId: string;
  studentId: string;
  score: number;
  date: string;
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    // Africa's Talking
    const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");
    const atUsername = Deno.env.get("AFRICASTALKING_USERNAME");

    // TextBee.dev
    const textbeeApiKey = Deno.env.get("TEXTBEE_API_KEY");
    const textbeeDeviceId = Deno.env.get("TEXTBEE_DEVICE_ID");

    console.log("SMS Notification function called");
    console.log(`TextBee configured: ${!!textbeeApiKey && !!textbeeDeviceId}`);
    console.log(`Africa's Talking configured: ${!!atApiKey && !!atUsername}`);
    console.log(`Twilio configured: ${!!twilioAccountSid && !!twilioAuthToken}`);

    // --- Authorization -----------------------------------------------------
    // Normal calls require a verified user JWT plus an academic-staff DB role.
    // Trusted internal calls (cron retry / email fallback) use the shared
    // secret instead of impersonating a user; a bad secret is always denied.
    if (req.headers.has("x-internal-secret")) {
      const denied = requireInternalSecret(req);
      if (denied) return denied;
      console.log("SMS request authorized via internal secret");
    } else {
      const user = await getUser(req, supabaseUrl, supabaseAnonKey);
      const denied = await requireRole(
        user,
        supabaseUrl,
        supabaseServiceKey,
        STAFF_ROLES,
      );
      if (denied) return denied;
      console.log(`SMS request authorized for user: ${user!.id}`);
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

    console.log(`Processing SMS for student: ${studentId}, score: ${score}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Trusted score data ------------------------------------------------
    // Never trust a score supplied by the caller: re-read the real row and use
    // its score, date and category. Reject mismatched student references.
    const { data: behaviorScore, error: scoreError } = await supabase
      .from("behavior_scores")
      .select("id, student_id, score, score_date, category")
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
      console.error("Behavior score/student mismatch");
      return json({ error: "Behavior score does not belong to this student" }, 403);
    }

    const trustedScore = Number(behaviorScore.score);
    if (!Number.isFinite(trustedScore)) {
      return json({ error: "Stored behavior score is invalid" }, 500);
    }
    const trustedDate = String(behaviorScore.score_date ?? date).slice(0, 10);
    let category = String((behaviorScore as any).category ?? "behavior");
    let deduction = Math.abs(trustedScore);

    // Get student details (service role): verify the referenced student exists.
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

    // Get primary contact parents
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

    const results = [];

    for (const link of parentLinks) {
      const parent = link.parent as any;
      if (!parent || !parent.phone) {
        console.log("Parent has no phone number, skipping");
        continue;
      }

      const remainingInCategory = Math.max(0, MAX_PER_CATEGORY - deduction);
      const childName = `${student.first_name} ${student.last_name}`;
      const className = (student as any).class?.name || "N/A";

      // Clear, well-structured bilingual SMS
      const englishPart =
        `COLLEGE DE REBERO\n` +
        `Dear Parent,\n` +
        `Student: ${childName} (Class: ${className})\n` +
        `Date: ${trustedDate}\n` +
        `Category: ${category}\n` +
        `Deducted: ${deduction}/${MAX_PER_CATEGORY} marks\n` +
        `Remaining: ${remainingInCategory}/${MAX_PER_CATEGORY}\n` +
        `Thank you.`;

      const kinyarwandaPart =
        `COLLEGE DE REBERO\n` +
        `Mwiriwe Mubyeyi,\n` +
        `Umwana: ${childName} (Ishuri: ${className})\n` +
        `Itariki: ${trustedDate}\n` +
        `Icyiciro: ${category}\n` +
        `Yakuweho: ${deduction}/${MAX_PER_CATEGORY} amanota\n` +
        `Asigaye: ${remainingInCategory}/${MAX_PER_CATEGORY}\n` +
        `Murakoze.`;

      const message = `${englishPart}\n\n---\n\n${kinyarwandaPart}`;

      let smsStatus = "pending";
      let errorMessage = null;

      console.log(`Preparing to send SMS to ${parent.phone}`);

      // Try TextBee.dev first (preferred)
      if (textbeeApiKey && textbeeDeviceId) {
        try {
          console.log(`Sending SMS to ${parent.phone} via TextBee.dev`);
          const tbResponse = await fetch(
            `https://api.textbee.dev/api/v1/gateway/devices/${textbeeDeviceId}/send-sms`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": textbeeApiKey,
              },
              body: JSON.stringify({
                recipients: [parent.phone],
                message: message,
              }),
            }
          );

          const tbText = await tbResponse.text();
          console.log(`TextBee response status: ${tbResponse.status}`);
          console.log(`TextBee response: ${tbText}`);

          if (tbResponse.ok) {
            smsStatus = "sent";
            console.log(`SMS sent to ${parent.phone} via TextBee`);
          } else {
            errorMessage = `TextBee error [${tbResponse.status}]: ${tbText}`;
            smsStatus = "failed";
          }
        } catch (e: any) {
          console.error(`TextBee error: ${e.message}`);
          errorMessage = e.message;
          smsStatus = "failed";
        }
      }
      // Try Twilio
      else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
        try {
          const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              },
              body: new URLSearchParams({
                To: parent.phone,
                From: twilioPhoneNumber,
                Body: message,
              }),
            }
          );

          if (twilioResponse.ok) {
            smsStatus = "sent";
            console.log(`SMS sent to ${parent.phone} via Twilio`);
          } else {
            const errorData = await twilioResponse.json();
            errorMessage = errorData.message || "Twilio error";
            smsStatus = "failed";
          }
        } catch (e: any) {
          errorMessage = e.message;
          smsStatus = "failed";
        }
      }
      // Try Africa's Talking
      else if (atApiKey && atUsername) {
        try {
          console.log(`Sending SMS to ${parent.phone} via Africa's Talking`);
          console.log(`Using username: ${atUsername}`);

          // Use sandbox URL if username is 'sandbox', otherwise use live URL
          const atBaseUrl = atUsername === 'sandbox'
            ? 'https://api.sandbox.africastalking.com'
            : 'https://api.africastalking.com';

          const atResponse = await fetch(
            `${atBaseUrl}/version1/messaging`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "apiKey": atApiKey,
                "Accept": "application/json",
              },
              body: new URLSearchParams({
                username: atUsername,
                to: parent.phone,
                message: message,
              }),
            }
          );

          const responseText = await atResponse.text();
          console.log(`Africa's Talking response status: ${atResponse.status}`);
          console.log(`Africa's Talking response: ${responseText}`);

          if (atResponse.ok) {
            try {
              const responseData = JSON.parse(responseText);
              // Check if the SMS was actually sent successfully
              if (responseData.SMSMessageData?.Recipients?.[0]?.status === "Success") {
                smsStatus = "sent";
                console.log(`SMS sent successfully to ${parent.phone}`);
              } else if (responseData.SMSMessageData?.Recipients?.[0]?.status) {
                smsStatus = "failed";
                errorMessage = responseData.SMSMessageData.Recipients[0].status;
              } else {
                smsStatus = "sent";
                console.log(`SMS queued for ${parent.phone}`);
              }
            } catch {
              // Response wasn't JSON but was successful
              smsStatus = "sent";
            }
          } else {
            errorMessage = responseText;
            smsStatus = "failed";
          }
        } catch (e: any) {
          console.error(`Africa's Talking error: ${e.message}`);
          errorMessage = e.message;
          smsStatus = "failed";
        }
      } else {
        // No SMS provider configured - log the notification
        console.log(`SMS notification queued (no provider configured): ${message}`);
        smsStatus = "pending";
        errorMessage = "No SMS provider configured";
      }

      // Create SMS notification record
      const { error: insertError } = await supabase
        .from("sms_notifications")
        .insert({
          behavior_score_id: behaviorScoreId,
          parent_id: parent.id,
          phone_number: parent.phone,
          message: message,
          status: smsStatus,
          sent_at: smsStatus === "sent" ? new Date().toISOString() : null,
          error_message: errorMessage,
        });

      if (insertError) {
        console.error("Error inserting SMS notification:", insertError);
      }

      // If SMS failed, try to send email as backup. The email function now
      // requires the shared internal secret for trusted server-to-server calls.
      if (smsStatus === "failed" && parent.email) {
        const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
        if (!internalSecret) {
          console.error("INTERNAL_FUNCTION_SECRET not configured; skipping email backup");
        } else {
          console.log(`SMS failed, attempting email backup to ${parent.email}`);
          try {
            const emailResponse = await supabase.functions.invoke("send-email-notification", {
              body: {
                behaviorScoreId: behaviorScoreId,
                studentId: studentId,
                score: trustedScore,
                date: trustedDate,
                isSmsBackup: true,
              },
              headers: {
                "x-internal-secret": internalSecret,
              },
            });

            if (emailResponse.error) {
              console.error("Email backup also failed:", emailResponse.error);
            } else {
              console.log("Email backup sent successfully");
            }
          } catch (emailErr: any) {
            console.error("Error calling email backup:", emailErr.message);
          }
        }
      }

      results.push({
        parentId: parent.id,
        phone: parent.phone,
        status: smsStatus,
        error: errorMessage,
      });
    }

    return json({ success: true, results }, 200);
  } catch (error: any) {
    console.error("Error in send-sms-notification function:", error);
    return json({ error: error.message }, 500);
  }
};

serve(handler);
