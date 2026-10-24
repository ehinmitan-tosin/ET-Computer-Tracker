// job.html?ticket=ETC-0042[&new=1]
// Elements: #loading, #error, #not-found, #job, #notice, #ticket, #status-badge, #summary,
//   #reported-fault, textarea#diagnosed-fault, #photo-count, button#qr-toggle, #qr-box, canvas#qr, #qr-url,
//   dl#specs, #accessories, #condition-notes, input[name=status], #status-note, input#promised-date,
//   form#job-form, button#save, #customer-name, a#customer-phone, #customer-email, ol#history
import QRCode from "qrcode";
import { api, requireLogin } from "./auth.js";
import { $, clearError, el, initSidebar, setBusy, showError } from "./layout.js";
import { CONDITION_FIELDS, label } from "./labels.js";
import { formatDate, formatDateTime, formatPhone } from "./format.js";

const user = await requireLogin();
initSidebar(user);

const STATUS_NOTES = {
  UNDER_REPAIR: "Device is being worked on.",
  ON_HOLD: "Waiting on parts or the customer.",
  COMPLETED: "Device is ready for pickup.",
  DELIVERED: "Device collected. The job moves out of the active list.",
};
const CONFLICT_MESSAGE = "This job was updated by someone else. The latest version has been loaded.";

const params = new URLSearchParams(location.search);
const ticket = (params.get("ticket") ?? "").trim();
const form = $("job-form");
const saveButton = $("save");
let job = null;

function showNotice(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}

function showNotFound() {
  document.title = "Job not found · ET Computers";
  $("job").hidden = true;
  $("not-found").hidden = false;
}

// ---------- rendering ----------

function describeActivity(a) {
  const type = String(a.type ?? "").toUpperCase();
  if (type.includes("CREATE") || type.includes("REGISTER")) return "Registered";
  if (type.includes("STATUS")) {
    return a.from ? `Status changed from ${label(a.from)} to ${label(a.to)}` : `Status: ${label(a.to)}`;
  }
  // Check DIAGNOS before PROMISED: e.g. "DIAGNOSIS_UPDATED" must not match a date rule.
  if (type.includes("DIAGNOS")) {
    if (!a.to) return "Diagnosis removed";
    return `${a.from ? "Diagnosis updated" : "Diagnosis added"}: ${a.to}`;
  }
  if (type.includes("PROMISED")) {
    return a.from
      ? `Promised date changed from ${formatDate(a.from)} to ${formatDate(a.to)}`
      : `Promised date set to ${formatDate(a.to)}`;
  }
  if (type.includes("PHOTO")) return "Photo added";
  // Unknown type: "SOMETHING_ELSE" → "Something else"
  const words = type.replace(/_/g, " ").toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Updated";
}

function specRows() {
  const specs = job.specs ?? {};
  const rows = [
    ["RAM", specs.ram],
    ["Storage", specs.storage],
    ["Processor", specs.processor],
    ["Screen size", specs.screenSize],
    ["Serial no.", job.serialNumber],
    ["Model no.", job.modelNumber],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => ({ name, value, flag: false }));

  for (const { key, label: name } of CONDITION_FIELDS) {
    const code = job.condition?.[key];
    rows.push({ name, value: label(code) || "–", flag: !!code && code !== "OK" && code !== "YES" });
  }
  return rows;
}

