import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      // keep this as error; it's usually a real issue:
      "react-hooks/static-components": "error",
    },
  },
]);
