import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';

export type AuthHeadersFn = () => Promise<Record<string, string>>;

const ApiAuthContext = createContext<AuthHeadersFn>(() => Promise.resolve({}));

export function ApiAuthProvider({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
	if (disabled) {
		return <ApiAuthContext.Provider value={() => Promise.resolve({})}>{children}</ApiAuthContext.Provider>;
	}
	return <ClerkBackedHeaders>{children}</ClerkBackedHeaders>;
}

function ClerkBackedHeaders({ children }: { children: ReactNode }) {
	const { getToken, isSignedIn } = useAuth();
	const headers = useCallback(async () => {
		if (!isSignedIn) return {};
		const t = await getToken();
		return t ? { Authorization: `Bearer ${t}` } : {};
	}, [getToken, isSignedIn]);
	return <ApiAuthContext.Provider value={headers}>{children}</ApiAuthContext.Provider>;
}

export function useApiAuthHeaders(): AuthHeadersFn {
	return useContext(ApiAuthContext);
}
