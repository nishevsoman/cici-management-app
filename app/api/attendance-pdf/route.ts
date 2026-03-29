import { NextRequest, NextResponse } from "next/server";
import { execSync, spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchName, dateFrom, dateTo, summaries } = body;

    if (!summaries || summaries.length === 0) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // Write data to a temp JSON file
    const uid = randomUUID();
    const dataPath = join(tmpdir(), `att_data_${uid}.json`);
    const outPath = join(tmpdir(), `att_report_${uid}.pdf`);

    writeFileSync(dataPath, JSON.stringify({ batchName, dateFrom, dateTo, summaries }));

    // Python script inline
    const pythonScript = `
import json
import sys
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.graphics import renderPDF

data_path = sys.argv[1]
out_path = sys.argv[2]

with open(data_path) as f:
    data = json.load(f)

batch_name = data.get("batchName", "Batch")
date_from  = data.get("dateFrom", "")
date_to    = data.get("dateTo", "")
summaries  = data.get("summaries", [])

# ── Colours ──────────────────────────────────────────────────────
C_BG       = colors.HexColor("#0f1117")
C_CARD     = colors.HexColor("#161b27")
C_BORDER   = colors.HexColor("#2a3147")
C_TEXT     = colors.HexColor("#e8eaf0")
C_TEXT2    = colors.HexColor("#8b93a8")
C_ACCENT   = colors.HexColor("#4f7ef8")
C_GREEN    = colors.HexColor("#3ecf8e")
C_RED      = colors.HexColor("#f87171")
C_AMBER    = colors.HexColor("#fbbf24")
C_GREEN_DIM= colors.HexColor("#122c22")
C_RED_DIM  = colors.HexColor("#2d1515")
C_AMBER_DIM= colors.HexColor("#2d2110")
WHITE      = colors.white

# ── Styles ───────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

S_TITLE = style("Title2", fontName="Helvetica-Bold", fontSize=22,
                textColor=WHITE, spaceAfter=4, leading=28)
S_SUB   = style("Sub",   fontName="Helvetica",      fontSize=11,
                textColor=C_TEXT2, spaceAfter=2)
S_LABEL = style("Label", fontName="Helvetica",      fontSize=9,
                textColor=C_TEXT2)
S_VALUE = style("Value", fontName="Helvetica-Bold", fontSize=14,
                textColor=WHITE)
S_BODY  = style("Body2", fontName="Helvetica",      fontSize=9,
                textColor=C_TEXT)
S_BOLD  = style("Bold2", fontName="Helvetica-Bold", fontSize=9,
                textColor=C_TEXT)
S_SECTION = style("Sec", fontName="Helvetica-Bold", fontSize=12,
                  textColor=WHITE, spaceBefore=10, spaceAfter=6)
S_STUDENT_NAME = style("StName", fontName="Helvetica-Bold", fontSize=10,
                       textColor=WHITE)
S_STUDENT_SUB  = style("StSub",  fontName="Helvetica", fontSize=8,
                       textColor=C_TEXT2)

# ── Document ─────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    out_path,
    pagesize=A4,
    leftMargin=1.8*cm, rightMargin=1.8*cm,
    topMargin=1.8*cm,  bottomMargin=1.8*cm,
    title=f"Attendance Report - {batch_name}",
)

page_w = A4[0] - 3.6*cm
story  = []

# ── Header ───────────────────────────────────────────────────────
story.append(Paragraph(f"Attendance Report", S_TITLE))
story.append(Paragraph(f"{batch_name}  &bull;  {date_from} to {date_to}", S_SUB))
story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=14))

# ── Overall summary stats ─────────────────────────────────────────
total_p = sum(s["present"] for s in summaries)
total_a = sum(s["absent"]  for s in summaries)
total_t = total_p + total_a
avg_pct = round(sum(s["percentage"] for s in summaries) / len(summaries)) if summaries else 0

stat_data = [
    [Paragraph("STUDENTS",     S_LABEL), Paragraph("DAYS PRESENT",S_LABEL),
     Paragraph("DAYS ABSENT",  S_LABEL), Paragraph("AVG ATTENDANCE",S_LABEL)],
    [Paragraph(str(len(summaries)), S_VALUE), Paragraph(str(total_p), S_VALUE),
     Paragraph(str(total_a),        S_VALUE), Paragraph(f"{avg_pct}%", S_VALUE)],
]
stat_col = page_w / 4
stat_t = Table(stat_data, colWidths=[stat_col]*4, spaceBefore=0, spaceAfter=14)
stat_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), C_CARD),
    ("GRID",       (0,0), (-1,-1), 0.5, C_BORDER),
    ("ROUNDEDCORNERS", [4]),
    ("TOPPADDING",    (0,0), (-1,-1), 10),
    ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING",   (0,0), (-1,-1), 14),
    ("RIGHTPADDING",  (0,0), (-1,-1), 14),
    ("TEXTCOLOR", (0,1), (1,1), C_GREEN),    # present = green
    ("TEXTCOLOR", (2,1), (2,1), C_RED),      # absent  = red
    ("TEXTCOLOR", (3,1), (3,1),
     C_GREEN if avg_pct >= 75 else C_AMBER if avg_pct >= 50 else C_RED),
]))
story.append(stat_t)

# ── Per-student summary table ─────────────────────────────────────
story.append(Paragraph("Student Summary", S_SECTION))

def pct_color(p):
    if p >= 75: return C_GREEN
    if p >= 50: return C_AMBER
    return C_RED

def status_label(p):
    if p >= 75: return ("Good",     C_GREEN,     C_GREEN_DIM)
    if p >= 50: return ("Low",      C_AMBER,     C_AMBER_DIM)
    return             ("Critical", C_RED,       C_RED_DIM)

header = [
    Paragraph("Student",      S_BOLD),
    Paragraph("Phone",        S_BOLD),
    Paragraph("Present",      S_BOLD),
    Paragraph("Absent",       S_BOLD),
    Paragraph("Total",        S_BOLD),
    Paragraph("Attendance %", S_BOLD),
    Paragraph("Status",       S_BOLD),
]
rows = [header]
row_styles = []

for i, s in enumerate(summaries):
    pct = s["percentage"]
    label, lc, bg = status_label(pct)
    row_idx = i + 1

    # Shade alternate rows
    row_styles.append(("BACKGROUND", (0, row_idx), (-1, row_idx),
                       C_CARD if i % 2 == 0 else colors.HexColor("#1a2030")))
    row_styles.append(("TEXTCOLOR", (2, row_idx), (2, row_idx), C_GREEN))
    row_styles.append(("TEXTCOLOR", (3, row_idx), (3, row_idx), C_RED))
    pct_c = pct_color(pct)
    row_styles.append(("TEXTCOLOR", (5, row_idx), (5, row_idx), pct_c))
    row_styles.append(("TEXTCOLOR", (6, row_idx), (6, row_idx), lc))

    rows.append([
        Paragraph(s["name"],          S_BODY),
        Paragraph(s.get("phone","—"), S_BODY),
        Paragraph(str(s["present"]),  S_BODY),
        Paragraph(str(s["absent"]),   S_BODY),
        Paragraph(str(s["total"]),    S_BODY),
        Paragraph(f'{pct}%',          S_BODY),
        Paragraph(label,              S_BODY),
    ])

col_w = [page_w*0.26, page_w*0.17, page_w*0.10, page_w*0.10,
         page_w*0.10, page_w*0.14, page_w*0.13]
summary_t = Table(rows, colWidths=col_w, repeatRows=1, spaceBefore=0, spaceAfter=20)
ts = TableStyle([
    ("BACKGROUND",    (0,0), (-1,0),   C_ACCENT),
    ("TEXTCOLOR",     (0,0), (-1,0),   WHITE),
    ("GRID",          (0,0), (-1,-1),  0.4, C_BORDER),
    ("TOPPADDING",    (0,0), (-1,-1),  7),
    ("BOTTOMPADDING", (0,0), (-1,-1),  7),
    ("LEFTPADDING",   (0,0), (-1,-1),  10),
    ("RIGHTPADDING",  (0,0), (-1,-1),  10),
    ("ROWBACKGROUNDS",(0,1), (-1,-1),  [C_CARD, colors.HexColor("#1a2030")]),
    ("LINEBELOW",     (0,0), (-1,0),   1, C_ACCENT),
])
for s in row_styles:
    ts.add(*s)
summary_t.setStyle(ts)
story.append(summary_t)

# ── Individual student detail pages ──────────────────────────────
story.append(PageBreak())
story.append(Paragraph("Individual Student Reports", S_SECTION))

for idx, s in enumerate(summaries):
    pct = s["percentage"]
    label, lc, bg = status_label(pct)

    # Student name block
    name_data = [[
        Paragraph(s["name"],                          S_STUDENT_NAME),
        Paragraph(f'Phone: {s.get("phone","—")}',     S_STUDENT_SUB),
        Paragraph(f'{pct}% — {label}', ParagraphStyle("X", fontName="Helvetica-Bold",
                  fontSize=12, textColor=lc)),
    ]]
    name_t = Table(name_data, colWidths=[page_w*0.4, page_w*0.35, page_w*0.25])
    name_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), bg),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("GRID",          (0,0), (-1,-1), 0.5, C_BORDER),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))

    # Mini stats row for this student
    mini = [[
        Paragraph(f'Present: <font color="#3ecf8e"><b>{s["present"]}</b></font>', S_BODY),
        Paragraph(f'Absent: <font color="#f87171"><b>{s["absent"]}</b></font>',  S_BODY),
        Paragraph(f'Total: <b>{s["total"]}</b>',  S_BODY),
    ]]
    mini_t = Table(mini, colWidths=[page_w/3]*3)
    mini_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_CARD),
        ("GRID",          (0,0), (-1,-1), 0.4, C_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
    ]))

    # Records table — max 3 columns side by side
    records = sorted(s.get("records", []), key=lambda r: r["date"])
    rec_header = [Paragraph("Date", S_BOLD), Paragraph("Day", S_BOLD), Paragraph("Status", S_BOLD)]
    rec_rows = [rec_header]
    for r in records:
        try:
            import datetime
            d = datetime.date.fromisoformat(r["date"])
            day_name = d.strftime("%A")
        except:
            day_name = ""
        is_present = r["status"] == "present"
        status_p = Paragraph(
            f'<font color="{"#3ecf8e" if is_present else "#f87171"}"><b>{"Present" if is_present else "Absent"}</b></font>',
            S_BODY
        )
        rec_rows.append([
            Paragraph(r["date"], S_BODY),
            Paragraph(day_name,  S_BODY),
            status_p,
        ])

    rec_col = [page_w*0.35, page_w*0.38, page_w*0.27]
    rec_t = Table(rec_rows, colWidths=rec_col, repeatRows=1) if len(rec_rows) > 1 else None

    if rec_t:
        rec_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), C_ACCENT),
            ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
            ("GRID",          (0,0), (-1,-1), 0.4, C_BORDER),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [C_CARD, colors.HexColor("#1a2030")]),
        ]))

    block = [name_t, Spacer(1, 4), mini_t, Spacer(1, 8)]
    if rec_t:
        block.append(rec_t)
    block.append(Spacer(1, 16))

    story.append(KeepTogether(block[:3]))  # keep header + mini together
    if rec_t:
        story.append(rec_t)
    story.append(Spacer(1, 16))

    if idx < len(summaries) - 1 and len(records) > 20:
        story.append(PageBreak())


# ── Footer via canvas ────────────────────────────────────────────
def add_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(C_TEXT2)
    canvas.setFont("Helvetica", 8)
    w, h = A4
    canvas.drawString(1.8*cm, 1.0*cm, f"AttendTrack  |  {batch_name}  |  {date_from} to {date_to}")
    canvas.drawRightString(w - 1.8*cm, 1.0*cm, f"Page {doc.page}")
    canvas.restoreState()

doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
print("OK")
`;

    const scriptPath = join(tmpdir(), `gen_pdf_${uid}.py`);
    writeFileSync(scriptPath, pythonScript);

    // Run python
    const result = spawnSync("python3", [scriptPath, dataPath, outPath], {
      timeout: 30000,
      encoding: "utf8",
    });

    // Cleanup temp files
    try { unlinkSync(dataPath); } catch {}
    try { unlinkSync(scriptPath); } catch {}

    if (result.status !== 0) {
      const errMsg = result.stderr || result.stdout || "Unknown python error";
      console.error("PDF gen error:", errMsg);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    // Read PDF and return
    const pdfBuffer = readFileSync(outPath);
    try { unlinkSync(outPath); } catch {}

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance_report.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("API route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
