// Small DOM helpers shared by the page scripts.
// API data is only ever put on the page through textContent, value or attributes (never innerHTML).
import { displayName, logout } from "./auth.js";

export const $ = (id) => document.getElementById(id);

/**
 * Creates an element. `text` sets textContent; `className` sets the class; any other key is set as
 * an attribute (null/undefined/false are skipped). Children may be nodes or strings (added as text).
 */
export function el(tag, { text, className, ...attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs)) {
    if (value != null && value !== false) node.setAttribute(name, value);
  }
  if (text != null) node.textContent = text;
  node.append(...children);
  return node;
}

/** Shows `message` in the page's #error area (or hides it when empty). */
export function showError(message) {
  const box = $("error");
  box.textContent = message || "";
  box.hidden = !message;
  if (message) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export const clearError = () => showError("");

/** Disables a button while a request is in flight and swaps its label. */
export function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label ??= button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

/** Fills in the signed-in user and wires the "Log out" link in the sidebar. */
export function initSidebar(user) {
  $("logout").addEventListener("click", (event) => {
    event.preventDefault();
    logout();
  });
  displayName(user).then((name) => {
    $("user-name").textContent = name;
    $("user-initial").textContent = name.charAt(0).toUpperCase();
  });
}
