function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      level: "error",
      event: "LOGGER_SERIALIZATION_FAILED",
      message: "Unable to serialize log payload",
      timestamp: new Date().toISOString(),
    });
  }
}

function write(level, event, data = {}) {
  const payload = {
    level,
    event,
    app: "emd-processing-system",
    timestamp: new Date().toISOString(),
    ...data,
  };

  const line = safeJson(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const serverLogger = {
  info: (event, data) => write("info", event, data),
  warn: (event, data) => write("warn", event, data),
  error: (event, data) => write("error", event, data),
  debug: (event, data) => {
    if (process.env.NODE_ENV !== "production") {
      write("debug", event, data);
    }
  },
};