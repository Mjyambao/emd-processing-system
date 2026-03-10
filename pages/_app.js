import "../styles/globals.css";
import "../styles/pnr-details.css";
import { useResponse, clearToken } from "../api/api";

export default function MyApp({ Component, pageProps }) {
  useResponse(async ({ response }) => {
    if (response.status === 401) {
      // Clear session and optionally route to login
      clearToken();
      window.location.href = "/";
    }
    return response;
  });
  return <Component {...pageProps} />;
}
