import { useState } from "react";
import { useRouter } from "next/router";
import { VALID_USER_1, VALID_USER_2 } from "../lib/auth";
// import { login } from "@/api/userApi";

export default function Login() {
  const [email, setEmail] = useState("ticketer1@email.com");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e) {
    e.preventDefault();
    if (email === VALID_USER_1.email && password === VALID_USER_1.password) {
      localStorage.setItem(
        "session",
        JSON.stringify({
          email,
          name: VALID_USER_1.name,
          agentId: VALID_USER_1.agentId,
          userId: VALID_USER_1.userId,
        }),
      );
      router.push("/dashboard");
    } else if (
      email === VALID_USER_2.email &&
      password === VALID_USER_2.password
    ) {
      localStorage.setItem(
        "session",
        JSON.stringify({
          email,
          name: VALID_USER_2.name,
          agentId: VALID_USER_2.agentId,
          userId: VALID_USER_2.userId,
        }),
      );
      router.push("/dashboard");
    } else {
      setError("Invalid credentials");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded bg-brand-red grid place-items-center text-white">
            <i className="fa-solid fa-plane"></i>
          </div>
          <div>
            <h1 className="text-xl font-semibold">EMD Processing System</h1>
            <p className="text-black/60 text-sm">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="input w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ticketer1@email.com"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              className="input w-full"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            className="btn btn-primary w-full justify-center"
            type="submit"
          >
            <i className="fa-solid fa-right-to-bracket"></i> Sign in
          </button>
        </form>

        {/* <p className="mt-4 text-xs text-black/50">Use <span className="font-mono">guestuser@accenture.com / 1234</span></p> */}
      </div>
    </main>
  );
}
