export interface WhatsAppMessage {
  id: string;
  user_id: string;
  lead_id: string | null;
  phone: string;
  direction: "inbound" | "outbound";
  message_type: string;
  content: string | null;
  media_url: string | null;
  uazapi_message_id: string | null;
  status: string | null;
  contact_name: string | null;
  extracted_text: string | null;
  processing_status: string | null;
  extracted_semantic_summary: string | null;
  extracted_entities: Record<string, unknown> | null;
  business_relevance_score: number | null;
  intent: string | null;
  message_category: string | null;
  media_storage_path: string | null;
  processing_error: string | null;
  classification_confidence: string | null;
  created_at: string;
}

export interface WhatsAppContact {
  id: string;
  user_id: string;
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  is_personal: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  isPersonal: boolean;
}