function render() {
  document.title = `Job ${job.ticketNumber} · ET Computers`;

  $("ticket").textContent = job.ticketNumber;
  const badge = $("status-badge");
  badge.dataset.status = job.status;
  badge.textContent = label(job.status);
  $("summary").textContent = [job.deviceName, label(job.deviceType), job.customerName].filter(Boolean).join(" · ");

  $("reported-fault").textContent = job.reportedFault ?? "";
  $("diagnosed-fault").value = job.diagnosedFault ?? "";
  $("photo-count").textContent = String(job.photos?.length ?? 0);

  $("specs").replaceChildren(
    ...specRows().map(({ name, value, flag }) =>
      el("div", { className: "spec" }, [el("dt", { text: name }), el("dd", { className: flag ? "flag" : null, text: value })]),
    ),
  );
  const accessories = (job.accessories ?? []).map(label);
  if (job.accessoriesOther) accessories.push(job.accessoriesOther);
  $("accessories").textContent = accessories.length ? accessories.join(", ") : "None";
  $("condition-notes").textContent = job.conditionNotes || "None";

  form.elements.status.value = job.status;
  $("status-note").textContent = STATUS_NOTES[job.status] ?? "";
  $("promised-date").value = job.promisedDate ?? "";

  $("customer-name").textContent = job.customerName;
  const phone = $("customer-phone");
  phone.href = `tel:${job.customerPhone}`;
  phone.textContent = formatPhone(job.customerPhone);
  $("customer-email").textContent = job.customerEmail ?? "";
  $("customer-email").hidden = !job.customerEmail;

  const entries = [...(job.activity ?? [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $("history").replaceChildren(
    ...entries.map((a) =>
      el("li", {}, [
        el("span", { className: "h-dot", "aria-hidden": "true" }),
        el("div", { className: "h-body" }, [
          el("span", { className: "h-what", text: describeActivity(a) }),
          el("span", { className: "h-when", text: [formatDateTime(a.at), a.by].filter(Boolean).join(" · ") }),
        ]),
      ]),
    ),
  );

  $("job").hidden = false;
}

// ---------- QR code to the phone photo page ----------

function setQrOpen(open) {
  $("qr-box").hidden = !open;
  $("qr-toggle").setAttribute("aria-expanded", String(open));
  $("qr-toggle").lastChild.textContent = open ? " Hide QR code" : " Show QR to add from phone";
}

async function drawQr() {
  const url = `${location.origin}/photos.html?ticket=${encodeURIComponent(job.ticketNumber)}`;
  $("qr-url").textContent = url;
  $("qr-url").href = url;
  try {
    await QRCode.toCanvas($("qr"), url, { width: 186, margin: 0, errorCorrectionLevel: "M" });
  } catch (err) {
    console.error("QR code could not be drawn", err);
  }
}

$("qr-toggle").addEventListener("click", () => setQrOpen($("qr-box").hidden));

// ---------- load and save ----------

async function fetchJob() {
  return api(`/jobs/${encodeURIComponent(ticket)}`);
}

form.addEventListener("change", (event) => {
  if (event.target.name === "status") $("status-note").textContent = STATUS_NOTES[event.target.value] ?? "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveButton.disabled || !job) return;
  clearError();
  showNotice("");

  // Only send what changed, so the history records real changes only.
  const changes = {};
  const status = form.elements.status.value;
  const promisedDate = $("promised-date").value;
  const diagnosedFault = $("diagnosed-fault").value.trim();
  if (status && status !== job.status) changes.status = status;
  if (promisedDate && promisedDate !== job.promisedDate) changes.promisedDate = promisedDate;
  if (diagnosedFault !== (job.diagnosedFault ?? "")) changes.diagnosedFault = diagnosedFault;
  if (Object.keys(changes).length === 0) {
    showNotice("No changes to save.");
    return;
  }

  setBusy(saveButton, true, "Saving…");
  try {
    job = await api(`/jobs/${encodeURIComponent(job.ticketNumber)}`, {
      method: "PATCH",
      body: { version: job.version, ...changes },
    });
    render();
    showNotice("Changes saved.");
  } catch (err) {
    if (err.status === 409) {
      try {
        job = await fetchJob();
        render();
        showError(CONFLICT_MESSAGE);
      } catch (reloadErr) {
        showError(reloadErr.message);
      }
    } else {
      showError(err.message);
    }
  } finally {
    setBusy(saveButton, false);
  }
});

if (!ticket) {
  $("loading").hidden = true;
  showNotFound();
} else {
  try {
    job = await fetchJob();
    render();
    await drawQr();
    if (params.get("new") === "1") {
      showNotice(`Device registered as ${job.ticketNumber}. Write the ticket number on the device tag.`);
      setQrOpen(true);
      // Don't show the message again on reload.
      params.delete("new");
      history.replaceState(null, "", `${location.pathname}?${params}`);
    }
  } catch (err) {
    if (err.status === 404) showNotFound();
    else showError(err.message);
  } finally {
    $("loading").hidden = true;
  }
}
