import { OktaAuth } from "@okta/okta-auth-js";

const clientId = process.env.NEXT_PUBLIC_OKTA_CLIENT_ID?.trim() || "";
const issuer = process.env.NEXT_PUBLIC_OKTA_ISSUER?.trim() || "";

const oktaAuth = new OktaAuth({
  clientId,
  issuer,
  redirectUri:
    typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "http://localhost:3000/callback",
  scopes: ["openid", "profile", "email"],
  pkce: true,
});

export default oktaAuth;
