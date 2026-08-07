/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
	webpack: (
    config,
    { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack },
  ) => {
    const externals = [
      // required if you use native metrics
      "@datadog/native-metrics",

      // required if you use profiling
      "@datadog/pprof",

      // required if you use Datadog security features
      "@datadog/native-appsec",
      "@datadog/native-iast-taint-tracking",
      "@datadog/native-iast-rewriter",
    ];
    config.externals.push(...externals);
    return config;
  },
};

module.exports = nextConfig;
