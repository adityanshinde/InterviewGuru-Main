import { SignInButton, SignUpButton } from '@clerk/clerk-react';
import type { ReactElement } from 'react';

/** After email/OAuth completes, send users into the app. */
const AFTER_AUTH_URL = '/app';

type Props = { children: ReactElement };

export function ModalSignInButton({ children }: Props) {
  return (
    <SignInButton mode="modal" forceRedirectUrl={AFTER_AUTH_URL}>
      {children}
    </SignInButton>
  );
}

export function ModalSignUpButton({ children }: Props) {
  return (
    <SignUpButton mode="modal" forceRedirectUrl={AFTER_AUTH_URL}>
      {children}
    </SignUpButton>
  );
}
