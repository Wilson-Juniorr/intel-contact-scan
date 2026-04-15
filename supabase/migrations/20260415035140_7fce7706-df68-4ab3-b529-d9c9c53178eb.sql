-- Performance indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_leads_user_stage ON leads(user_id, stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_user_updated ON leads(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_user_created ON interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_created ON interactions(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_execution ON follow_up_queue(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_follow_up_lead ON follow_up_queue(lead_id);

CREATE INDEX IF NOT EXISTS idx_action_log_user_created ON action_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_docs_lead ON lead_documents(lead_id);

CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, status, due_at) WHERE deleted_at IS NULL;

-- API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  model TEXT DEFAULT 'gemini-2.5-flash-lite',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_user_date ON api_usage(user_id, created_at DESC);
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON api_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can insert usage" ON api_usage FOR INSERT WITH CHECK (true);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  daily_token_limit INTEGER DEFAULT 500000,
  monthly_token_limit INTEGER DEFAULT 10000000,
  ai_enabled BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 0,
  display_name TEXT,
  notification_sound BOOLEAN DEFAULT true,
  notification_browser BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);