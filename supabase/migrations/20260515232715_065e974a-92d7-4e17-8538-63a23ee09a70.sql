
DO $$
DECLARE
  v_phones text[] := ARRAY['11958047450','5511958047450'];
  v_lead_ids uuid[];
  v_conv_ids uuid[];
  v_seq_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_lead_ids FROM leads WHERE phone = ANY(v_phones);
  SELECT array_agg(id) INTO v_conv_ids FROM agent_conversations WHERE whatsapp_number = ANY(v_phones);

  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM agent_messages WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM agent_critic_log WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM agent_split_log WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM agent_compliance_log WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM agent_handoffs WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM agent_conversations WHERE id = ANY(v_conv_ids);
  END IF;

  DELETE FROM whatsapp_messages WHERE phone = ANY(v_phones);
  DELETE FROM whatsapp_contacts WHERE phone = ANY(v_phones);
  DELETE FROM conversation_classifications WHERE phone = ANY(v_phones);

  IF v_lead_ids IS NOT NULL THEN
    DELETE FROM lead_memory WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM lead_notes WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM lead_documents WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM lead_members WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM lead_checklist WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM interactions WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM notifications WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM action_log WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM follow_up_queue WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM lead_routing_log WHERE lead_id = ANY(v_lead_ids);
    DELETE FROM junior_followup_attempts WHERE lead_id = ANY(v_lead_ids);

    SELECT array_agg(id) INTO v_seq_ids FROM closing_sequences WHERE lead_id = ANY(v_lead_ids);
    IF v_seq_ids IS NOT NULL THEN
      DELETE FROM closing_steps WHERE sequence_id = ANY(v_seq_ids);
      DELETE FROM closing_sequences WHERE id = ANY(v_seq_ids);
    END IF;

    DELETE FROM leads WHERE id = ANY(v_lead_ids);
  END IF;
END $$;
