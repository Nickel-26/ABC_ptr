/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import api, { clearAuthTokens, getAccessToken, getRefreshToken, refreshAccessToken, setAuthTokens } from '../api';

const UserContext = createContext();
const ACCESS_TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Still providing these for backward compatibility if components use them directly,
  // but they should now ideally be read from the `user` object.
  const cfHandle = user?.cfHandle || '';
  const lcUsername = user?.lcUsername || '';
  const lcSession = user?.lcSession || '';

  useEffect(() => {
    let mounted = true;

    async function verifySession() {
      const hasAccessToken = Boolean(getAccessToken());
      const hasRefreshToken = Boolean(getRefreshToken());

      if (!hasAccessToken && !hasRefreshToken) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        if (!hasAccessToken && hasRefreshToken) {
          await refreshAccessToken();
        }
        const res = await api.get('/auth/me');
        if (mounted) setUser(res.data.user);
      } catch (err) {
        console.error('Failed to authenticate:', err);
        clearAuthTokens();
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    verifySession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user || !getRefreshToken()) return undefined;

    const timer = setInterval(() => {
      refreshAccessToken().catch(err => {
        console.error('Failed to refresh access token:', err);
        clearAuthTokens();
        setUser(null);
      });
    }, ACCESS_TOKEN_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user]);

  const login = ({ accessToken, refreshToken }, userData) => {
    setAuthTokens({ accessToken, refreshToken });
    setUser(userData);
  };

  const logout = () => {
    clearAuthTokens();
    setUser(null);
  };

  // Keep these dummy setters so existing code doesn't crash before we update it
  const setCfHandle = () => {};
  const setLcUsername = () => {};
  const setLcSession = () => {};

  return (
    <UserContext.Provider value={{ 
      user, setUser, loading, login, logout,
      cfHandle, setCfHandle, lcUsername, setLcUsername, lcSession, setLcSession 
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
