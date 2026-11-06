"use strict";

const EVENT_STORAGE_KEY = "motherfunkys-events-v1";
const DEFAULT_EVENT = {
  id: "local-funk-en-la-terraza",
  name: "Funk en la terraza",
  eventDate: "2025-10-18",
  doorsOpenAt: "19:30",
  doorsCloseAt: "23:30",
  showTime: "20:00",
  venue: "Terraza 02",
  isActive: true
};
const TICKET_TYPES = { PRESALE: "Preventa", DOOR: "En puerta" };
const CAMERA_START_TIMEOUT_MS = 15000;

let events = usesSupabase() ? [] : loadEvents();
let activeEvent = getActiveEvent();
let tickets = [];
let currentFilter = "all";
let scannerState = { stream: null, detector: null, animationFrame: null, lastValue: "", libraryScanner: null, isValidating: false };
let toastTimeout;
let deferredInstallPrompt;
let adminSession = null;
let scannerAdmin = false;
let editingEventId = "";

const elements = {
  presale: document.querySelector("#stat-presale"),
  door: document.querySelector("#stat-door"),
  checkins: document.querySelector("#stat-checkins"),
  ready: document.querySelector("#stat-ready"),
  presaleNote: document.querySelector("#stat-presale-note"),
  doorNote: document.querySelector("#stat-door-note"),
  checkinsNote: document.querySelector("#stat-checkins-note"),
  list: document.querySelector("#tickets-list"),
  empty: document.querySelector("#empty-state"),
  results: document.querySelector("#results-line"),
  search: document.querySelector("#ticket-search"),
  filterCounts: {
    all: document.querySelector("#filter-all-count"),
    presale: document.querySelector("#filter-presale-count"),
    door: document.querySelector("#filter-door-count"),
    ready: document.querySelector("#filter-ready-count"),
    "checked-in": document.querySelector("#filter-checkin-count")
  },
  ticketFormDialog: document.querySelector("#ticket-form-dialog"),
  ticketForm: document.querySelector("#ticket-form"),
  formFeedback: document.querySelector("#ticket-form-feedback"),
  ticketType: document.querySelector("#ticket-type"),
  ticketPhone: document.querySelector("#ticket-phone"),
  phoneFieldLabel: document.querySelector("#phone-field-label"),
  ticketTypeHelp: document.querySelector("#ticket-type-help"),
  ticketViewDialog: document.querySelector("#ticket-view-dialog"),
  ticketViewContent: document.querySelector("#ticket-view-content"),
  manualCode: document.querySelector("#manual-code"),
  validationResult: document.querySelector("#validation-result"),
  startCamera: document.querySelector("#start-camera"),
  stopCamera: document.querySelector("#stop-camera"),
  cameraVideo: document.querySelector("#camera-video"),
  cameraReader: document.querySelector("#camera-reader"),
  cameraStatus: document.querySelector("#camera-status"),
  scanFrame: document.querySelector("#scan-frame"),
  scanIdle: document.querySelector("#scan-idle"),
  qrUpload: document.querySelector("#qr-upload"),
  scannerHelp: document.querySelector("#scanner-help"),
  toast: document.querySelector("#toast"),
  installApp: document.querySelector("#install-app"),
  connectionBadge: document.querySelector("#connection-badge"),
  adminLogin: document.querySelector("#admin-login"),
  adminLogout: document.querySelector("#admin-logout"),
  authDialog: document.querySelector("#auth-dialog"),
  authForm: document.querySelector("#auth-form"),
  authFeedback: document.querySelector("#auth-feedback"),
  heroActiveNote: document.querySelector("#hero-active-note"),
  heroTicketEvent: document.querySelector("#hero-ticket-event"),
  heroTicketDetails: document.querySelector("#hero-ticket-details"),
  activeEventName: document.querySelector("#active-event-name"),
  activeEventDate: document.querySelector("#active-event-date"),
  activeEventDoors: document.querySelector("#active-event-doors"),
  activeEventVenue: document.querySelector("#active-event-venue"),
  ticketFormIntro: document.querySelector("#ticket-form-intro"),
  eventManagerDialog: document.querySelector("#event-manager-dialog"),
  eventForm: document.querySelector("#event-form"),
  eventManagerEyebrow: document.querySelector("#event-manager-eyebrow"),
  eventFormTitle: document.querySelector("#event-form-title"),
  eventFormFeedback: document.querySelector("#event-form-feedback"),
  eventFormSubmit: document.querySelector("#event-form-submit"),
  eventList: document.querySelector("#event-list"),
  newEvent: document.querySelector("#new-event"),
  eventManager: document.querySelector(".event-manager"),
  changeEventLabel: document.querySelector("#change-event-label"),
  ticketStats: document.querySelector("#ticket-stats"),
  ticketTypesSection: document.querySelector("#ticket-types-section"),
  ticketWorkspace: document.querySelector("#boletas"),
  ticketNavLink: document.querySelector("#ticket-nav-link"),
  gateSection: document.querySelector("#ingresos"),
  gateNavLink: document.querySelector("#gate-nav-link"),
  gateActionLink: document.querySelector("#gate-action-link")
};

function normalizeEventTime(value) {
  return String(value || "").slice(0, 5);
}

function normalizeEvent(event) {
  return {
    id: String(event?.id || DEFAULT_EVENT.id),
    name: String(event?.name || DEFAULT_EVENT.name).trim(),
    eventDate: String(event?.eventDate ?? event?.event_date ?? ""),
    doorsOpenAt: normalizeEventTime(event?.doorsOpenAt ?? event?.doors_open_at),
    doorsCloseAt: normalizeEventTime(event?.doorsCloseAt ?? event?.doors_close_at),
    showTime: normalizeEventTime(event?.showTime ?? event?.show_time),
    venue: String(event?.venue || "").trim(),
    isActive: event?.isActive === true || event?.is_active === true
  };
}

function loadEvents() {
  try {
    const stored = window.localStorage.getItem(EVENT_STORAGE_KEY);
    if (!stored) return [normalizeEvent(DEFAULT_EVENT)];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.length) return [normalizeEvent(DEFAULT_EVENT)];
    const normalized = parsed.map(normalizeEvent);
    let hasActiveEvent = false;
    normalized.forEach((event) => {
      event.isActive = event.isActive && !hasActiveEvent;
      hasActiveEvent ||= event.isActive;
    });
    if (!hasActiveEvent) normalized[0].isActive = true;
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [normalizeEvent(DEFAULT_EVENT)];
  }
}

function saveEvents() {
  if (usesSupabase()) return;
  try {
    window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
  } catch {
    showToast("No fue posible guardar los eventos en este navegador.", "error");
  }
}

function getActiveEvent() {
  return events.find((event) => event.isActive) || null;
}

function eventForTicket(ticket) {
  return events.find((event) => event.id === ticket?.eventId) || activeEvent || null;
}

function eventNameForTicket(ticket) {
  return eventForTicket(ticket)?.name || ticket?.eventName || "Evento";
}

function currentEventTickets() {
  return canUseScanner() ? tickets : [];
}

function normalizeTicketType(type) {
  const value = String(type || "").trim().toLocaleLowerCase("es-CO");
  return ["en puerta", "puerta", "door", "staff", "backstage"].includes(value) ? TICKET_TYPES.DOOR : TICKET_TYPES.PRESALE;
}

function normalizeTicket(ticket) {
  return {
    ...ticket,
    type: normalizeTicketType(ticket.type),
    phone: String(ticket.phone || ""),
    publicToken: ticket.publicToken || makePublicTicketToken(),
    eventId: String(ticket.eventId || ticket.event_id || activeEvent?.id || ""),
    eventName: String(ticket.eventName || ticket.event_name || activeEvent?.name || "")
  };
}

function makePublicTicketToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  if (window.crypto?.getRandomValues) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function ticketTypeClass(type) {
  return normalizeTicketType(type) === TICKET_TYPES.DOOR ? "door" : "presale";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  }[character]));
}

function statusLabel(status, type) {
  if (status === "ready") return normalizeTicketType(type) === TICKET_TYPES.DOOR ? "Lista en puerta" : "Por enviar";
  return ({ sent: "Enviada", "checked-in": "Ingreso OK" })[status] || "Pendiente";
}

function formatEventDate(value, options = { weekday: "short", day: "numeric", month: "short" }) {
  if (!value) return "Por definir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Por definir";
  const formatted = new Intl.DateTimeFormat("es-CO", options).format(date);
  return formatted.charAt(0).toLocaleUpperCase("es-CO") + formatted.slice(1);
}

function eventDoorsLabel(event) {
  if (!event?.doorsOpenAt && !event?.doorsCloseAt) return "Por definir";
  if (!event.doorsCloseAt) return event.doorsOpenAt;
  if (!event.doorsOpenAt) return event.doorsCloseAt;
  return `${event.doorsOpenAt} - ${event.doorsCloseAt}`;
}

function eventSummary(event) {
  if (!event) return "Información por definir";
  const date = event.eventDate ? formatEventDate(event.eventDate, { weekday: "short", day: "numeric", month: "short" }).toLocaleUpperCase("es-CO") : "";
  const time = event.showTime || event.doorsOpenAt || "";
  return [date, time, event.venue].filter(Boolean).join(" / ") || "Información por definir";
}

function renderEventInterface() {
  const event = activeEvent;
  const name = event?.name || "Sin evento activo";
  const details = eventSummary(event);
  const heroNote = event ? `Operación activa para ${name}` : "Activa un evento para emitir y validar boletas.";

  elements.activeEventName.textContent = name;
  elements.activeEventDate.textContent = event ? formatEventDate(event.eventDate) : "Por definir";
  elements.activeEventDoors.textContent = eventDoorsLabel(event);
  elements.activeEventVenue.textContent = event?.venue || "Por definir";
  elements.heroTicketEvent.textContent = name.toLocaleUpperCase("es-CO");
  elements.heroTicketDetails.textContent = details;
  elements.ticketFormIntro.textContent = event
    ? `La boleta se crea para ${name}. Elige Preventa para compartir por WhatsApp o En puerta para emitirla al llegar.`
    : "Crea y activa un evento antes de emitir boletas.";
  document.querySelector("#tickets-title").textContent = event ? `Boletas: ${name}` : "Boletas del evento";
  document.title = event ? `${name} | Boletas QR` : "Los Motherfunkys | Boletas QR";

  elements.heroActiveNote.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "live-dot";
  dot.setAttribute("aria-hidden", "true");
  elements.heroActiveNote.append(dot, ` ${heroNote}`);

  const canIssueTickets = Boolean(event) && canUseScanner();
  document.querySelectorAll("[data-open-ticket-form]").forEach((button) => {
    button.disabled = !canIssueTickets;
    button.title = !event
      ? "Activa un evento antes de crear boletas"
      : canUseScanner() ? "" : "Solo la cuenta administradora puede crear boletas";
  });
  elements.changeEventLabel.textContent = canManageEvents() ? "Gestionar eventos" : "Ver eventos";
  renderEventList();
  renderTicketAccess();
  renderScannerAccess();
}

function renderEventList() {
  if (!events.length) {
    elements.eventList.innerHTML = '<p class="event-list-empty">No hay eventos publicados.</p>';
    return;
  }

  const canManage = canManageEvents();
  elements.eventList.innerHTML = events.map((event) => {
    const isActive = event.id === activeEvent?.id;
    return `
      <article class="event-list-item${isActive ? " is-active" : ""}">
        <div>
          <b>${escapeHTML(event.name)}</b>
          <small>${escapeHTML(formatEventDate(event.eventDate))} / ${escapeHTML(event.venue || "Lugar por definir")}</small>
        </div>
        ${canManage ? `<div class="event-list-actions">
          ${isActive ? '<span class="event-active-badge">Activo</span>' : `<button class="event-row-button" type="button" data-event-action="activate" data-event-id="${escapeHTML(event.id)}">Activar</button>`}
          <button class="event-row-button" type="button" data-event-action="edit" data-event-id="${escapeHTML(event.id)}">Editar</button>
        </div>` : isActive ? '<span class="event-active-badge">Activo</span>' : ""}
      </article>
    `;
  }).join("");
}

function ticketPayload(ticket) {
  return `MOTHERFUNKYS|${eventNameForTicket(ticket)}|${ticket.code}`;
}

function ticketPublicUrl(ticket) {
  const url = new URL("boleta.html", window.location.href);
  url.searchParams.set("t", ticket.publicToken);
  return url.href;
}

function makeTicketCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
  let code = `MFK-${part()}-${part()}`;
  while (tickets.some((ticket) => ticket.code === code)) code = `MFK-${part()}-${part()}`;
  return code;
}

