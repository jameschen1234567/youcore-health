/**
 * Auth utilities — token storage and current user helpers.
 */

const TOKEN_KEY = 'youcore_token'
const USER_KEY  = 'youcore_user'

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return !!getToken()
}

export function isAdmin() {
  return getUser()?.role === 'admin'
}

/** Axios / fetch headers with auth + ngrok skip */
export function authHeaders() {
  const token = getToken()
  return {
    'ngrok-skip-browser-warning': '1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
