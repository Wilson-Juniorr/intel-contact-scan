export interface Task {
  id: string;
  user_id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  user_id: string;
  content: string;
  category: string;
  tags: string[] | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadDocument {
  id: string;
  lead_id: string;
  user_id: string;
  member_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  ocr_text: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface LeadChecklist {
  id: string;
  lead_id: string;
  user_id: string;
  item_name: string;
  completed: boolean;
  document_id: string | null;
  created_at: string;
}

export interface LeadMemory {
  id: string;
  lead_id: string;
  user_id: string;
  summary: string | null;
  structured_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpQueueItem {
  id: string;
  lead_id: string;
  user_id: string;
  attempt_number: number;
  max_attempts: number;
  message_content: string | null;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  created_at: string;
}

export interface ActionLog {
  id: string;
  user_id: string;
  lead_id: string;
  action_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
