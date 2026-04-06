import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';
import { ApiAuthProvider } from '../providers/ApiAuthContext.tsx';
import ClerkProductionOnLocalhostBanner from '../components/ClerkProductionOnLocalhostBanner';
import { resolveClerkPublishableKey } from '../utils/clerkPublishableKey';
import '../styles/index.css';

const clerkPk = resolveClerkPublishableKey();

const host =
  typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
const clerkLiveOnLocalhost =
  !!clerkPk &&
  clerkPk.startsWith('pk_live_') &&
  (host === 'localhost' || host === '127.0.0.1');

const tree = clerkPk ? (
  <>
    {clerkLiveOnLocalhost ? <ClerkProductionOnLocalhostBanner /> : null}
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
  </>
) : (
  <ApiAuthProvider disabled>
    <App />
  </ApiAuthProvider>
);

createRoot(document.getElementById('root')!).render(<StrictMode>{tree}</StrictMode>);
