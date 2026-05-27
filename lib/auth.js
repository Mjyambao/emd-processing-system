export const VALID_USER_1 = {
  email: "ticketer1@email.com",
  password: "1234",
  name: "ticketer1@email.com",
  agentId: "U-0001",
  userId: "31",
};

export const VALID_USER_2 = {
  email: "ticketer2@email.com",
  password: "1234",
  name: "ticketer2@email.com",
  agentId: "U-0002",
  userId: "32",
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
