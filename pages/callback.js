import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import oktaAuth from "../lib/okta";

import { createChatSession } from "../api/chatApi";

export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // Parse tokens from the redirect URL
        const { tokens } = await oktaAuth.token.parseFromUrl();
        oktaAuth.tokenManager.setTokens(tokens);

        // Get user info and store in localStorage
        const user = await oktaAuth.token.getUserInfo(
          tokens.accessToken,
          tokens.idToken,
        );

        localStorage.setItem(
          "session",
          JSON.stringify({
            email: user.email,
            name: user.name || user.preferred_username,
            agentId: user.preferred_username || user.sub,
            userId: user.sub,
          }),
        );

        try {
          const response = await createChatSession();

          // Adjust based on your API response structure
          const conversationId = response?.conversation_id;

          if (conversationId) {
            localStorage.setItem("conversation_id", conversationId);
          }
        } catch (error) {
          console.error("Failed to create chat session:", error);
        }
        router.replace("/dashboard");
      } catch (err) {
        console.error("Callback error:", err);
        setError(err.message || "Authentication failed");
      }
    }

    handleCallback();
  }, [router]);

  // if (error) {
  //   return (
  //     <main className="min-h-screen grid place-items-center p-4">
  //       <div className="card p-6 text-center">
  //         <p className="text-red-600 mb-4">Login failed: {error}</p>
  //         <button
  //           className="btn btn-primary"
  //           onClick={() => router.replace("/")}
  //         >
  //           Try Again
  //         </button>
  //       </div>
  //     </main>
  //   );
  // }

  return (
    <main className="min-h-screen grid place-items-center">
      <p className="text-black/60">Completing sign-in...</p>
    </main>
  );
}
