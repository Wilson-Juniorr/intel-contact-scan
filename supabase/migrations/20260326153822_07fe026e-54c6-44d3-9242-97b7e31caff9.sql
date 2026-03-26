
-- Add is_personal flag to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

-- Clean all leads and related data
DELETE FROM public.closing_steps;
DELETE FROM public.closing_sequences;
DELETE FROM public.follow_up_queue;
DELETE FROM public.lead_notes;
DELETE FROM public.lead_checklist;
DELETE FROM public.lead_documents;
DELETE FROM public.lead_members;
DELETE FROM public.lead_memory;
DELETE FROM public.interactions;
DELETE FROM public.tasks;
DELETE FROM public.reminders;
DELETE FROM public.action_log;
UPDATE public.whatsapp_messages SET lead_id = NULL;
UPDATE public.whatsapp_contacts SET lead_id = NULL;
DELETE FROM public.leads;
