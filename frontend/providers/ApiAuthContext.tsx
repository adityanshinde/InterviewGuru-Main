import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';

export type AuthHeadersFn = () => Promise<Record<string, string>>;

export type ApiAuthContextValue = {
	getAuthHeaders: AuthHeadersFn;
	/** Clerk finished hydrating; guest mode is always true. */
	isAuthReady: boolean;
	/** Clerk session present; false in guest mode (API still uses server-side guest id). */
	isSignedIn: boolean;
};

const defaultGuestValue: ApiAuthContextValue = {
	getAuthHeaders: async () => ({}),
	isAuthReady: true,
	isSignedIn: false,
};

const ApiAuthContext = createContext<ApiAuthContextValue>(defaultGuestValue);

export function ApiAuthProvider({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
	if (disabled) {
		return <ApiAuthContext.Provider value={defaultGuestValue}>{children}</ApiAuthContext.Provider>;
	}
	return <ClerkBackedHeaders>{children}</ClerkBackedHeaders>;
}

function ClerkBackedHeaders({ children }: { children: ReactNode }) {
	const { getToken, isSignedIn, isLoaded } = useAuth();
	const getAuthHeaders = useCallback(async () => {
		if (!isLoaded || !isSignedIn) return {};
		const t = await getToken();
		return t ? { Authorization: `Bearer ${t}` } : {};
	}, [getToken, isSignedIn, isLoaded]);

	const value = useMemo<ApiAuthContextValue>(
		() => ({
			getAuthHeaders,
			isAuthReady: isLoaded,
			isSignedIn,
		}),
		[getAuthHeaders, isLoaded, isSignedIn]
	);

	return <ApiAuthContext.Provider value={value}>{children}</ApiAuthContext.Provider>;
}

export function useApiAuth(): ApiAuthContextValue {
	return useContext(ApiAuthContext);
}

export function useApiAuthHeaders(): AuthHeadersFn {
	return useContext(ApiAuthContext).getAuthHeaders;
}
