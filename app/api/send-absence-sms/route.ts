import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MSG91_API_KEY = process.env.MSG91_API_KEY!;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID!;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID!;

async function sendSMS(phone: string, message: string): Promise<boolean> {
  // Normalize: strip leading 0 or +91, ensure 10 digits, then prepend 91
  const digits = phone.replace(/\D/g, "");
  const normalized =
    digits.startsWith("91") && digits.length === 12
      ? digits
      : `91${digits.slice(-10)}`;

  const url = "https://control.msg91.com/api/v5/flow/";

  const payload = {
    template_id: MSG91_TEMPLATE_ID,
    sender: MSG91_SENDER_ID,
    short_url: "0",
    recipients: [
      {
        mobiles: normalized,
        // These variable names must match your MSG91 DLT-approved template.
        // e.g. template: "Dear parent, ##studentname## was absent on ##date## in ##batchname##."
        var1: message, // fallback if using a single-var template
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: MSG91_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return data.type === "success";
}

export async function POST(req: NextRequest) {
  try {
    const { batchId, date } = await req.json();

    if (!batchId || !date) {
      return NextResponse.json(
        { error: "batchId and date are required" },
        { status: 400 }
      );
    }

    // 1. Get batch name
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("name")
      .eq("id", batchId)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // 2. Get absent students for this batch + date (with their phone numbers)
    const { data: absences, error: absErr } = await supabase
      .from("attendance")
      .select("student_id, students(name, phone)")
      .eq("batch_id", batchId)
      .eq("date", date)
      .eq("status", "absent");

    if (absErr) {
      return NextResponse.json({ error: absErr.message }, { status: 500 });
    }

    if (!absences || absences.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No absent students — no SMS sent.",
        sent: 0,
        failed: 0,
      });
    }

    // 3. Send SMS to each absent student's phone
    const formattedDate = new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const results = await Promise.allSettled(
      absences.map(async (record: any) => {
        const student = record.students;
        if (!student?.phone) return { skipped: true, name: student?.name };

        const message = `Dear parent, ${student.name} was marked ABSENT in ${batch.name} on ${formattedDate}. Please contact the institute for more information.`;

        const ok = await sendSMS(student.phone, message);
        return { ok, name: student.name, phone: student.phone };
      })
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    results.forEach((r) => {
      if (r.status === "fulfilled") {
        if ((r.value as any).skipped) skipped++;
        else if ((r.value as any).ok) sent++;
        else failed++;
      } else {
        failed++;
      }
    });

    return NextResponse.json({ success: true, sent, failed, skipped });
  } catch (err: any) {
    console.error("SMS route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
