-- Soft delete columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Indexes for active records
CREATE INDEX IF NOT EXISTS idx_leads_active ON leads(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_notes_active ON lead_notes(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_active ON interactions(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(lead_id) WHERE deleted_at IS NULL;

-- Update RLS policies to filter deleted records
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
CREATE POLICY "Users can view own active leads" ON leads FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view their own tasks" ON tasks;
CREATE POLICY "Users can view own active tasks" ON tasks FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view their own lead notes" ON lead_notes;
CREATE POLICY "Users can view own active lead notes" ON lead_notes FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view own lead documents" ON lead_documents;
DROP POLICY IF EXISTS "Users can view their own lead documents" ON lead_documents;
CREATE POLICY "Users can view own active lead documents" ON lead_documents FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view their own interactions" ON interactions;
CREATE POLICY "Users can view own active interactions" ON interactions FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view their own reminders" ON reminders;
CREATE POLICY "Users can view own active reminders" ON reminders FOR SELECT 
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Add missing UPDATE policy on lead_documents
CREATE POLICY "Users can update own documents" ON lead_documents 
  FOR UPDATE USING (auth.uid() = user_id);

-- Clean up duplicate whatsapp messages before adding unique constraint
DELETE FROM whatsapp_messages a USING whatsapp_messages b
WHERE a.id < b.id AND a.uazapi_message_id = b.uazapi_message_id 
  AND a.uazapi_message_id IS NOT NULL;

-- Add UNIQUE constraint on whatsapp messages (partial - only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS unique_uazapi_message_id 
  ON whatsapp_messages (uazapi_message_id) WHERE uazapi_message_id IS NOT NULL;