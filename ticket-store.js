"use strict";

(function createTicketStore() {
  const config = window.MF_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey);
  const client = configured && window.supabase?.createClient ? window.supabase.createClient(config.url, config.anonKey) : null;

  function requireClient() {
    if (!configured) throw new Error("Supabase no está configurado.");
    if (!client) throw new Error("No se pudo cargar el cliente de Supabase.");
    return client;
  }

  async function unwrap(request) {
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return data;
  }

  window.TicketStore = {
    isConfigured() {
      return configured;
    },

    async getSession() {
      const { data, error } = await requireClient().auth.getSession();
      if (error) throw new Error(error.message);
      return data.session;
    },

    async signIn(email, password) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return data.session;
    },

    async signOut() {
      const { error } = await requireClient().auth.signOut();
      if (error) throw new Error(error.message);
    },

    async listPublicEvents() {
      return unwrap(requireClient().rpc("public_events"));
    },

    async isEventAdmin() {
      return Boolean(await unwrap(requireClient().rpc("is_event_admin")));
    },

    async listEvents() {
      return unwrap(
        requireClient()
          .from("events")
          .select("*")
          .order("is_active", { ascending: false })
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
      );
    },

    async createEvent(event) {
      const rows = await unwrap(requireClient().from("events").insert(event).select().limit(1));
      if (!rows[0]) throw new Error("Supabase no devolvió el evento creado.");
      return rows[0];
    },

    async updateEvent(id, changes) {
      const rows = await unwrap(requireClient().from("events").update(changes).eq("id", id).select().limit(1));
      if (!rows[0]) throw new Error("El evento ya no está disponible para actualizar.");
      return rows[0];
    },

    async setActiveEvent(id) {
      await unwrap(requireClient().rpc("set_active_event", { p_event_id: id }));
    },

    async listTickets(eventId) {
      let request = requireClient().from("event_tickets").select("*").order("created_at", { ascending: false });
      if (eventId) request = request.eq("event_id", eventId);
      return unwrap(request);
    },

    async createTicket(ticket) {
      const rows = await unwrap(requireClient().from("event_tickets").insert(ticket).select().limit(1));
      if (!rows[0]) throw new Error("Supabase no devolvió la boleta creada.");
      return rows[0];
    },

    async updateTicket(id, changes) {
      const rows = await unwrap(requireClient().from("event_tickets").update(changes).eq("id", id).select().limit(1));
      if (!rows[0]) throw new Error("La boleta ya no está disponible para actualizar.");
      return rows[0];
    },

    async deleteTicket(id) {
      const rows = await unwrap(requireClient().from("event_tickets").delete().eq("id", id).select("id"));
      if (!rows?.[0]) throw new Error("La boleta ya no está disponible para eliminar.");
      return rows[0];
    },

    async checkInTicket(code, eventId) {
      const rows = await unwrap(requireClient().rpc("check_in_ticket", { p_code: code, p_event_id: eventId }));
      return rows[0] || null;
    }
  };
})();
