import api from "./api";

// ------------------------------
// Dashboard
// ------------------------------
export function getDashboardSummary({ start_date, end_date } = {}) {
  api.get("/api/v1/report/dashboard-summary", {
    query: {
      start_date,
      end_date,
    },
  });
}

// ------------------------------
// Overview
// ------------------------------
export function getThroughputOverTime({ start_date, end_date } = {}) {
  return api.get("/api/v1/report/overview/throughput-over-time", {
    query: {
      start_date,
      end_date,
    },
  });
}

export function getAiVsHumanCorrections({ start_date, end_date } = {}) {
  return api.get("/api/v1/report/overview/ai-vs-human-corrections", {
    query: {
      start_date,
      end_date,
    },
  });
}

// ------------------------------
// Operations
// ------------------------------
export function getEndToEndAvgTime({ start_date, end_date } = {}) {
  return api.get("/api/v1/report/operations/end-to-end-avg-time", {
    query: {
      start_date,
      end_date,
    },
  });
}

export function getAssignmentsToTicketers({
  start_date,
  end_date,
  signal,
} = {}) {
  return api.get("/api/v1/report/operations/assignment-to-ticketers", {
    query: {
      start_date,
      end_date,
    },
  });
}

export function getErrorVisibilityClassification({
  start_date,
  end_date,
  signal,
} = {}) {
  return api.get("/api/v1/report/operations/error-visibility-classification", {
    query: {
      start_date,
      end_date,
    },
  });
}

// ------------------------------
// Quality
// ------------------------------
export function getHilPnrs({ start_date, end_date, signal } = {}) {
  return api.get("/api/v1/report/quality/hil-pnrs", {
    query: {
      start_date,
      end_date,
    },
  });
}

export function getPnrAdm({ start_date, end_date, signal } = {}) {
  return api.get("/api/v1/report/quality/pnr-adm", {
    query: {
      start_date,
      end_date,
    },
  });
}

// ------------------------------
// AI Governance
// ------------------------------
export function getLlmMetricsAvgInRange({ start_date, end_date, signal } = {}) {
  return api.get("/api/v1/report/ai-governance/llm-metrics-avg-in-range", {
    query: {
      start_date,
      end_date,
    },
  });
}

export function getLlmMetricsTrendOverTime({
  start_date,
  end_date,
  signal,
} = {}) {
  return api.get("/api/v1/report/ai-governance/llm-metrics-trend-over-time", {
    query: {
      start_date,
      end_date,
    },
  });
}
