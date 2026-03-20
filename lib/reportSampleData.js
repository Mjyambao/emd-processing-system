// lib/reportSampleData.js
// Synthetic data for Reporting module (safe to remove once wired to backend).

function rand(seed) {
  // deterministic-ish PRNG based on seed
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick(list, r) {
  return list[Math.floor(r * list.length)];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISO(dt) {
  // Keep it simple, store as ISO string
  return dt.toISOString();
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function generateReportSampleData({
  days = 30,
  itemsPerDay = 10,
  startFromNow = true,
} = {}) {
  const ticketers = ["Susan Wan Chen", "Boden Woolstencroft", "Matt Quinn"];
  const stages = [
    "Triage",
    "EMD Mask Checking",
    "Deal Matching",
    "Issue EMD",
    "Invoicing",
  ];

  const errorClasses = [
    "No deal table",
    "Fare rule mismatch",
    "SSR mismatch",
    "Tax calc failed",
    "Mask validation",
    "LLM parsing",
  ];

  const rfic = ["A", "B", "C", "D"];
  const rfisc = ["0B5", "0B6", "0EF", "0EX", "0ZZ"];

  const out = [];
  const now = new Date();
  const base = startFromNow ? now : new Date("2026-03-01T00:00:00.000Z");

  let idx = 0;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < itemsPerDay; i++) {
      const seed = (d + 1) * 1000 + i * 17 + 42;
      const r1 = rand(seed);
      const r2 = rand(seed + 1);
      const r3 = rand(seed + 2);
      const r4 = rand(seed + 3);
      const r5 = rand(seed + 4);

      const dayStart = new Date(base);
      dayStart.setDate(base.getDate() - (days - 1 - d));
      dayStart.setHours(0, 0, 0, 0);

      const createdAt = new Date(dayStart);
      createdAt.setHours(Math.floor(r1 * 24), Math.floor(r2 * 60), 0, 0);

      // status distribution: processed > human > error
      const statusRoll = r3;
      const status =
        statusRoll < 0.65 ? "processed" : statusRoll < 0.82 ? "human" : "error";

      // completion time: processed faster, error/human longer
      const baseMinutes =
        status === "processed"
          ? 20 + Math.floor(r4 * 60)
          : status === "human"
            ? 45 + Math.floor(r4 * 120)
            : 30 + Math.floor(r4 * 160);

      const completedAt =
        status === "processed"
          ? new Date(createdAt.getTime() + baseMinutes * 60000)
          : // not always completed
            rand(seed + 20) < 0.55
            ? new Date(createdAt.getTime() + baseMinutes * 60000)
            : null;

      const assigned = pick(ticketers, r2);

      const hilRequired = status === "human" || rand(seed + 7) < 0.12;

      // SLA minutes (example)
      const slaMinutes = 90;
      const completionMinutes = completedAt
        ? minutesBetween(createdAt, completedAt)
        : null;

      const slaBreached =
        completedAt && completionMinutes > slaMinutes ? true : false;

      const hasError = status === "error";
      const errorClass = hasError ? pick(errorClasses, r4) : "";
      const errorStage = hasError ? pick(stages, r5) : pick(stages, r1);

      // AI vs Human RFIC/RFISC
      const aiRFIC = pick(rfic, r1);
      const aiRFISC = pick(rfisc, r2);
      const humanCorrected = hilRequired && rand(seed + 9) < 0.55;

      const humanRFIC = humanCorrected ? pick(rfic, r3) : aiRFIC;
      const humanRFISC = humanCorrected ? pick(rfisc, r4) : aiRFISC;

      // LLM metrics (0..1)
      const llm = {
        accuracy: 0.72 + rand(seed + 30) * 0.26,
        consistency: 0.68 + rand(seed + 31) * 0.28,
        groundedness: 0.62 + rand(seed + 32) * 0.32,
        coherence: 0.74 + rand(seed + 33) * 0.22,
      };

      // ADMs + Feedback
      const adm = rand(seed + 40) < 0.08; // ~8%
      const feedback = rand(seed + 41) < 0.18; // ~18%

      idx++;
      const pnr = `RP${pad2((d + 1) % 100)}${pad2((i + 1) % 100)}${String(
        idx,
      ).slice(-2)}`;

      out.push({
        pnr,
        passenger: pick(
          ["James Doe", "Clara Smith", "Amir Khan", "Nina Reyes", "Wei Zhang"],
          r3,
        ),
        status, // processed | human | error
        stage: errorStage,
        errorClass,
        assigned,
        hilRequired,
        aiRFIC,
        aiRFISC,
        humanRFIC,
        humanRFISC,
        llm,
        createdAt: toISO(createdAt),
        completedAt: completedAt ? toISO(completedAt) : null,
        completionMinutes,
        slaMinutes,
        slaBreached,
        adm,
        feedback,
      });
    }
  }

  return out;
}
