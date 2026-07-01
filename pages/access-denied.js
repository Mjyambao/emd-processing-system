import { logout } from "../api/userApi";

export default function AccessDenied() {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md card p-6 text-center">
        <div className="h-10 w-10 rounded bg-brand-red grid place-items-center text-white mx-auto mb-4">
          <i className="fa-solid fa-lock"></i>
        </div>
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-black/60 text-sm mb-6">
          Your account signed in successfully, but it is not a member of the
          security group required to use the EMD Processing System. Please
          contact your administrator to be added.
        </p>
        <button
          className="btn btn-primary w-full justify-center"
          onClick={() => logout()}
        >
          <i className="fa-solid fa-right-from-bracket"></i>&nbsp;Sign out
        </button>
      </div>
    </main>
  );
}