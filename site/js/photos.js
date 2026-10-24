// photos.html?ticket=ETC-0042 (opened on a phone from the job page QR code)
// Elements: #loading, #error, #job, #ticket, #status-badge, #device, #customer, button#take-photo, a#done
// Photo upload is a separate PR (walkthrough Part E3); the button stays disabled until then.
import { api, requireLogin } from "./auth.js";
import { $, showError } from "./layout.js";
import { label } from "./labels.js";

await requireLogin();

const ticket = (new URLSearchParams(location.search).get("ticket") ?? "").trim();

try {
  if (!ticket) throw Object.assign(new Error("Job not found."), { status: 404 });
  const job = await api(`/jobs/${encodeURIComponent(ticket)}`);

  document.title = `Photos for ${job.ticketNumber} · ET Computers`;
  $("ticket").textContent = job.ticketNumber;
  $("status-badge").dataset.status = job.status;
  $("status-badge").textContent = label(job.status);
  $("device").textContent = job.deviceName;
  $("customer").textContent = [job.customerName, job.reportedFault].filter(Boolean).join(" · ");
  $("done").href = `/job.html?ticket=${encodeURIComponent(job.ticketNumber)}`;
  $("job").hidden = false;
} catch (err) {
  showError(err.status === 404 ? "Job not found." : err.message);
} finally {
  $("loading").hidden = true;
}
