// login.html
// Elements: form#login-form, input#email, input#password, button#submit, #error
import { login, redirectIfSignedIn } from "./auth.js";
import { $, clearError, setBusy, showError } from "./layout.js";

await redirectIfSignedIn();

const form = $("login-form");
const submit = $("submit");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  clearError();
  setBusy(submit, true, "Signing in…");
  try {
    await login($("email").value.trim(), $("password").value);
  } catch (err) {
    showError(err.message);
    setBusy(submit, false);
    $("password").select();
  }
});
