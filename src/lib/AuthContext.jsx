import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext(null);

function clearStoredAuth() {
  appParams.token = null;
  try {
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('token');
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
}

function storeAuthToken(token) {
  appParams.token = token;
  try {
    localStorage.setItem('base44_access_token', token);
    localStorage.setItem('token', token);
  } catch {
    // The in-memory token still works for the current page session.
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function responseMessage(payload, fallback) {
  return payload?.detail || payload?.message || payload?.error || fallback;
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, token?: string | null }} [options]
 */
async function authRequest(path, { method = 'GET', body, token = appParams.token } = {}) {
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${appParams.serverUrl}/api/apps/${appParams.appId}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(responseMessage(payload, `Authentication request failed (${response.status}).`));
  }
  return payload;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await authRequest('/entities/User/me');
      setUser(currentUser);
      setIsAuthenticated(true);
      return currentUser;
    } catch {
      clearStoredAuth();
      setUser(null);
      setIsAuthenticated(false);
      return null;
    } finally {
      setAuthChecked(true);
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (!appParams.token) {
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return;
    }
    void checkUserAuth();
  }, [checkUserAuth]);

  const loginWithPassword = async (email, password) => {
    const payload = await authRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (!payload.access_token) {
      throw new Error('Unable to sign in. Check your email and password.');
    }

    storeAuthToken(payload.access_token);
    setUser(payload.user || null);
    setIsAuthenticated(true);
    setAuthChecked(true);
    return payload.user;
  };

  const registerAccount = async (email, password) => {
    return authRequest('/auth/register', { method: 'POST', body: { email, password } });
  };

  const verifyRegistration = async (email, otpCode) => {
    return authRequest('/auth/verify-otp', {
      method: 'POST',
      body: { email, otp_code: otpCode },
    });
  };

  const resendVerification = async (email) => {
    return authRequest('/auth/resend-otp', { method: 'POST', body: { email } });
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    window.location.assign(import.meta.env.BASE_URL);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authChecked,
      loginWithPassword,
      registerAccount,
      verifyRegistration,
      resendVerification,
      logout,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
