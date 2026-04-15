import { supabase } from "@/integrations/supabase/client";

export const whatsappService = {
  getMessages: (userId: string, limit = 1000, offset = 0) =>
    supabase
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1),

  getAllMessages: async () => {
    const allMessages: unknown[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Error fetching messages:", error);
        break;
      }
      if (data && data.length > 0) allMessages.push(...data);
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    return allMessages;
  },

  getContacts: async () => {
    const allContacts: unknown[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_contacts")
        .select("*")
        .order("contact_name", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Error fetching contacts:", error);
        break;
      }
      if (data && data.length > 0) allContacts.push(...data);
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    return allContacts;
  },

  sendMessage: (phone: string, message: string, leadId?: string | null) =>
    supabase.functions.invoke("send-whatsapp", {
      body: { phone, message, lead_id: leadId },
    }),

  syncContacts: () => supabase.functions.invoke("sync-whatsapp"),

  togglePersonal: (phone: string, isPersonal: boolean) =>
    supabase
      .from("whatsapp_contacts")
      .update({ is_personal: isPersonal })
      .eq("phone", phone),
};
