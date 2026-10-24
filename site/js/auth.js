// Shared login/session/API module. Every page imports from here.
import { Amplify } from "aws-amplify";
import { signIn, signOut, getCurrentUser, fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";

const env = import.meta.env;
const missing = ["VITE_API_URL", "VITE_USER_POOL_ID", "VITE_USER_POOL_CLIENT_ID"].filter((k) => !env[k]);
if (missing.length) {
  throw new Error(`Missing ${missing.join(", ")}. Copy site/.env.example to site/.env and fill it in.`);
}

const API_URL = env.VITE_API_URL.replace(/\/+$/, "");
const LOGIN_PAGE = "/login.html";
const HOME_PAGE = "/index.html";

export const NETWORK_ERROR = "Cannot reach the server. Check your internet connection.";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: env.VITE_USER_POOL_ID,
      userPoolClientId: env.VITE_USER_POOL_CLIENT_ID,
    },
  },
});

/** Error thrown by api(). `status` is the HTTP status, or 0 for a network failure. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Never settles: awaiting it stops the caller while the browser navigates away.
const halt = () => new Promise(() => {});

// Only allow same-site paths as a post-login destination (no "//host" or "https://…").
function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function goToLogin() {
  const here = location.pathname + location.search;
  const next = here.startsWith(LOGIN_PAGE) ? "" : `?next=${encodeURIComponent(here)}`;
  location.replace(LOGIN_PAGE + next);
  return halt();
}

/**
 * Call at the top of every protected page: `const user = await requireLogin();`
 * Resolves with the Amplify user ({ username, signInDetails: { loginId } }), or redirects to login and never resolves.
 */
export async function requireLogin() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return goToLogin();
  }
  // Pages restored from the back/forward cache don't re-run scripts; re-check after a logout.
  addEventListener("pageshow", (event) => {
    if (event.persisted) getCurrentUser().catch(goToLogin);
  });
  return user;
}

/** Name to show in the sidebar: the Cognito `name`/`given_name` attribute, else the sign-in email. */
export async function displayName(user) {
  const fallback = user?.signInDetails?.loginId || user?.username || "";
  try {
    const attrs = await fetchUserAttributes();
    return attrs.name || attrs.given_name || attrs.email || fallback;
  } catch {
    return fallback;
  }
}

/** On the login page: go straight to the app if a session already exists. */
export async function redirectIfSignedIn() {
  try {
    await getCurrentUser();
  } catch {
    return;
  }
  location.replace(afterLoginPage());
  return halt();
}

function afterLoginPage() {
  return safeNext(new URLSearchParams(location.search).get("next")) ?? HOME_PAGE;
}

function signInErrorMessage(err) {
  switch (err?.name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password";
    case "EmptySignInUsername":
    case "EmptySignInPassword":
      return "Enter your email and password.";
    case "UserNotConfirmedException":
      return "Your account is not confirmed yet. Ask the administrator.";
    case "PasswordResetRequiredException":
      return "Your password must be reset. Ask the administrator.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many attempts. Wait a few minutes and try again.";
    case "NetworkError":
      return NETWORK_ERROR;
    default:
      return "Sign-in failed. Please try again.";
  }
}

/** Signs in and redirects. Throws an Error with a message to show the user if sign-in fails. */
export async function login(email, password) {
  let result;
  try {
    result = await signIn({ username: email, password });
  } catch (err) {
    if (err?.name === "UserAlreadyAuthenticatedException") {
      location.replace(afterLoginPage());
      return halt();
    }
    if (err instanceof TypeError) throw new Error(NETWORK_ERROR); // fetch failed
    throw new Error(signInErrorMessage(err));
  }

  const step = result.nextStep?.signInStep;
  if (result.isSignedIn || step === "DONE") {
    location.replace(afterLoginPage());
    return halt();
  }
  if (step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
    // Staff passwords are set as permanent by the admin; there is no new-password screen.
    // Clear the half-finished sign-in so the next attempt starts fresh.
    await signOut().catch(() => {});
    throw new Error("Your account needs a permanent password. Ask the administrator to set it.");
  }
  await signOut().catch(() => {});
  throw new Error("This account needs an extra sign-in step that the app does not support. Ask the administrator.");
}

export async function logout() {
  // Local tokens are cleared even if the call to Cognito fails (e.g. offline).
  await signOut().catch((err) => console.error("Sign-out request failed", err?.name));
  location.replace(LOGIN_PAGE);
  return halt();
}

function defaultMessage(status) {
  if (status === 400) return "Some details are not valid.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "Not found.";
  if (status === 409) return "This job was updated by someone else.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  return "Something went wrong on the server. Please try again.";
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // not JSON (e.g. an HTML error page from a proxy)
  }
}

/**
 * Calls the API with the user's ID token.
 *   await api("/jobs")
 *   await api(`/jobs/${encodeURIComponent(ticket)}`, { method: "PATCH", body: { version, status } })
 * `body` is a plain object and is sent as JSON. Resolves with the parsed response.
 * Throws ApiError (with .status and the server's message). On 401 it redirects to login and never resolves.
 */
export async function api(path, { method = "GET", body, signal } = {}) {
  let token;
  try {
    const { tokens } = await fetchAuthSession();
    token = tokens?.idToken?.toString();
  } catch (err) {
    if (err?.name === "NetworkError" || err instanceof TypeError) throw new ApiError(0, NETWORK_ERROR);
    return goToLogin();
  }
  if (!token) return goToLogin();

  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, NETWORK_ERROR);
  }

  if (res.status === 401) return goToLogin();

  let data;
  try {
    data = await readJson(res);
  } catch {
    throw new ApiError(0, NETWORK_ERROR); // connection dropped while reading the body
  }

  if (!res.ok) {
    const message = typeof data?.message === "string" && data.message ? data.message : defaultMessage(res.status);
    throw new ApiError(res.status, message);
  }
  if (data === undefined) throw new ApiError(res.status, "The server sent an unexpected response. Please try again.");
  return data;
}
