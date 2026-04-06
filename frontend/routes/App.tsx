/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import OverlayWidget from '@frontend/components/OverlayWidget';
import LandingPage from '@frontend/pages/LandingPage';
import { Documentation, ApiReference, Blog, FAQ, PrivacyPolicy, TermsOfService, Security, ContactPage } from '@frontend/pages/FooterPages';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, SignUp } from '@clerk/clerk-react';
import AppSignInGate from '@frontend/components/AppSignInGate';
import AppAuthConfigMissing from '@frontend/components/AppAuthConfigMissing';

import { useEffect } from 'react';
import { getElectronIpc } from '@frontend/utils/electronIpc';
import { hasAnyClerkPublishableKey } from '@frontend/utils/clerkPublishableKey';

const clerkEnabled = hasAnyClerkPublishableKey();

export default function App() {
  useEffect(() => {
    // Force the active window to resize via HMR, since the user didn't restart the desktop app
    const isElectronEnv = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
    if (isElectronEnv) {
      try {
        const ipc = getElectronIpc();
        ipc?.send('resize-window', 953, 744);
      } catch (e) {
        console.log('Not running in Electron, or ipc blocked.');
      }
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/api-reference" element={<ApiReference />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/security" element={<Security />} />
        <Route path="/contact" element={<ContactPage />} />
        {clerkEnabled && (
          <>
            <Route
              path="/sign-in/*"
              element={<SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />}
            />
            <Route
              path="/sign-up/*"
              element={<SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}
            />
          </>
        )}
        <Route
          path="/app"
          element={
            clerkEnabled ? (
              <>
                <SignedIn>
                  <OverlayWidget />
                </SignedIn>
                <SignedOut>
                  <AppSignInGate />
                </SignedOut>
              </>
            ) : (
              <AppAuthConfigMissing />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
