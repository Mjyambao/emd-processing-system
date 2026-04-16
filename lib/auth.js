export const VALID_USER = {
  email: "guestUser@accenture.com",
  password: "1234",
  name: "Guest User",
  agentId: "U-0001",
  userId: "1",
};
export const isLoggedIn = () => {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("session");
};
export const requireAuth = (router) => {
  if (typeof window === "undefined") return;
  const s = localStorage.getItem("session");
  if (!s) router.replace("/");
};
