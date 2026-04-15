
-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Org members table
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'corretor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Security definer functions to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = _user_id;
$$;

-- RLS policies for organizations
CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Authenticated can create org" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admin can update org" ON public.organizations
  FOR UPDATE USING (id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- RLS policies for org_members
CREATE POLICY "Members see own org members" ON public.org_members
  FOR SELECT USING (org_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Admin can manage members" ON public.org_members
  FOR INSERT WITH CHECK (org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'
  ) OR NOT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = org_members.org_id));

CREATE POLICY "Admin can update members" ON public.org_members
  FOR UPDATE USING (org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin can delete members" ON public.org_members
  FOR DELETE USING (org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Add org_id to leads (nullable for backward compatibility)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
