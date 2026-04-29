import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';
import { ApiAuthProvider } from '../providers/ApiAuthContext.tsx';
import ClerkProductionOnLocalhostBanner from '../components/ClerkProductionOnLocalhostBanner';
import { resolveClerkPublishableKey } from '../utils/clerkPublishableKey';
import '../styles/index.css';

const clerkPk = resolveClerkPublishableKey();
const isElectronShell =
  typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('textarea,input,[contenteditable],[contenteditable="plaintext-only"]');
  if (!editable) return false;
  if (editable instanceof HTMLTextAreaElement) {
    return !editable.disabled && !editable.readOnly;
  }
  if (editable instanceof HTMLInputElement) {
    const t = (editable.type || 'text').toLowerCase();
    return !editable.disabled && !editable.readOnly && TEXT_INPUT_TYPES.has(t);
  }
  return true;
}

function installElectronClipboardGuard() {
  if (!isElectronShell || typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as Window & { __igClipboardGuardInstalled?: boolean };
  if (w.__igClipboardGuardInstalled) return;
  w.__igClipboardGuardInstalled = true;

  const blockNonEditableCopy = (event: ClipboardEvent) => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('copy', blockNonEditableCopy, true);
  document.addEventListener('cut', blockNonEditableCopy, true);
}

installElectronClipboardGuard();

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
