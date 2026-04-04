import { Link } from 'react-router-dom';
import { ModalSignInButton, ModalSignUpButton } from './ClerkModalAuthButtons';

/**
 * Shown at /app when Clerk is enabled and the user is signed out.
 * Opens Clerk’s hosted modal instead of navigating away from the app shell.
 */
export default function AppSignInGate() {
  return (
    <div className="flex h-full min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-[#070a12] p-8 text-center text-white">
      <div className="no-drag max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">InterviewGuru</h1>
        <p className="text-sm text-zinc-400">
          Sign in or create an account to open the assistant. Clerk opens a sign-in dialog on top of this page — no
          redirect to another site.
        </p>
      </div>
      <div className="no-drag flex flex-wrap items-center justify-center gap-3">
        <ModalSignInButton>
          <button
            type="button"
            className="rounded-lg border border-zinc-600 bg-transparent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Sign in
          </button>
        </ModalSignInButton>
        <ModalSignUpButton>
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:bg-violet-500"
          >
            Sign up
          </button>
        </ModalSignUpButton>
      </div>
      <Link to="/" className="no-drag text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
