import { useState } from 'react';
import { api, setToken, getToken } from '../api';

export function useAuthController() {
  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem('user');
    return cached ? JSON.parse(cached) : null;
  });

  function saveSession({ token, user }) {
    setToken(token);
    setUser(user);
    localStorage.setItem('user', JSON.stringify(user));
  }
  function logout() {
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
  }
  async function login(email, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveSession(data);
  }
  async function register(name, email, password) {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    await login(email, password);
  }

  return { user, isAuthed: !!user, login, register, logout, token: getToken() };
}
