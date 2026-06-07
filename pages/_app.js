import "../styles/globals.css";
import "../styles/pnr-details.css";
import { registerResponseInterceptor } from "../api/api";

export default function MyApp({ Component, pageProps }) {
  registerResponseInterceptor(async ({ response }) => {
    if (response.status === 401) {
      const { default: msalInstance, getMsal } = await import("../lib/okta");
      await getMsal();
      if (msalInstance.getAllAccounts().length === 0) {
        localStorage.removeItem("session");
        await msalInstance.logoutRedirect({
          postLogoutRedirectUri: window.location.origin,
        });
      }
    }
    return response;
  });

  return <Component {...pageProps} />;
}