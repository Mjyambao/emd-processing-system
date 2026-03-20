import { generateReportSampleData } from "../lib/reportSampleData";

export async function fetchReportingDataset({ from, to } = {}) {
  // Simulate latency
  await new Promise((r) => setTimeout(r, 250));

  // const res = await fetch(`/api/reports?from=${from}&to=${to}`, { headers: { ... } });
  // if (!res.ok) throw new Error("Failed to fetch reports");
  // return await res.json();

  // For now: return sample dataset
  return generateReportSampleData({ days: 60, itemsPerDay: 8 });
}
