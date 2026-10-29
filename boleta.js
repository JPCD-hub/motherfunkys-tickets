"use strict";

const elements = {
  loading: document.querySelector("#ticket-loading"),
  error: document.querySelector("#ticket-error"),
  errorCopy: document.querySelector("#ticket-error-copy"),
  ticket: document.querySelector("#public-ticket"),
  type: document.querySelector("#ticket-type"),
  holder: document.querySelector("#ticket-holder"),
  event: document.querySelector("#ticket-event"),
  code: document.querySelector("#ticket-code"),
  qr: document.querySelector("#ticket-qr"),
  status: document.querySelector("#ticket-status"),
  help: document.querySelector("#ticket-help"),
  install: document.querySelector("#install-ticket-app"),
  lookupForm: document.querySelector("#ticket-lookup-form"),
  lookupInput: document.querySelector("#ticket-lookup-input"),
  lookupFeedback: document.querySelector("#ticket-lookup-feedback")
};

let deferredInstallPrompt;

function decodePreview(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const ticket = JSON.parse(new TextDecoder().decode(bytes));
    if (!ticket || !/^MFK-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(ticket.code || "") || !ticket.name) return null;
    return ticket;
  } catch {
    return null;
  }
}

function isSupabaseConfigured() {
  const config = window.MF_SUPABASE_CONFIG || {};
  return Boolean(config.url && config.anonKey && window.supabase?.createClient);
}

function isPublicToken(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

function formatCheckinTime(value) {
  if (/^\d{1,2}:\d{2}$/.test(String(value || ""))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

async function getRemoteTicket(token) {
  const config = window.MF_SUPABASE_CONFIG;
  const client = window.supabase.createClient(config.url, config.anonKey);
  const { data, error } = await client.rpc("public_ticket", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    token,
    code: row.code,
    name: row.holder_name,
    type: row.ticket_type,
    event: row.event_name,
    status: row.status,
    checkedInAt: row.checked_in_at || ""
  };
}

function typeLabel(type) {
  return String(type || "").toLocaleLowerCase("es-CO") === "en puerta" ? "EN PUERTA" : "PREVENTA";
}

function renderQr(ticket) {
  const canvas = document.createElement("canvas");
  elements.qr.replaceChildren(canvas);
  const payload = `MOTHERFUNKYS|${ticket.event}|${ticket.code}`;
  if (!paintQr(canvas, payload, 280)) drawUnavailableQr(canvas, ticket.code);
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

function drawUnavailableQr(canvas, code) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff2c2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#170f16";
  context.textAlign = "center";
  context.font = "700 16px Arial, sans-serif";
  context.fillText("QR no disponible", canvas.width / 2, canvas.height / 2 - 10);
  context.font = "600 11px monospace";
  context.fillText(code, canvas.width / 2, canvas.height / 2 + 18);
  context.textAlign = "left";
}

function renderTicket(ticket) {
  const type = typeLabel(ticket.type);
  const used = ticket.status === "checked-in";
  elements.type.textContent = type;
  elements.type.dataset.type = type === "EN PUERTA" ? "door" : "presale";
  elements.holder.textContent = ticket.name;
  elements.event.textContent = ticket.event || "FUNK EN LA TERRAZA";
  elements.code.textContent = ticket.code;
  elements.status.classList.toggle("is-used", used);
  elements.status.querySelector("span").textContent = used ? "USADA" : "OK";
  elements.status.querySelector("b").textContent = used ? "Esta boleta ya fue utilizada" : "Boleta válida";
  elements.status.querySelector("small").textContent = used
    ? `Ingreso registrado${formatCheckinTime(ticket.checkedInAt) ? ` a las ${formatCheckinTime(ticket.checkedInAt)}` : ""}.`
    : "Muéstrala en puerta para escanearla.";
  document.title = `${ticket.name} | Boleta Motherfunkys`;
  renderQr(ticket);
  elements.loading.hidden = true;
  elements.ticket.hidden = false;
  elements.help.hidden = false;
}

function showError(message) {
  elements.loading.hidden = true;
  elements.errorCopy.textContent = message;
  elements.error.hidden = false;
}

function ticketUrlFromLookup(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  if (isPublicToken(input)) {
    const url = new URL("boleta.html", window.location.href);
    url.searchParams.set("t", input);
    return url.href;
  }

  try {
    const source = new URL(input, window.location.href);
    const token = source.searchParams.get("t");
    const preview = source.searchParams.get("ticket");
    const url = new URL("boleta.html", window.location.href);
    if (isPublicToken(token)) {
      url.searchParams.set("t", token);
      return url.href;
    }
    if (preview && decodePreview(preview)) {
      url.searchParams.set("ticket", preview);
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function setupTicketLookup() {
  elements.lookupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const ticketUrl = ticketUrlFromLookup(elements.lookupInput.value);
    if (!ticketUrl) {
      elements.lookupFeedback.textContent = "Pega el enlace completo que recibiste por WhatsApp.";
      return;
    }
    window.location.assign(ticketUrl);
  });
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}), { once: true });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.install.hidden = false;
  });
  elements.install.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = undefined;
    elements.install.hidden = true;
  });
}

async function initialize() {
  setupTicketLookup();
  setupPwa();
  const params = new URLSearchParams(window.location.search);
  const preview = decodePreview(params.get("ticket") || "");
  const token = params.get("t");

  try {
    if (token && isSupabaseConfigured()) {
      if (!isPublicToken(token)) {
        showError("Este enlace de boleta no es válido. Solicita uno nuevo al equipo del evento.");
        return;
      }
      const remoteTicket = await getRemoteTicket(token);
      if (remoteTicket) return renderTicket(remoteTicket);
      showError("Esta boleta no existe o ya no está disponible. Solicita ayuda al equipo del evento.");
      return;
    }
    if (preview) return renderTicket(preview);
    showError("Revisa el enlace recibido por WhatsApp o solicita una nueva boleta al equipo del evento.");
  } catch {
    if (preview) return renderTicket(preview);
    showError("No pudimos consultar esta boleta. Intenta abrir de nuevo el enlace cuando tengas conexión.");
  }
}

initialize();
