import "../styles/globals.css";
import "../styles/pnr-details.css";
import { registerResponseInterceptor } from "../api/api";

export default function MyApp({ Component, pageProps }) {
  registerResponseInterceptor(async ({ response }) => {
    if (response.status === 401) {
      // Only sign out if the token is actually invalid, not for other errors
      const { default: oktaAuth } = await import("../lib/okta");
      const isAuth = await oktaAuth.isAuthenticated();
      if (!isAuth) {
        localStorage.removeItem("session");
        await oktaAuth.signOut({
          postLogoutRedirectUri: window.location.origin,
        });
      }
    }
    return response;
  });

  return <Component {...pageProps} />;
}
