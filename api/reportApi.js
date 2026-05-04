import { api } from "./api";
import { generateReportSampleData } from "../lib/reportSampleData";

/*
 * Report Dashboard Summaries
 *
 * GET /api/v1/report/dashboard-summary
 *
 */
export function getReportDashboardSummary(payload) {
  return api.post("/api/v1/report/dashboard-summary", payload);
}

/*
 * Throughout over time
 *
 * GET /api/v1/report/overview/throughput-over-time
 *
 */
export function getReportThroughputOverTime(payload) {
  return api.post("/api/v1/report/overview/throughput-over-time", payload);
}

/*
 * AI vs Human Corrections
 *
 * GET /api/v1/report/overview/ai-vs-human-corrections
 *
 */
export function getReportAiVsHumanCorrections(payload) {
  return api.post("/api/v1/report/overview/ai-vs-human-corrections", payload);
}

export async function fetchReportingDataset({ from, to } = {}) {
  // Simulate latency
  await new Promise((r) => setTimeout(r, 250));

  // const res = await fetch(`/api/reports?from=${from}&to=${to}`, { headers: { ... } });
  // if (!res.ok) throw new Error("Failed to fetch reports");
  // return await res.json();

  // For now: return sample dataset
  return generateReportSampleData({ days: 60, itemsPerDay: 8 });
}
