// index.html (dashboard)
// Elements: #today, form#search-form, input#search, #search-hint, #error,
//   button.stat[data-status] with [data-count=<STATUS>], button.chip[data-filter],
//   #shown, tbody#job-rows, #load-more-row, button#load-more
import { api, requireLogin } from "./auth.js";
import { $, clearError, el, initSidebar, showError } from "./layout.js";
import { label } from "./labels.js";
import { formatDate, formatDateTime, formatLongDate, maskPhone, todayInLagos } from "./format.js";

const user = await requireLogin();
initSidebar(user);

const today = todayInLagos();
$("today").textContent = formatLongDate(today);

const rowsEl = $("job-rows");
const shownEl = $("shown");
const searchInput = $("search");
const searchHint = $("search-hint");
const loadMoreRow = $("load-more-row");
const loadMoreButton = $("load-more");
const chips = [...document.querySelectorAll(".chip")];
const statCards = [...document.querySelectorAll(".stat")];

// view: { kind: "all" } | { kind: "status", status, cursor } | { kind: "search", q }
let view = { kind: "all" };
let items = [];
let latestRequest = 0; // responses from superseded requests are ignored

function isOverdue(job) {
  return (job.status === "UNDER_REPAIR" || job.status === "ON_HOLD") && !!job.promisedDate && job.promisedDate < today;
}

function faultText(job) {
  return job.diagnosedFault
    ? `${job.reportedFault} (customer). ${job.diagnosedFault} (diagnosed)`
    : job.reportedFault ?? "";
}

function jobRow(job) {
  const promised = formatDate(job.promisedDate);
  const overdue = isOverdue(job);
  return el("tr", {}, [
    el("td", {}, [
      el("a", { className: "ticket-link", href: `/job.html?ticket=${encodeURIComponent(job.ticketNumber)}`, text: job.ticketNumber }),
    ]),
    el("td", {}, [
      el("div", { className: "cell-strong", text: job.customerName }),
      el("div", { className: "cell-sub", text: maskPhone(job.customerPhone) }),
    ]),
    el("td", {}, [
      el("div", { text: job.deviceName }),
      el("div", { className: "cell-sub", text: label(job.deviceType) }),
    ]),
    el("td", { className: "cell-fault", text: faultText(job) }),
    el("td", {}, [el("span", { className: "badge", "data-status": job.status, text: label(job.status) })]),
    el("td", { className: "cell-date", text: formatDateTime(job.arrivedAt) }),
    el("td", {}, [
      el("span", { className: overdue ? "promised overdue" : "promised", text: overdue ? `${promised} · overdue` : promised }),
    ]),
  ]);
}

function showTableMessage(message) {
  rowsEl.replaceChildren(el("tr", { className: "table-message" }, [el("td", { colspan: 7, text: message })]));
}

function renderRows() {
  if (items.length === 0) showTableMessage("No jobs found");
  else rowsEl.replaceChildren(...items.map(jobRow));

  const n = `${items.length} ${items.length === 1 ? "job" : "jobs"}`;
  if (view.kind === "all") shownEl.textContent = `Showing ${n} · sorted by promised date`;
  else if (view.kind === "status") shownEl.textContent = `Showing ${n} · newest first`;
  else shownEl.textContent = `${n} matching “${view.q}”`;
}

function renderCounts(counts) {
  for (const node of document.querySelectorAll("[data-count]")) {
    node.textContent = String(counts?.[node.dataset.count] ?? 0);
  }
}

function markActive() {
  const status = view.kind === "status" ? view.status : view.kind === "all" ? "" : null;
  for (const chip of chips) chip.setAttribute("aria-pressed", String(chip.dataset.filter === status));
  for (const card of statCards) card.setAttribute("aria-pressed", String(card.dataset.status === status));
}

async function load(next, { append = false } = {}) {
  const request = ++latestRequest;
  clearError();
  if (!append) {
    view = next;
    markActive();
    showTableMessage("Loading jobs…");
    shownEl.textContent = "";
    loadMoreRow.hidden = true;
  }
  loadMoreButton.disabled = true;

  try {
    let data;
    if (next.kind === "all") {
      data = await api("/jobs");
    } else if (next.kind === "status") {
      const query = new URLSearchParams({ status: next.status });
      if (append && next.cursor) query.set("cursor", next.cursor);
      data = await api(`/jobs?${query}`);
    } else {
      data = await api(`/search?${new URLSearchParams({ q: next.q })}`);
    }
    if (request !== latestRequest) return;

    view = { ...next, cursor: data.cursor ?? null };
    items = append ? items.concat(data.items ?? []) : data.items ?? [];
    if (data.counts) renderCounts(data.counts);
    renderRows();
    loadMoreRow.hidden = !(view.kind === "status" && view.cursor);
  } catch (err) {
    if (request !== latestRequest) return;
    showError(err.message);
    if (!append) showTableMessage("Jobs could not be loaded.");
  } finally {
    if (request === latestRequest) loadMoreButton.disabled = false;
  }
}

function showAll() {
  searchInput.value = "";
  searchHint.hidden = true;
  load({ kind: "all" });
}

function showStatus(status) {
  searchInput.value = "";
  searchHint.hidden = true;
  load({ kind: "status", status });
}

for (const chip of chips) {
  chip.addEventListener("click", () => (chip.dataset.filter ? showStatus(chip.dataset.filter) : showAll()));
}
for (const card of statCards) {
  // Clicking the active card again goes back to "All", as in the design.
  card.addEventListener("click", () =>
    card.getAttribute("aria-pressed") === "true" ? showAll() : showStatus(card.dataset.status),
  );
}

$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return showAll();
  if (q.length < 2) {
    searchHint.textContent = "Type at least 2 characters";
    searchHint.hidden = false;
    return;
  }
  searchHint.hidden = true;
  load({ kind: "search", q });
});

searchInput.addEventListener("input", () => {
  searchHint.hidden = true;
  if (searchInput.value === "" && view.kind === "search") showAll();
});

loadMoreButton.addEventListener("click", () => load(view, { append: true }));

load({ kind: "all" });
