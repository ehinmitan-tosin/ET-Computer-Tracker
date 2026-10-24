// intake.html
// Elements: form#intake-form, #arrival-time, button#submit, #error
// Field names (match the POST /jobs body):
//   customerName, customerPhone, customerEmail, deviceName, deviceType (radio),
//   serialNumber, modelNumber, specs.ram, specs.storage, specs.processor, specs.screenSize,
//   condition.powersOn | screen | keyboard | touchpad | battery | body (radios, code values),
//   accessories (checkboxes, code values), accessoriesOther, conditionNotes, reportedFault, promisedDate
import { api, requireLogin } from "./auth.js";
import { $, clearError, initSidebar, setBusy, showError } from "./layout.js";
import { CONDITION_FIELDS } from "./labels.js";
import { formatDateTime, todayInLagos } from "./format.js";

const user = await requireLogin();
initSidebar(user);

const form = $("intake-form");
const submit = $("submit");

const showArrival = () => ($("arrival-time").textContent = formatDateTime(new Date().toISOString()));
showArrival();
setInterval(showArrival, 30_000);

form.elements.promisedDate.min = todayInLagos();

// Desktops have no touchpad: default it to N/A, and clear that choice again if switched back to laptop.
form.addEventListener("change", (event) => {
  if (event.target.name !== "deviceType") return;
  const touchpad = form.elements["condition.touchpad"];
  if (event.target.value === "DESKTOP") touchpad.value = "NOT_APPLICABLE";
  else if (touchpad.value === "NOT_APPLICABLE") {
    for (const radio of form.querySelectorAll('input[name="condition.touchpad"]')) radio.checked = false;
  }
});

function buildBody() {
  const data = new FormData(form);
  const text = (name) => String(data.get(name) ?? "").trim();
  const optional = (name) => text(name) || undefined;

  const specs = {
    ram: optional("specs.ram"),
    storage: optional("specs.storage"),
    processor: optional("specs.processor"),
    screenSize: optional("specs.screenSize"),
  };
  const accessories = data.getAll("accessories");

  // undefined values are dropped by JSON.stringify.
  return {
    customerName: text("customerName"),
    customerPhone: text("customerPhone"),
    customerEmail: optional("customerEmail"),
    deviceName: text("deviceName"),
    deviceType: data.get("deviceType"),
    serialNumber: optional("serialNumber"),
    modelNumber: optional("modelNumber"),
    specs: Object.values(specs).some(Boolean) ? specs : undefined,
    condition: Object.fromEntries(CONDITION_FIELDS.map(({ key }) => [key, data.get(`condition.${key}`)])),
    accessories: accessories.length ? accessories : undefined,
    accessoriesOther: optional("accessoriesOther"),
    conditionNotes: optional("conditionNotes"),
    reportedFault: text("reportedFault"),
    promisedDate: text("promisedDate"),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled) return; // a request is already in flight
  clearError();
  setBusy(submit, true, "Registering…");
  try {
    const job = await api("/jobs", { method: "POST", body: buildBody() });
    // replace(): Back from the new job should not return to a filled-in form that could be submitted again.
    location.replace(`/job.html?ticket=${encodeURIComponent(job.ticketNumber)}&new=1`);
  } catch (err) {
    showError(err.message); // the form keeps everything the user typed
    setBusy(submit, false);
  }
});
