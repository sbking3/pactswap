import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGetMe, User } from '@workspace/api-client-react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, address: string) => void;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pactswap_token'));
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('pactswap_wallet'));
  
  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      queryKey: ['me', token],
      enabled: !!token,
      retry: false,
    }
  });

  const login = (newToken: string, newAddress: string) => {
    localStorage.setItem('pactswap_token', newToken);
    localStorage.setItem('pactswap_wallet', newAddress);
    setToken(newToken);
    setAddress(newAddress);
  };

  const logout = () => {
    localStorage.removeItem('pactswap_token');
    localStorage.removeItem('pactswap_wallet');
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
