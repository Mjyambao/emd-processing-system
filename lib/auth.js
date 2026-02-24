export const VALID_USER = { email: 'me@me.com', password: '1234', name: 'Test Agent', agentId: 'AGT-A12' };
export const isLoggedIn = () => { if (typeof window === 'undefined') return false; return !!localStorage.getItem('session'); };
export const requireAuth = (router) => { if (typeof window === 'undefined') return; const s = localStorage.getItem('session'); if (!s) router.replace('/'); };