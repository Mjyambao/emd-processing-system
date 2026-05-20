import { OktaAuth } from "@okta/okta-auth-js";

const oktaAuth = new OktaAuth({
  clientId: process.env.NEXT_PUBLIC_OKTA_CLIENT_ID,
  issuer: process.env.NEXT_PUBLIC_OKTA_ISSUER,
  redirectUri:
    typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "http://localhost:3000/callback",
  scopes: ["openid", "profile", "email"],
  pkce: true,
});

export default oktaAuth;
