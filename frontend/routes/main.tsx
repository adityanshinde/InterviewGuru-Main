import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';
import { ApiAuthProvider } from '../providers/ApiAuthContext.tsx';
import '../styles/index.css';

const clerkPk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const tree = clerkPk ? (
  <ClerkProvider
    publishableKey={clerkPk}
    afterSignOutUrl="/"
    signInUrl="/sign-in"
    signUpUrl="/sign-up"
  >
    <ApiAuthProvider>
      <App />
    </ApiAuthProvider>
  </ClerkProvider>
) : (
  <ApiAuthProvider disabled>
    <App />
  </ApiAuthProvider>
);

createRoot(document.getElementById('root')!).render(<StrictMode>{tree}</StrictMode>);
