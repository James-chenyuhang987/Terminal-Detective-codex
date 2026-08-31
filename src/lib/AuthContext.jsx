import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext(null);
const AUTH_TIMEOUT_MS = 25_000;

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function responseMessage(payload, fallback) {
  return payload?.detail || payload?.message || payload?.error || fallback;
}

async function cloudflareRequest(path, { method = 'GET' } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${appParams.serverUrl}${path}`, {
      method,
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      const error = /** @type {Error & { status?: number, code?: string }} */ (
        new Error(responseMessage(payload, `Authentication request failed (${response.status}).`))
      );
      error.status = response.status;
      error.code = payload?.code || payload?.error;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Authentication request timed out. Please retry.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const session = await cloudflareRequest('/api/auth/session');
      const authenticated = Boolean(session?.authenticated && session?.user);
      setUser(authenticated ? session.user : null);
      setIsAuthenticated(authenticated);
      return authenticated ? session.user : null;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      return null;
    } finally {
      setAuthChecked(true);
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => { void checkUserAuth(); }, [checkUserAuth]);

  const loginWithGitHub = useCallback(() => {
    const serverOrigin = new URL(appParams.serverUrl).origin;
    const returnTo = serverOrigin === window.location.origin
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '/';
    const target = new URL('/api/auth/github/start', appParams.serverUrl);
    target.searchParams.set('return_to', returnTo);
    window.location.assign(target.toString());
  }, []);

  const logout = useCallback(async () => {
    try { await cloudflareRequest('/api/auth/logout', { method: 'POST' }); } catch { /* clear UI session regardless */ }
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    window.location.assign(import.meta.env.BASE_URL);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authChecked,
      authBackend: isAuthenticated ? 'cloudflare' : null,
      loginWithGitHub,
      logout,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