function currentTime() {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function currentCreatedTime() {
  return `Hoy, ${currentTime()}`;
}

function usesSupabase() {
  return Boolean(window.TicketStore?.isConfigured());
}

function canManageEvents() {
  return Boolean(adminSession);
}

function canUseScanner() {
  return usesSupabase() && scannerAdmin;
}

function renderTicketAccess() {
  const canManage = canUseScanner();
  elements.ticketStats.hidden = !canManage;
  elements.ticketTypesSection.hidden = !canManage;
  elements.ticketWorkspace.hidden = !canManage;
  elements.ticketNavLink.hidden = !canManage;
  document.querySelectorAll("[data-open-ticket-form]").forEach((button) => {
    button.hidden = !canManage;
  });

  if (!canManage) {
    if (elements.ticketFormDialog.open) closeDialog(elements.ticketFormDialog);
    if (elements.ticketViewDialog.open) closeDialog(elements.ticketViewDialog);
    elements.ticketViewContent.replaceChildren();
  }
}

function formatTicketTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatTicketCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return currentCreatedTime();
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `Hoy, ${formatTicketTime(value)}`;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function fromDatabaseEvent(row) {
  return normalizeEvent(row);
}

function toDatabaseEvent(event) {
  return {
    name: event.name,
    event_date: event.eventDate || null,
    doors_open_at: event.doorsOpenAt || null,
    doors_close_at: event.doorsCloseAt || null,
    show_time: event.showTime || null,
    venue: event.venue || null
  };
}

function fromDatabaseTicket(row) {
  return normalizeTicket({
    id: row.id,
    publicToken: row.public_token,
    code: row.code,
    eventId: row.event_id,
    eventName: row.event_name,
    name: row.holder_name,
    phone: row.phone || "",
    type: row.ticket_type,
    note: row.note || "",
    status: row.status,
    createdAt: formatTicketCreatedAt(row.created_at),
    createdAtIso: row.created_at,
    sentAt: row.sent_at ? formatTicketCreatedAt(row.sent_at) : "",
    sentAtIso: row.sent_at || "",
    checkedInAt: row.checked_in_at ? formatTicketTime(row.checked_in_at) : "",
    checkedInAtIso: row.checked_in_at || ""
  });
}

function toDatabaseTicket(ticket) {
  const event = eventForTicket(ticket);
  return {
    public_token: ticket.publicToken,
    code: ticket.code,
    event_id: event?.id,
    event_name: eventNameForTicket(ticket),
    holder_name: ticket.name,
    phone: ticket.phone || null,
    ticket_type: normalizeTicketType(ticket.type),
    note: ticket.note || null,
    status: ticket.status,
    sent_at: ticket.sentAtIso || null,
    checked_in_at: ticket.checkedInAtIso || null
  };
}

async function loadPublicEvents() {
  const rows = await window.TicketStore.listPublicEvents();
  events = rows.map(fromDatabaseEvent);
  activeEvent = getActiveEvent();
}

async function loadRemoteEvents() {
  const rows = await window.TicketStore.listEvents();
  events = rows.map(fromDatabaseEvent);
  activeEvent = getActiveEvent();
}

async function loadRemoteTickets() {
  if (!activeEvent) {
    tickets = [];
    return;
  }
  const rows = await window.TicketStore.listTickets(activeEvent.id);
  tickets = rows.map(fromDatabaseTicket);
}

function requireAdminSession() {
  if (!usesSupabase()) {
    showToast("La gestión de eventos necesita Supabase y una cuenta del equipo.", "error");
    return false;
  }
  if (adminSession) return true;
  elements.authFeedback.textContent = "Inicia sesión para administrar eventos y boletas compartidas.";
  openDialog(elements.authDialog);
  return false;
}

function requireTicketAdmin() {
  if (!usesSupabase()) {
    showToast("La gestión de boletas necesita Supabase y la cuenta administradora.", "error");
    return false;
  }
  if (!requireAdminSession()) return false;
  if (!scannerAdmin) {
    showToast("Solo la cuenta administradora puede ver o gestionar boletas.", "error");
    return false;
  }
  return true;
}

function renderScannerAccess() {
  const canScan = canUseScanner();
  if (!canScan) stopCamera();
  elements.gateSection.hidden = !canScan;
  elements.gateNavLink.hidden = !canScan;
  elements.gateActionLink.hidden = !canScan;
}

function requireScannerAdmin() {
  return requireTicketAdmin();
}

function updateStats() {
  const eventTickets = currentEventTickets();
  const presale = eventTickets.filter((ticket) => normalizeTicketType(ticket.type) === TICKET_TYPES.PRESALE).length;
  const door = eventTickets.filter((ticket) => normalizeTicketType(ticket.type) === TICKET_TYPES.DOOR).length;
  const checkedIn = eventTickets.filter((ticket) => ticket.status === "checked-in").length;
  const ready = eventTickets.filter((ticket) => ticket.status === "ready").length;

  elements.presale.textContent = presale;
  elements.door.textContent = door;
  elements.checkins.textContent = checkedIn;
  elements.ready.textContent = ready;
  elements.presaleNote.textContent = `${presale} para WhatsApp`;
  elements.doorNote.textContent = `${door} emitidas en acceso`;
  elements.checkinsNote.textContent = `${checkedIn} de ${eventTickets.length} validados`;
  elements.filterCounts.all.textContent = eventTickets.length;
  elements.filterCounts.presale.textContent = presale;
  elements.filterCounts.door.textContent = door;
  elements.filterCounts.ready.textContent = ready;
  elements.filterCounts["checked-in"].textContent = checkedIn;
}

function getFilteredTickets() {
  const query = elements.search.value.trim().toLowerCase();
  return currentEventTickets().filter((ticket) => {
    const hasRightStatus = currentFilter === "all"
      || ticket.status === currentFilter
      || currentFilter === `type:${normalizeTicketType(ticket.type)}`;
    const searchable = `${ticket.name} ${ticket.phone} ${ticket.code} ${ticket.type}`.toLowerCase();
    return hasRightStatus && (!query || searchable.includes(query));
  });
}

function renderTickets() {
  const filtered = getFilteredTickets();
  elements.results.textContent = `${filtered.length} ${filtered.length === 1 ? "boleta encontrada" : "boletas encontradas"}`;
  elements.empty.hidden = filtered.length !== 0;
  elements.list.innerHTML = filtered.map((ticket) => `
    <article class="ticket-row" data-ticket-id="${escapeHTML(ticket.id)}">
      <div class="ticket-qr-mini qr-host" data-qr-code="${escapeHTML(ticket.code)}" aria-label="QR de ${escapeHTML(ticket.name)}"></div>
      <div class="ticket-person">
        <b>${escapeHTML(ticket.name)}</b>
        <small>${escapeHTML(ticket.code)} / ${ticket.phone ? escapeHTML(ticket.phone) : "Venta en puerta"}</small>
      </div>
      <div class="ticket-type ticket-type--${ticketTypeClass(ticket.type)}">${escapeHTML(normalizeTicketType(ticket.type))}<span>${escapeHTML(ticket.createdAt)}</span></div>
      <span class="status-pill ${escapeHTML(ticket.status)}">${statusLabel(ticket.status, ticket.type)}</span>
      <div class="ticket-actions">
        <button class="row-button" type="button" data-action="view" data-ticket-id="${escapeHTML(ticket.id)}">Ver QR</button>
        ${ticket.phone && ticket.status !== "checked-in" ? `<button class="row-button row-button--whatsapp" type="button" data-action="share" data-ticket-id="${escapeHTML(ticket.id)}">WhatsApp</button>` : ""}
      </div>
    </article>
  `).join("");
  renderAllQrs(elements.list);
}

function renderAllQrs(scope = document) {
  scope.querySelectorAll(".qr-host[data-qr-code]").forEach((host) => {
    renderQr(host, host.dataset.qrCode);
  });
}

function renderQr(host, code, size) {
  host.replaceChildren();
  const dimensions = size || Math.max(32, Math.min(host.clientWidth || 96, host.clientHeight || 96));
  const canvas = document.createElement("canvas");
  canvas.width = dimensions;
  canvas.height = dimensions;
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  if (!paintQr(canvas, ticketPayload({ code }), dimensions)) drawFallbackQr(canvas, code);
  return canvas;
}

function paintQr(canvas, value, size) {
  if (typeof window.qrcode !== "function") return false;
  try {
    if (window.qrcode.stringToBytesFuncs?.["UTF-8"]) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
    const qr = window.qrcode(0, "M");
    qr.addData(value);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const quietZone = 4;
    const cellSize = size / (moduleCount + quietZone * 2);
    const context = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;
    context.fillStyle = "#fff2c2";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#170f16";
    for (let row = 0; row < moduleCount; row += 1) {
      for (let column = 0; column < moduleCount; column += 1) {
        if (!qr.isDark(row, column)) continue;
        const left = Math.round((column + quietZone) * cellSize);
        const top = Math.round((row + quietZone) * cellSize);
        const right = Math.round((column + quietZone + 1) * cellSize);
        const bottom = Math.round((row + quietZone + 1) * cellSize);
        context.fillRect(left, top, right - left, bottom - top);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function drawFallbackQr(canvas, value) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff2c2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#170f16";
  context.textAlign = "center";
  context.font = `700 ${Math.max(10, canvas.width / 8)}px Arial, sans-serif`;
  context.fillText("QR no disponible", canvas.width / 2, canvas.height / 2 - 8);
  context.font = `600 ${Math.max(8, canvas.width / 12)}px monospace`;
  context.fillText(value, canvas.width / 2, canvas.height / 2 + 14);
  context.textAlign = "left";
}

function showToast(message, tone = "success") {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.className = `toast is-${tone}`;
  elements.toast.hidden = false;
  toastTimeout = window.setTimeout(() => { elements.toast.hidden = true; }, 4300);
}

function openDialog(dialog) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function syncTicketFormForType() {
  const isPresale = elements.ticketType.value === TICKET_TYPES.PRESALE;
  elements.ticketPhone.required = isPresale;
  elements.phoneFieldLabel.textContent = isPresale ? "WhatsApp de preventa" : "WhatsApp (opcional)";
  elements.ticketPhone.placeholder = isPresale ? "300 000 0000" : "Opcional para enviar enlace";
  elements.ticketTypeHelp.textContent = isPresale
    ? "La preventa necesita un WhatsApp para enviar su enlace personal antes del show."
    : "La boleta en puerta se puede emitir sin WhatsApp y validar desde este mismo panel.";
}

function openTicketForm(ticketType = TICKET_TYPES.PRESALE) {
  if (!requireTicketAdmin()) return;
  if (!activeEvent) {
    showToast("Crea y activa un evento antes de emitir boletas.", "error");
    openEventManager();
    return;
  }
  elements.ticketForm.reset();
  elements.ticketType.value = normalizeTicketType(ticketType);
  syncTicketFormForType();
  elements.formFeedback.textContent = "";
  openDialog(elements.ticketFormDialog);
  window.setTimeout(() => document.querySelector("#ticket-name").focus(), 40);
}

function resetEventForm() {
  editingEventId = "";
  elements.eventForm.reset();
  elements.eventForm.querySelector("#event-id").value = "";
  elements.eventForm.querySelector("#event-active").checked = !activeEvent;
  elements.eventFormTitle.textContent = "Nuevo evento.";
  elements.eventFormSubmit.textContent = "Guardar evento";
  elements.eventFormFeedback.textContent = "";
}

function populateEventForm(event) {
  if (!event) return resetEventForm();
  editingEventId = event.id;
  elements.eventForm.querySelector("#event-id").value = event.id;
  elements.eventForm.querySelector("#event-name").value = event.name;
  elements.eventForm.querySelector("#event-date").value = event.eventDate;
  elements.eventForm.querySelector("#event-venue").value = event.venue;
  elements.eventForm.querySelector("#event-doors-open").value = event.doorsOpenAt;
  elements.eventForm.querySelector("#event-doors-close").value = event.doorsCloseAt;
  elements.eventForm.querySelector("#event-show-time").value = event.showTime;
  elements.eventForm.querySelector("#event-active").checked = event.id === activeEvent?.id;
  elements.eventFormTitle.textContent = "Editar evento.";
  elements.eventFormSubmit.textContent = "Guardar cambios";
  elements.eventFormFeedback.textContent = "";
}

function openEventManager() {
  const canManage = canManageEvents();
  elements.eventManager.classList.toggle("is-public", !canManage);
  elements.eventForm.hidden = !canManage;
  if (canManage) {
    elements.eventManagerEyebrow.textContent = "ADMINISTRACIÓN";
    populateEventForm(activeEvent || events[0]);
  } else {
    editingEventId = "";
    elements.eventManagerEyebrow.textContent = "PROGRAMACIÓN";
    elements.eventFormTitle.textContent = "Eventos.";
  }
  renderEventList();
  openDialog(elements.eventManagerDialog);
  if (canManage) window.setTimeout(() => elements.eventForm.querySelector("#event-name").focus(), 40);
}

async function activateEvent(eventId) {
  if (!requireAdminSession()) return;
  const event = events.find((entry) => entry.id === eventId);
  if (!event || event.id === activeEvent?.id) return;

  try {
    if (usesSupabase()) {
      await window.TicketStore.setActiveEvent(eventId);
      await refreshRemoteTickets();
    } else {
      events = events.map((entry) => ({ ...entry, isActive: entry.id === eventId }));
      activeEvent = getActiveEvent();
      saveEvents();
      renderEventInterface();
      renderTicketInterface();
    }
    populateEventForm(events.find((entry) => entry.id === eventId));
    renderAllQrs(document);
    showToast(`${event.name} es ahora el evento activo.`, "success");
  } catch (error) {
    showToast(error?.message || "No se pudo activar este evento.", "error");
  }
}

async function submitEventForm(event) {
  event.preventDefault();
  if (!requireAdminSession()) return;

  const form = new FormData(elements.eventForm);
  const name = String(form.get("name") || "").trim();
  const eventDate = String(form.get("eventDate") || "");
  const venue = String(form.get("venue") || "").trim();
  if (!name || !eventDate || !venue) {
    elements.eventFormFeedback.textContent = "Escribe el nombre, la fecha y el lugar del evento.";
    return;
  }

  const eventData = {
    id: editingEventId || window.crypto?.randomUUID?.() || `event-${Date.now()}`,
    name,
    eventDate,
    doorsOpenAt: String(form.get("doorsOpenAt") || ""),
    doorsCloseAt: String(form.get("doorsCloseAt") || ""),
    showTime: String(form.get("showTime") || ""),
    venue,
    isActive: false
  };
  const shouldActivate = form.get("isActive") === "on";
  const isEditing = Boolean(editingEventId);
  const wasActive = eventData.id === activeEvent?.id;
  const submitButton = elements.eventFormSubmit;
  submitButton.disabled = true;
  elements.eventFormFeedback.textContent = usesSupabase() ? "Guardando evento en Supabase..." : "Guardando evento...";

  try {
    let savedEvent = eventData;
    if (usesSupabase()) {
      savedEvent = editingEventId
        ? fromDatabaseEvent(await window.TicketStore.updateEvent(editingEventId, toDatabaseEvent(eventData)))
        : fromDatabaseEvent(await window.TicketStore.createEvent(toDatabaseEvent(eventData)));
      if (shouldActivate || wasActive || !activeEvent) await window.TicketStore.setActiveEvent(savedEvent.id);
      await refreshRemoteTickets();
      savedEvent = events.find((entry) => entry.id === savedEvent.id) || savedEvent;
    } else {
      const index = events.findIndex((entry) => entry.id === eventData.id);
      if (index >= 0) events.splice(index, 1, { ...eventData, isActive: wasActive });
      else events.push(eventData);
      if (shouldActivate || wasActive || !activeEvent) events = events.map((entry) => ({ ...entry, isActive: entry.id === eventData.id }));
      activeEvent = getActiveEvent();
      saveEvents();
      renderEventInterface();
      renderTicketInterface();
      savedEvent = events.find((entry) => entry.id === eventData.id) || eventData;
    }
    populateEventForm(savedEvent);
    renderAllQrs(document);
    showToast(`Evento ${isEditing ? "actualizado" : "creado"}: ${savedEvent.name}.`, "success");
  } catch (error) {
    elements.eventFormFeedback.textContent = error?.message || "No se pudo guardar el evento. Revisa la conexión e inténtalo de nuevo.";
  } finally {
    submitButton.disabled = false;
  }
}

function getTicket(ticketId) {
  return currentEventTickets().find((ticket) => ticket.id === ticketId);
}

function openTicketView(ticketId) {
  if (!requireTicketAdmin()) return;
  const ticket = getTicket(ticketId);
  if (!ticket) return;
  const type = normalizeTicketType(ticket.type);
  const typeClass = ticketTypeClass(type);
  const event = eventForTicket(ticket);
  const eventName = eventNameForTicket(ticket);
  const eventDetails = eventSummary(event).toLocaleUpperCase("es-CO");
  elements.ticketViewContent.innerHTML = `
    <div class="ticket-view-layout">
      <section class="view-ticket view-ticket--${typeClass}" aria-label="Boleta QR de ${escapeHTML(ticket.name)}">
        <div>
          <div class="view-ticket-top"><span>ADMISION / 01</span><span class="view-ticket-kind view-ticket-kind--${typeClass}">${escapeHTML(type).toUpperCase()}</span></div>
          <div class="view-ticket-brand">MOTHER<br /><i>FUNKY'S</i></div>
          <p class="view-ticket-name">${escapeHTML(ticket.name)}</p>
          <p class="view-ticket-type">${escapeHTML(eventName)} / ${escapeHTML(type).toUpperCase()}</p>
          <div class="view-qr qr-host" data-qr-code="${escapeHTML(ticket.code)}" aria-label="Codigo QR de acceso"></div>
          <p class="view-ticket-code">${escapeHTML(ticket.code)}</p>
        </div>
        <div class="view-ticket-bottom"><b>${escapeHTML(eventName).toUpperCase()}</b>${escapeHTML(eventDetails)}</div>
      </section>
      <section class="view-details">
        <p class="eyebrow">BOLETA DIGITAL</p>
        <h2 id="ticket-view-title">${escapeHTML(ticket.name)}</h2>
        <span class="status-pill ${escapeHTML(ticket.status)} view-status">${statusLabel(ticket.status, type)}</span>
        <dl class="ticket-detail-list">
          ${ticket.phone ? `<div><dt>WHATSAPP</dt><dd>${escapeHTML(ticket.phone)}</dd></div>` : `<div><dt>ORIGEN</dt><dd>Venta en puerta</dd></div>`}
          <div><dt>TIPO DE BOLETA</dt><dd>${escapeHTML(type)}</dd></div>
          <div><dt>CREADA</dt><dd>${escapeHTML(ticket.createdAt)}</dd></div>
          ${ticket.sentAt ? `<div><dt>ENVIADA</dt><dd>${escapeHTML(ticket.sentAt)}</dd></div>` : ""}
          ${ticket.checkedInAt ? `<div><dt>INGRESO REGISTRADO</dt><dd>Hoy, ${escapeHTML(ticket.checkedInAt)}</dd></div>` : ""}
          ${ticket.note ? `<div><dt>NOTA INTERNA</dt><dd>${escapeHTML(ticket.note)}</dd></div>` : ""}
        </dl>
        <div class="view-actions">
          ${ticket.phone && ticket.status !== "checked-in" ? `<button class="button button-primary button-whatsapp" type="button" data-view-action="share" data-ticket-id="${escapeHTML(ticket.id)}">Enviar enlace por WhatsApp</button>` : ""}
          <button class="button button-outline" type="button" data-view-action="public" data-ticket-id="${escapeHTML(ticket.id)}">Ver versión móvil</button>
          <button class="button button-outline" type="button" data-view-action="download" data-ticket-id="${escapeHTML(ticket.id)}">Descargar boleta</button>
          ${ticket.status !== "checked-in" && canUseScanner() ? `<button class="button button-outline" type="button" data-view-action="checkin" data-ticket-id="${escapeHTML(ticket.id)}">Registrar ingreso</button>` : ""}
          ${canUseScanner() ? `<button class="button button-red" type="button" data-view-action="delete" data-ticket-id="${escapeHTML(ticket.id)}">Eliminar boleta</button>` : ""}
        </div>
        <p class="view-note">El QR es individual y se marca como usado al registrar el ingreso. Eliminar una boleta invalida su enlace público.</p>
        ${ticket.phone ? `<p class="view-note view-note--whatsapp">WhatsApp recibirá un enlace personal. La persona solo tiene que abrirlo y presentar el QR en puerta.</p>` : ""}
      </section>
    </div>
  `;
  openDialog(elements.ticketViewDialog);
  window.requestAnimationFrame(() => renderAllQrs(elements.ticketViewContent));
}

function changeTicketStatus(ticket, status) {
  if (!canUseScanner()) return;
  const previous = {
    status: ticket.status,
    sentAt: ticket.sentAt,
    sentAtIso: ticket.sentAtIso,
    checkedInAt: ticket.checkedInAt,
    checkedInAtIso: ticket.checkedInAtIso
  };
  ticket.status = status;
  if (status === "sent" && !ticket.sentAt) {
    ticket.sentAt = currentCreatedTime();
    ticket.sentAtIso = new Date().toISOString();
  }
  if (status === "checked-in") {
    ticket.checkedInAt = currentTime();
    ticket.checkedInAtIso = new Date().toISOString();
  }
  updateStats();
  renderTickets();

  const changes = { status };
  if (status === "sent") changes.sent_at = ticket.sentAtIso || new Date().toISOString();
  if (status === "checked-in") changes.checked_in_at = ticket.checkedInAtIso || new Date().toISOString();
  void window.TicketStore.updateTicket(ticket.id, changes)
    .then((row) => {
      Object.assign(ticket, fromDatabaseTicket(row));
      updateStats();
      renderTickets();
    })
    .catch(() => {
      Object.assign(ticket, previous);
      updateStats();
      renderTickets();
      showToast("No se pudo actualizar esta boleta en Supabase.", "error");
    });
}

async function deleteTicket(ticketId) {
  if (!requireScannerAdmin()) return;
  const ticket = getTicket(ticketId);
  if (!ticket) return;
  const confirmed = window.confirm(`¿Eliminar la boleta de ${ticket.name}? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  try {
    await window.TicketStore.deleteTicket(ticket.id);
    tickets = tickets.filter((entry) => entry.id !== ticket.id);
    renderTicketInterface();
    if (elements.ticketViewDialog.open) closeDialog(elements.ticketViewDialog);
    showToast(`Boleta eliminada para ${ticket.name}.`);
  } catch {
    showToast("No se pudo eliminar esta boleta. Revisa la conexión e inténtalo de nuevo.", "error");
  }
}

function normalizedPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function shareTicket(ticketId) {
  if (!requireTicketAdmin()) return;
  const ticket = getTicket(ticketId);
  if (!ticket) return;
  if (!ticket.phone) {
    showToast("Esta boleta en puerta no necesita enviarse por WhatsApp.", "error");
    return;
  }
  const message = `Hola ${ticket.name}, aquí está tu boleta para ${eventNameForTicket(ticket)}:\n\n${ticketPublicUrl(ticket)}\n\nAbre este enlace y presenta el QR en puerta.`;
  const phone = normalizedPhone(ticket.phone);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const whatsappWindow = window.open(url, "_blank");
  if (whatsappWindow) whatsappWindow.opener = null;
  else window.location.assign(url);

  changeTicketStatus(ticket, "sent");
  showToast("Se abrió WhatsApp con el enlace personal de la boleta.");
  if (elements.ticketViewDialog.open) openTicketView(ticket.id);
}

function qrFileForTicket(ticket) {
  return new Promise((resolve) => {
    const qrCanvas = document.createElement("canvas");
    qrCanvas.width = 720;
    qrCanvas.height = 720;
    const complete = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      drawTicketImage(canvas, ticket, qrCanvas);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], `boleta-${ticket.code}.png`, { type: "image/png" }) : null);
      }, "image/png");
    };
    if (!paintQr(qrCanvas, ticketPayload(ticket), 720)) drawFallbackQr(qrCanvas, ticket.code);
    complete();
  });
}

function drawFittedCanvasText(context, value, left, top, maxWidth, size, minimumSize) {
  let fontSize = size;
  do {
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    if (context.measureText(value).width <= maxWidth || fontSize === minimumSize) break;
    fontSize -= 1;
  } while (fontSize >= minimumSize);
  context.fillText(value, left, top);
}

function drawTicketImage(canvas, ticket, qrCanvas) {
  const context = canvas.getContext("2d");
  const type = normalizeTicketType(ticket.type);
  const event = eventForTicket(ticket);
  const eventName = eventNameForTicket(ticket).toLocaleUpperCase("es-CO");
  const eventDetails = eventSummary(event).toLocaleUpperCase("es-CO");
  const accent = type === TICKET_TYPES.PRESALE ? "#ff7a1a" : "#c9ff2e";
  const glow = type === TICKET_TYPES.PRESALE ? "#ff3f81" : "#5018a8";
  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#5018a8");
  background.addColorStop(.58, "#170f16");
  background.addColorStop(1, "#0e0714");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const spotlight = context.createRadialGradient(880, 150, 20, 880, 150, 460);
  spotlight.addColorStop(0, glow);
  spotlight.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalAlpha = .42;
  context.fillStyle = spotlight;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = 1;

  context.strokeStyle = "rgba(255, 242, 194, .62)";
  context.lineWidth = 3;
  context.strokeRect(54, 54, canvas.width - 108, canvas.height - 108);
  context.strokeStyle = "rgba(255, 242, 194, .34)";
  context.beginPath();
  context.moveTo(90, 270);
  context.lineTo(canvas.width - 90, 270);
  context.moveTo(90, 1125);
  context.lineTo(canvas.width - 90, 1125);
  context.stroke();

  context.fillStyle = "#fff2c2";
  context.font = "900 41px Arial, sans-serif";
  context.fillText("LOS MOTHERFUNKYS", 90, 142);
  context.fillStyle = accent;
  context.font = "700 25px Arial, sans-serif";
  context.fillText(type.toUpperCase(), 90, 193);
  context.textAlign = "right";
  context.fillStyle = "#fff2c2";
  context.font = "600 22px Arial, sans-serif";
  context.fillText("ADMISION / 01", canvas.width - 90, 142);
  context.textAlign = "left";

  context.fillStyle = "#fff2c2";
  context.font = "900 78px Arial, sans-serif";
  const name = ticket.name.toUpperCase();
  let nameSize = 78;
  while (context.measureText(name).width > 900 && nameSize > 38) {
    nameSize -= 2;
    context.font = `900 ${nameSize}px Arial, sans-serif`;
  }
  context.fillText(name, 90, 385);
  context.fillStyle = "rgba(255, 242, 194, .78)";
  drawFittedCanvasText(context, eventName, 90, 438, 900, 29, 18);
  drawFittedCanvasText(context, eventDetails, 90, 482, 900, 22, 14);

  const qrSize = 560;
  const qrLeft = (canvas.width - qrSize) / 2;
  const qrTop = 535;
  const qrInset = 26;
  context.fillStyle = "#fff2c2";
  context.fillRect(qrLeft, qrTop, qrSize, qrSize);
  context.drawImage(qrCanvas, qrLeft + qrInset, qrTop + qrInset, qrSize - qrInset * 2, qrSize - qrInset * 2);
  context.fillStyle = accent;
  context.font = "700 23px Arial, sans-serif";
  context.fillText("QR PERSONAL DE ACCESO", 90, 1175);
  context.fillStyle = "#fff2c2";
  context.font = "600 26px monospace";
  context.fillText(ticket.code, 90, 1222);
  context.fillStyle = "rgba(255, 242, 194, .75)";
  context.font = "500 22px Arial, sans-serif";
  context.fillText("Una sola lectura valida esta boleta.", 90, 1270);
}

async function downloadTicketQr(ticketId, announce = true) {
  if (!requireTicketAdmin()) return false;
  const ticket = getTicket(ticketId);
  if (!ticket) return false;
  const file = await qrFileForTicket(ticket);
  if (!file) {
    if (announce) showToast("No se pudo preparar la imagen del QR.", "error");
    return false;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = `boleta-${ticket.code}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
  if (announce) showToast("Boleta QR descargada.");
  return true;
}

function extractCode(value) {
  const result = String(value || "").toUpperCase().match(/MFK-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  return result ? result[0] : "";
}

function setValidationResult(message, tone = "neutral", symbol = "?") {
  elements.validationResult.className = `validation-result${tone === "neutral" ? "" : ` is-${tone}`}`;
  elements.validationResult.innerHTML = `<span class="result-icon" aria-hidden="true">${escapeHTML(symbol)}</span><p>${escapeHTML(message)}</p>`;
}

async function validateTicket(rawValue) {
  const code = extractCode(rawValue);
  if (!code) {
    setValidationResult("No encuentro un codigo valido. Revisa la boleta o pega el contenido completo del QR.", "error", "!");
    return false;
  }
  if (!requireScannerAdmin()) return false;
  if (!activeEvent) {
    setValidationResult("Activa un evento antes de validar boletas.", "error", "!");
    return false;
  }

  if (usesSupabase()) {
    try {
      const result = await window.TicketStore.checkInTicket(code, activeEvent.id);
      if (!result) {
        setValidationResult(`El codigo ${code} no pertenece a este evento.`, "error", "!");
        return false;
      }

      let ticket = currentEventTickets().find((entry) => entry.code === code);
      if (!ticket) {
        await loadRemoteTickets();
        ticket = currentEventTickets().find((entry) => entry.code === code);
      }
      if (ticket) {
        ticket.status = result.status;
        ticket.checkedInAt = formatTicketTime(result.checked_in_at);
        ticket.checkedInAtIso = result.checked_in_at || "";
        updateStats();
        renderTickets();
      }

      const name = ticket?.name || result.holder_name;
      const type = ticket?.type || result.ticket_type;
      const checkedInAt = formatTicketTime(result.checked_in_at);
      if (result.already_checked_in) {
        setValidationResult(`${name} ya registro ingreso${checkedInAt ? ` a las ${checkedInAt}` : ""}.`, "warning", "!");
        return false;
      }

      setValidationResult(`Ingreso confirmado: ${name}. Boleta ${normalizeTicketType(type).toLowerCase()} válida.`, "success", "OK");
      const viewedCode = elements.ticketViewContent.querySelector(".view-ticket-code")?.textContent.trim();
      if (ticket && elements.ticketViewDialog.open && viewedCode === ticket.code) openTicketView(ticket.id);
      showToast(`${name} ingreso correctamente.`);
      return true;
    } catch (error) {
      setValidationResult(
        /administrator access/i.test(error?.message || "")
          ? "Tu cuenta no tiene permiso para validar boletas por QR."
          : "No fue posible validar esta boleta. Revisa tu sesión y conexión.",
        "error",
        "!"
      );
      return false;
    }
  }

  const ticket = currentEventTickets().find((entry) => entry.code === code);
  if (!ticket) {
    setValidationResult(`El codigo ${code} no pertenece a este evento.`, "error", "!");
    return false;
  }
  if (ticket.status === "checked-in") {
    setValidationResult(`${ticket.name} ya registro ingreso a las ${ticket.checkedInAt}.`, "warning", "!");
    return false;
  }

  changeTicketStatus(ticket, "checked-in");
  setValidationResult(`Ingreso confirmado: ${ticket.name}. Boleta ${normalizeTicketType(ticket.type).toLowerCase()} válida.`, "success", "OK");
  const viewedCode = elements.ticketViewContent.querySelector(".view-ticket-code")?.textContent.trim();
  if (elements.ticketViewDialog.open && viewedCode === ticket.code) openTicketView(ticket.id);
  showToast(`${ticket.name} ingreso correctamente.`);
  return true;
}

async function startCamera() {
  if (!requireScannerAdmin()) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCameraState("Camara no disponible", "error");
    elements.scannerHelp.textContent = "Tu dispositivo no expone una camara para este sitio.";
    return;
  }
  if (scannerState.libraryScanner || scannerState.stream) return;

  try {
    elements.scanIdle.hidden = true;
    elements.scanFrame.classList.add("is-scanning");
    elements.startCamera.hidden = true;
    elements.stopCamera.hidden = false;
    setCameraState("Activando", "running");
    elements.scannerHelp.textContent = "Permite el acceso a la camara y apunta al QR dentro del marco.";
    if (typeof window.Html5Qrcode === "function") {
      await startCrossBrowserCamera();
    } else if ("BarcodeDetector" in window) {
      await startNativeCamera();
    } else {
      throw new Error("QR camera scanning is not supported.");
    }
    if (!scannerState.libraryScanner && !scannerState.stream) return;

    setCameraState("Escaneando", "running");
    elements.scannerHelp.textContent = "Acerca el QR hasta que quede dentro del marco. La camara se detendra despues de una lectura valida.";
  } catch (error) {
    stopCamera();
    const permissionDenied = isCameraPermissionError(error);
    const timedOut = error?.name === "TimeoutError";
    setCameraState(permissionDenied ? "Permiso requerido" : timedOut ? "Sin respuesta" : "Camara no disponible", "error");
    elements.scannerHelp.textContent = permissionDenied
      ? "Permite el acceso a la camara en los ajustes del navegador e intentalo de nuevo."
      : timedOut
        ? "La camara no respondio. Cierra otras apps que la usen, revisa el permiso o usa Leer captura."
        : "No pudimos activar la camara. Revisa que uses HTTPS, cierres otras apps que la usen e intentalo de nuevo.";
  }
}

function isCameraPermissionError(error) {
  return error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError" || error?.name === "SecurityError";
}

function withCameraStartTimeout(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error("Camera activation timed out.");
      error.name = "TimeoutError";
      reject(error);
    }, CAMERA_START_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function qrFormats() {
  const qrCode = window.Html5QrcodeSupportedFormats?.QR_CODE;
  return typeof qrCode === "number" ? [qrCode] : undefined;
}

function createCrossBrowserScanner() {
  const config = { useBarCodeDetectorIfSupported: false };
  const formatsToSupport = qrFormats();
  if (formatsToSupport) config.formatsToSupport = formatsToSupport;
  return new window.Html5Qrcode("camera-reader", config);
}

async function startCrossBrowserCamera() {
  // The library's ZXing decoder is more reliable than experimental BarcodeDetector support on mobile.
  const scanner = createCrossBrowserScanner();
  scannerState.libraryScanner = scanner;
  elements.cameraReader.hidden = false;
  const startPromise = scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      // Scan the full video frame; the app renders the only visual guide.
      aspectRatio: 1.333334,
      disableFlip: false
    },
    (decodedText) => { void handleScannedValue(decodedText); },
    () => {}
  );
  try {
    await withCameraStartTimeout(startPromise);
  } catch (error) {
    if (scannerState.libraryScanner === scanner) scannerState.libraryScanner = null;
    void startPromise.then(() => scanner.stop().catch(() => {}).then(() => { try { scanner.clear(); } catch {} })).catch(() => {});
    throw error;
  }
  if (scannerState.libraryScanner !== scanner) {
    await scanner.stop().catch(() => {});
    try { scanner.clear(); } catch {}
  }
}

async function startNativeCamera() {
  scannerState.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  const streamPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  try {
    scannerState.stream = await withCameraStartTimeout(streamPromise);
  } catch (error) {
    void streamPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    throw error;
  }
  elements.cameraVideo.srcObject = scannerState.stream;
  elements.cameraVideo.hidden = false;
  await withCameraStartTimeout(elements.cameraVideo.play());
  scanCameraFrame();
}

async function handleScannedValue(rawValue) {
  if (!rawValue || rawValue === scannerState.lastValue || scannerState.isValidating) return;
  scannerState.lastValue = rawValue;
  scannerState.isValidating = true;
  const valid = await validateTicket(rawValue);
  scannerState.isValidating = false;
  if (valid) {
    stopCamera();
    return;
  }
  window.setTimeout(() => {
    if (scannerState.lastValue === rawValue) scannerState.lastValue = "";
  }, 1200);
}

async function scanCameraFrame() {
  if (!scannerState.detector || !scannerState.stream) return;
  try {
    const codes = await scannerState.detector.detect(elements.cameraVideo);
    if (codes.length) void handleScannedValue(codes[0].rawValue);
  } catch {
    // A frame can be unavailable while the video starts; keep the reader alive.
  }
  scannerState.animationFrame = window.requestAnimationFrame(scanCameraFrame);
}

function clearNativeCamera() {
  if (scannerState.stream) scannerState.stream.getTracks().forEach((track) => track.stop());
  scannerState.stream = null;
  scannerState.detector = null;
  elements.cameraVideo.pause();
  elements.cameraVideo.srcObject = null;
  elements.cameraVideo.hidden = true;
}

function stopCamera() {
  if (scannerState.animationFrame) window.cancelAnimationFrame(scannerState.animationFrame);
  scannerState.animationFrame = null;
  const libraryScanner = scannerState.libraryScanner;
  scannerState.libraryScanner = null;
  if (libraryScanner) {
    void libraryScanner.stop()
      .catch(() => {})
      .then(() => { try { libraryScanner.clear(); } catch {} })
      .finally(() => {
        if (!scannerState.libraryScanner) elements.cameraReader.replaceChildren();
      });
  } else {
    elements.cameraReader.replaceChildren();
  }
  clearNativeCamera();
  scannerState.lastValue = "";
  scannerState.isValidating = false;
  elements.cameraReader.hidden = true;
  elements.scanIdle.hidden = false;
  elements.scanFrame.classList.remove("is-scanning");
  elements.startCamera.hidden = false;
  elements.stopCamera.hidden = true;
  if (!elements.cameraStatus.classList.contains("is-error")) setCameraState("En espera");
}

function setCameraState(label, mode = "idle") {
  elements.cameraStatus.textContent = label;
  elements.cameraStatus.className = `camera-status${mode === "idle" ? "" : ` is-${mode}`}`;
}

async function scanUploadedImage(file) {
  if (!file) return;
  if (!requireScannerAdmin()) {
    elements.qrUpload.value = "";
    return;
  }
  if (scannerState.libraryScanner || scannerState.stream) {
    setValidationResult("Deten la camara antes de leer una captura.", "warning", "!");
    elements.qrUpload.value = "";
    return;
  }
  if (typeof window.Html5Qrcode === "function") {
    try {
      const scanner = createCrossBrowserScanner();
      const rawValue = await scanner.scanFile(file, false);
      try { scanner.clear(); } catch {}
      await validateTicket(rawValue);
    } catch {
      setValidationResult("No se pudo leer esa captura. Pega el codigo de la boleta para validar.", "error", "!");
    } finally {
      elements.cameraReader.replaceChildren();
      elements.qrUpload.value = "";
    }
    return;
  }
  if (!("BarcodeDetector" in window)) {
    setValidationResult("Este navegador no puede leer QR desde una imagen. Pega el codigo manualmente.", "error", "!");
    return;
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const image = await createImageBitmap(file);
    const codes = await detector.detect(image);
    image.close?.();
    if (!codes.length) {
      setValidationResult("No se encontro un QR en esa imagen. Prueba con una captura mas nitida.", "error", "!");
      return;
    }
    await validateTicket(codes[0].rawValue);
  } catch {
    setValidationResult("No fue posible leer esa captura. Pega el codigo de la boleta para validar.", "error", "!");
  } finally {
    elements.qrUpload.value = "";
  }
}

function renderTicketInterface() {
  updateStats();
  renderTickets();
}

function renderConnectionState() {
  if (!usesSupabase()) {
    elements.connectionBadge.textContent = "Modo local / este navegador";
    elements.adminLogin.hidden = true;
    elements.adminLogout.hidden = true;
    return;
  }

  elements.adminLogin.hidden = Boolean(adminSession);
  elements.adminLogout.hidden = !adminSession;
  elements.connectionBadge.textContent = adminSession
    ? `Supabase / ${adminSession.user.email}${scannerAdmin ? " / administrador" : " / eventos"}`
    : "Supabase / inicia sesión";
}

async function refreshPublicEvents() {
  if (!usesSupabase()) return;
  await loadPublicEvents();
  if (!scannerAdmin) tickets = [];
  renderEventInterface();
  renderTicketInterface();
  renderAllQrs(document);
}

async function refreshRemoteTickets() {
  if (!usesSupabase() || !adminSession) return;
  scannerAdmin = await window.TicketStore.isEventAdmin();
  if (scannerAdmin) {
    await loadRemoteEvents();
    await loadRemoteTickets();
  } else {
    tickets = [];
    await loadPublicEvents();
  }
  renderEventInterface();
  renderTicketInterface();
  renderAllQrs(document);
}

async function initializeSupabase() {
  renderConnectionState();
  if (!usesSupabase()) return;

  elements.connectionBadge.textContent = "Supabase / conectando";
  try {
    await refreshPublicEvents();
  } catch {
    events = [];
    activeEvent = null;
    renderEventInterface();
    renderTicketInterface();
  }

  try {
    adminSession = await window.TicketStore.getSession();
    if (adminSession) await refreshRemoteTickets();
    else {
      scannerAdmin = false;
      tickets = [];
      renderEventInterface();
      renderTicketInterface();
    }
    renderConnectionState();
  } catch {
    adminSession = null;
    scannerAdmin = false;
    tickets = [];
    renderEventInterface();
    renderTicketInterface();
    elements.connectionBadge.textContent = "Supabase / sin conexión";
  }
}

async function signInAdmin(event) {
  event.preventDefault();
  const form = new FormData(elements.authForm);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) {
    elements.authFeedback.textContent = "Escribe el correo y la contraseña del equipo.";
    return;
  }

  const submitButton = elements.authForm.querySelector("button[type=submit]");
  submitButton.disabled = true;
  elements.authFeedback.textContent = "Iniciando sesión...";
  try {
    adminSession = await window.TicketStore.signIn(email, password);
    await refreshRemoteTickets();
    renderConnectionState();
    closeDialog(elements.authDialog);
    showToast(scannerAdmin ? "Sesión administradora iniciada." : "Sesión iniciada para gestionar eventos.");
  } catch {
    adminSession = null;
    scannerAdmin = false;
    renderConnectionState();
    elements.authFeedback.textContent = "No pudimos iniciar sesión. Revisa tus credenciales.";
  } finally {
    submitButton.disabled = false;
  }
}

async function signOutAdmin() {
  try {
    await window.TicketStore.signOut();
    adminSession = null;
    scannerAdmin = false;
    tickets = [];
    if (elements.ticketViewDialog.open) closeDialog(elements.ticketViewDialog);
    if (elements.ticketFormDialog.open) closeDialog(elements.ticketFormDialog);
    if (elements.eventManagerDialog.open) closeDialog(elements.eventManagerDialog);
    await refreshPublicEvents().catch(() => {});
    renderEventInterface();
    renderTicketInterface();
    renderConnectionState();
    showToast("Sesión cerrada.");
  } catch {
    showToast("No fue posible cerrar la sesión.", "error");
  }
}

function bindEvents() {
  document.querySelectorAll("[data-open-ticket-form]").forEach((button) => button.addEventListener("click", () => openTicketForm(button.dataset.ticketType)));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.querySelector(`#${button.dataset.closeDialog}`)));
  });
  elements.adminLogin.addEventListener("click", () => {
    elements.authForm.reset();
    elements.authFeedback.textContent = "";
    openDialog(elements.authDialog);
    window.setTimeout(() => elements.authForm.elements.email.focus(), 40);
  });
  elements.adminLogout.addEventListener("click", () => { void signOutAdmin(); });
  elements.authForm.addEventListener("submit", signInAdmin);
  elements.eventForm.addEventListener("submit", (event) => { void submitEventForm(event); });
  elements.newEvent.addEventListener("click", resetEventForm);
  elements.eventList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-action]");
    if (!button) return;
    const selectedEvent = events.find((entry) => entry.id === button.dataset.eventId);
    if (!selectedEvent) return;
    if (button.dataset.eventAction === "edit") populateEventForm(selectedEvent);
    if (button.dataset.eventAction === "activate") void activateEvent(selectedEvent.id);
  });

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      document.querySelectorAll(".filter-button").forEach((filterButton) => filterButton.classList.toggle("is-selected", filterButton === button));
      renderTickets();
    });
  });
  elements.search.addEventListener("input", renderTickets);
  elements.ticketType.addEventListener("change", syncTicketFormForType);

  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "view") openTicketView(button.dataset.ticketId);
    if (button.dataset.action === "share") void shareTicket(button.dataset.ticketId);
  });

  elements.ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireTicketAdmin()) return;
    if (!activeEvent) {
      elements.formFeedback.textContent = "Crea y activa un evento antes de emitir una boleta.";
      return;
    }
    const form = new FormData(elements.ticketForm);
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const type = normalizeTicketType(form.get("type"));
    if (!name || (type === TICKET_TYPES.PRESALE && !phone)) {
      elements.formFeedback.textContent = type === TICKET_TYPES.PRESALE
        ? "Escribe el nombre y el WhatsApp para enviar la preventa."
        : "Escribe el nombre de la persona para emitir la boleta en puerta.";
      return;
    }
    const ticket = {
      id: window.crypto?.randomUUID?.() || `ticket-${Date.now()}`,
      publicToken: makePublicTicketToken(),
      code: makeTicketCode(),
      eventId: activeEvent.id,
      eventName: activeEvent.name,
      name,
      phone,
      type,
      note: String(form.get("note") || "").trim(),
      status: "ready",
      createdAt: currentCreatedTime(),
      createdAtIso: new Date().toISOString(),
      sentAt: "",
      sentAtIso: "",
      checkedInAt: "",
      checkedInAtIso: ""
    };
    const submitButton = elements.ticketForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    elements.formFeedback.textContent = "Creando boleta en Supabase...";
    try {
      const row = await window.TicketStore.createTicket(toDatabaseTicket(ticket));
      const savedTicket = fromDatabaseTicket(row);
      tickets.unshift(savedTicket);
      renderTicketInterface();
      closeDialog(elements.ticketFormDialog);
      openTicketView(savedTicket.id);
      showToast(`Boleta creada para ${savedTicket.name}.`);
    } catch (error) {
      if (/no longer active/i.test(error?.message || "")) {
        elements.formFeedback.textContent = "El evento activo cambió. Actualiza el formulario antes de crear la boleta.";
        void refreshRemoteTickets().catch(() => {});
      } else {
        elements.formFeedback.textContent = "No se pudo crear la boleta. Revisa la conexión e inténtalo de nuevo.";
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.ticketViewContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-action]");
    if (!button) return;
    const ticketId = button.dataset.ticketId;
    if (button.dataset.viewAction === "share") void shareTicket(ticketId);
    if (button.dataset.viewAction === "public") {
      const ticket = getTicket(ticketId);
      if (ticket) window.open(ticketPublicUrl(ticket), "_blank", "noopener,noreferrer");
    }
    if (button.dataset.viewAction === "download") void downloadTicketQr(ticketId);
    if (button.dataset.viewAction === "delete") void deleteTicket(ticketId);
    if (button.dataset.viewAction === "checkin") {
      const ticket = getTicket(ticketId);
      if (ticket) {
        void validateTicket(ticket.code).then((valid) => {
          if (valid) openTicketView(ticketId);
        });
      }
    }
  });

  document.querySelector("#validate-code").addEventListener("click", () => { void validateTicket(elements.manualCode.value); });
  elements.manualCode.addEventListener("keydown", (event) => { if (event.key === "Enter") void validateTicket(elements.manualCode.value); });
  document.querySelector("#fill-sample-code").addEventListener("click", () => {
    const sample = currentEventTickets().find((ticket) => ticket.status === "sent") || currentEventTickets().find((ticket) => ticket.status === "ready");
    if (sample) elements.manualCode.value = sample.code;
    elements.manualCode.focus();
  });

  elements.startCamera.addEventListener("click", () => { void startCamera(); });
  elements.stopCamera.addEventListener("click", stopCamera);
  elements.qrUpload.addEventListener("change", () => scanUploadedImage(elements.qrUpload.files[0]));
  document.querySelector("#change-event").addEventListener("click", openEventManager);
  window.addEventListener("beforeunload", stopCamera);
  window.addEventListener("focus", () => {
    if (adminSession) void refreshRemoteTickets().catch(() => {});
    else void refreshPublicEvents().catch(() => {});
  });
}

function initialize() {
  setupPwa();
  syncTicketFormForType();
  renderEventInterface();
  updateStats();
  renderTickets();
  renderAllQrs(document);
  bindEvents();
  void initializeSupabase();
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}), { once: true });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installApp.hidden = false;
  });

  elements.installApp.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = undefined;
      elements.installApp.hidden = true;
      return;
    }
    showToast("En Safari, usa Compartir y luego Añadir a pantalla de inicio.");
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIos && !isStandalone) elements.installApp.hidden = false;
}

initialize();
