
DELETE FROM closing_steps;
DELETE FROM closing_sequences;
DELETE FROM follow_up_queue;
DELETE FROM action_log;
DELETE FROM lead_checklist;
DELETE FROM lead_documents;
DELETE FROM lead_members;
DELETE FROM lead_notes;
DELETE FROM lead_memory;
DELETE FROM interactions;
DELETE FROM reminders;
DELETE FROM tasks;
DELETE FROM whatsapp_messages WHERE lead_id IS NOT NULL;
UPDATE whatsapp_messages SET lead_id = NULL;
UPDATE whatsapp_contacts SET lead_id = NULL;
DELETE FROM leads;
