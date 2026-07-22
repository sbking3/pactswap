import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGetMe, User } from '@workspace/api-client-react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, address: string, username?: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

/**
 * Decode a JWT payload and check whether it has expired.
 * We only need the `exp` claim — signature verification is the server's job.
 * Returns true if the token is expired or malformed.
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true; // malformed → treat as expired
  }
}

function clearStoredSession() {
  localStorage.removeItem('pactswap_token');
  localStorage.removeItem('pactswap_wallet');
  localStorage.removeItem('pactswap_user');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Read token from localStorage on init, but discard it immediately if it's
  // already expired — avoids a flash of "logged in" state followed by a 401.
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('pactswap_token');
    if (stored && isTokenExpired(stored)) {
      clearStoredSession();
      return null;
    }
    return stored;
  });

  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('pactswap_wallet'));

  const { data: user, isLoading: isUserLoading, error: meError } = useGetMe({
    query: {
      queryKey: ['me', token],
      enabled: !!token,
      retry: 1, // one retry on transient network errors (server cold-start, etc.)
      staleTime: 60_000, // treat user data as fresh for 60 s to avoid re-fetching on every render
    }
  });

  // If the server returns 401 (expired or revoked token), clear the session so
  // the UI doesn't stay stuck in a half-logged-in state.
  useEffect(() => {
    if (!meError) return;
    const status = (meError as any)?.status ?? (meError as any)?.response?.status;
    if (status === 401) {
      clearStoredSession();
      setToken(null);
      setAddress(null);
    }
  }, [meError]);

  const login = (newToken: string, newAddress: string, username?: string) => {
    localStorage.setItem('pactswap_token', newToken);
    localStorage.setItem('pactswap_wallet', newAddress);
    // pactswap_user is a lightweight "session marker" read by the Login page
    // to redirect already-authenticated users straight to /dashboard.
    if (username) {
      localStorage.setItem('pactswap_user', JSON.stringify({ address: newAddress, username }));
    }
    setToken(newToken);
    setAddress(newAddress);
  };

  const logout = () => {
    clearStoredSession();
    setToken(null);
    setAddress(null);
  };

  const isLoading = !!token && isUserLoading;

  return (
    <AuthContext.Provider value={{ user: user || null, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
