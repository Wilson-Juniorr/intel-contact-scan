export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_log: {
        Row: {
          action_type: string
          created_at: string
          id: string
          lead_id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_budget_alerts: {
        Row: {
          acao_tomada: string | null
          agent_slug: string
          created_at: string
          gasto_usd: number
          id: string
          limite_usd: number
          pct_consumido: number
          periodo: string
          tipo: string
        }
        Insert: {
          acao_tomada?: string | null
          agent_slug: string
          created_at?: string
          gasto_usd: number
          id?: string
          limite_usd: number
          pct_consumido: number
          periodo: string
          tipo: string
        }
        Update: {
          acao_tomada?: string | null
          agent_slug?: string
          created_at?: string
          gasto_usd?: number
          id?: string
          limite_usd?: number
          pct_consumido?: number
          periodo?: string
          tipo?: string
        }
        Relationships: []
      }
      agent_budgets: {
        Row: {
          agent_slug: string
          ativo: boolean
          created_at: string
          daily_limit_usd: number
          id: string
          monthly_limit_usd: number
          pause_on_exceed: boolean
          updated_at: string
          warn_at_pct: number
        }
        Insert: {
          agent_slug: string
          ativo?: boolean
          created_at?: string
          daily_limit_usd?: number
          id?: string
          monthly_limit_usd?: number
          pause_on_exceed?: boolean
          updated_at?: string
          warn_at_pct?: number
        }
        Update: {
          agent_slug?: string
          ativo?: boolean
          created_at?: string
          daily_limit_usd?: number
          id?: string
          monthly_limit_usd?: number
          pause_on_exceed?: boolean
          updated_at?: string
          warn_at_pct?: number
        }
        Relationships: []
      }
      agent_compliance_log: {
        Row: {
          acao_tomada: string | null
          conversation_id: string | null
          created_at: string
          id: string
          mensagem_corrigida: string | null
          mensagem_original: string
          violacao_detalhe: string | null
          violacao_tipo: string
        }
        Insert: {
          acao_tomada?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          mensagem_corrigida?: string | null
          mensagem_original: string
          violacao_detalhe?: string | null
          violacao_tipo: string
        }
        Update: {
          acao_tomada?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          mensagem_corrigida?: string | null
          mensagem_original?: string
          violacao_detalhe?: string | null
          violacao_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_compliance_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          agent_slug: string
          balao_count: number
          contexto_extra: Json
          conversation_state: Json
          critic_fails: number
          custo_estimado: number
          encerrada_em: string | null
          id: string
          iniciada_em: string
          lead_id: string | null
          mensagens: Json
          status: string
          total_tokens_in: number
          total_tokens_out: number
          transferida_para: string | null
          ultima_atividade: string
          whatsapp_number: string
        }
        Insert: {
          agent_slug: string
          balao_count?: number
          contexto_extra?: Json
          conversation_state?: Json
          critic_fails?: number
          custo_estimado?: number
          encerrada_em?: string | null
          id?: string
          iniciada_em?: string
          lead_id?: string | null
          mensagens?: Json
          status?: string
          total_tokens_in?: number
          total_tokens_out?: number
          transferida_para?: string | null
          ultima_atividade?: string
          whatsapp_number: string
        }
        Update: {
          agent_slug?: string
          balao_count?: number
          contexto_extra?: Json
          conversation_state?: Json
          critic_fails?: number
          custo_estimado?: number
          encerrada_em?: string | null
          id?: string
          iniciada_em?: string
          lead_id?: string | null
          mensagens?: Json
          status?: string
          total_tokens_in?: number
          total_tokens_out?: number
          transferida_para?: string | null
          ultima_atividade?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_critic_log: {
        Row: {
          conversation_id: string | null
          created_at: string
          criterios_falhados: string[] | null
          id: string
          regenerou: boolean
          resposta_final: string | null
          resposta_proposta: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          criterios_falhados?: string[] | null
          id?: string
          regenerou?: boolean
          resposta_final?: string | null
          resposta_proposta: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          criterios_falhados?: string[] | null
          id?: string
          regenerou?: boolean
          resposta_final?: string | null
          resposta_proposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_critic_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_examples: {
        Row: {
          agent_slug: string
          aprovado: boolean
          cliente_tipo: string | null
          created_at: string
          created_by: string | null
          fonte: string | null
          id: string
          observacao: string | null
          qualidade_score: number | null
          scenario: string
          tags: string[] | null
          tom_cliente: string | null
          turns: Json
          updated_at: string
        }
        Insert: {
          agent_slug: string
          aprovado?: boolean
          cliente_tipo?: string | null
          created_at?: string
          created_by?: string | null
          fonte?: string | null
          id?: string
          observacao?: string | null
          qualidade_score?: number | null
          scenario: string
          tags?: string[] | null
          tom_cliente?: string | null
          turns: Json
          updated_at?: string
        }
        Update: {
          agent_slug?: string
          aprovado?: boolean
          cliente_tipo?: string | null
          created_at?: string
          created_by?: string | null
          fonte?: string | null
          id?: string
          observacao?: string | null
          qualidade_score?: number | null
          scenario?: string
          tags?: string[] | null
          tom_cliente?: string | null
          turns?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_handoffs: {
        Row: {
          aprovado_em: string | null
          aprovado_junior: boolean | null
          contexto_transferido: Json | null
          conversation_id: string
          created_at: string
          from_agent: string
          id: string
          motivo: string
          to_agent: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_junior?: boolean | null
          contexto_transferido?: Json | null
          conversation_id: string
          created_at?: string
          from_agent: string
          id?: string
          motivo: string
          to_agent: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_junior?: boolean | null
          contexto_transferido?: Json | null
          conversation_id?: string
          created_at?: string
          from_agent?: string
          id?: string
          motivo?: string
          to_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          conteudo: string
          conversation_id: string
          created_at: string
          direcao: string
          id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          conteudo: string
          conversation_id: string
          created_at?: string
          direcao: string
          id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          conteudo?: string
          conversation_id?: string
          created_at?: string
          direcao?: string
          id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_persona_config: {
        Row: {
          agent_slug: string
          cidade: string | null
          nome_assistente: string | null
          nome_corretor: string | null
          nome_empresa: string | null
          segmento: string | null
          updated_at: string | null
        }
        Insert: {
          agent_slug: string
          cidade?: string | null
          nome_assistente?: string | null
          nome_corretor?: string | null
          nome_empresa?: string | null
          segmento?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_slug?: string
          cidade?: string | null
          nome_assistente?: string | null
          nome_corretor?: string | null
          nome_empresa?: string | null
          segmento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_persona_config_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: true
            referencedRelation: "agents_config"
            referencedColumns: ["slug"]
          },
        ]
      }
      agent_split_log: {
        Row: {
          conversation_id: string | null
          created_at: string
          delays_ms: number[] | null
          id: string
          numero_baloes: number
          resposta_original: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          delays_ms?: number[] | null
          id?: string
          numero_baloes: number
          resposta_original: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          delays_ms?: number[] | null
          id?: string
          numero_baloes?: number
          resposta_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_split_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_techniques: {
        Row: {
          agent_slug: string
          created_at: string
          id: string
          notas: string | null
          prioridade: number
          technique_id: string
        }
        Insert: {
          agent_slug: string
          created_at?: string
          id?: string
          notas?: string | null
          prioridade?: number
          technique_id: string
        }
        Update: {
          agent_slug?: string
          created_at?: string
          id?: string
          notas?: string | null
          prioridade?: number
          technique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_techniques_technique_id_fkey"
            columns: ["technique_id"]
            isOneToOne: false
            referencedRelation: "sales_techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_vendor_profiles: {
        Row: {
          agent_slug: string
          created_at: string
          id: string
          notas: string | null
          peso: number
          vendor_profile_id: string
        }
        Insert: {
          agent_slug: string
          created_at?: string
          id?: string
          notas?: string | null
          peso?: number
          vendor_profile_id: string
        }
        Update: {
          agent_slug?: string
          created_at?: string
          id?: string
          notas?: string | null
          peso?: number
          vendor_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_vendor_profiles_vendor_profile_id_fkey"
            columns: ["vendor_profile_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agents_config: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          max_tokens: number
          modelo: string
          nome: string
          slug: string
          system_prompt: string
          temperature: number
          tipo: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          max_tokens?: number
          modelo?: string
          nome: string
          slug: string
          system_prompt: string
          temperature?: number
          tipo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          max_tokens?: number
          modelo?: string
          nome?: string
          slug?: string
          system_prompt?: string
          temperature?: number
          tipo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      agents_config_history: {
        Row: {
          agent_slug: string
          created_at: string
          criado_por: string | null
          id: string
          modelo: string
          motivo_mudanca: string | null
          system_prompt: string
          versao: number
        }
        Insert: {
          agent_slug: string
          created_at?: string
          criado_por?: string | null
          id?: string
          modelo: string
          motivo_mudanca?: string | null
          system_prompt: string
          versao: number
        }
        Update: {
          agent_slug?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          modelo?: string
          motivo_mudanca?: string | null
          system_prompt?: string
          versao?: number
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          created_at: string
          estimated_cost_usd: number | null
          function_name: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_lead_attributions: {
        Row: {
          campaign_id: string
          conversation_id: string | null
          created_at: string
          detection_confidence: number | null
          detection_method: string
          id: string
          lead_id: string | null
          matched_value: string | null
          qualificou: boolean
          qualificou_em: string | null
        }
        Insert: {
          campaign_id: string
          conversation_id?: string | null
          created_at?: string
          detection_confidence?: number | null
          detection_method: string
          id?: string
          lead_id?: string | null
          matched_value?: string | null
          qualificou?: boolean
          qualificou_em?: string | null
        }
        Update: {
          campaign_id?: string
          conversation_id?: string | null
          created_at?: string
          detection_confidence?: number | null
          detection_method?: string
          id?: string
          lead_id?: string | null
          matched_value?: string | null
          qualificou?: boolean
          qualificou_em?: string | null
        }
        Relationships: []
      }
      campaign_triggers: {
        Row: {
          agent_slug: string
          ativo: boolean
          created_at: string
          descricao: string | null
          detection_count: number
          fuzzy_threshold: number
          id: string
          nome: string
          opening_message: string | null
          preferred_brain_ids: string[] | null
          preferred_technique_ids: string[] | null
          preset_context: Json
          qualified_count: number
          skip_questions: string[] | null
          trigger_phrases: string[] | null
          updated_at: string
          utm_codes: string[] | null
        }
        Insert: {
          agent_slug?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          detection_count?: number
          fuzzy_threshold?: number
          id?: string
          nome: string
          opening_message?: string | null
          preferred_brain_ids?: string[] | null
          preferred_technique_ids?: string[] | null
          preset_context?: Json
          qualified_count?: number
          skip_questions?: string[] | null
          trigger_phrases?: string[] | null
          updated_at?: string
          utm_codes?: string[] | null
        }
        Update: {
          agent_slug?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          detection_count?: number
          fuzzy_threshold?: number
          id?: string
          nome?: string
          opening_message?: string | null
          preferred_brain_ids?: string[] | null
          preferred_technique_ids?: string[] | null
          preset_context?: Json
          qualified_count?: number
          skip_questions?: string[] | null
          trigger_phrases?: string[] | null
          updated_at?: string
          utm_codes?: string[] | null
        }
        Relationships: []
      }
      closing_sequences: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          lead_id: string
          paused_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id: string
          paused_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string
          paused_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_sequences_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_steps: {
        Row: {
          ai_analysis: string | null
          created_at: string
          generated_message: string | null
          id: string
          recommended_due_at: string | null
          scheduled_at: string
          sent_at: string | null
          sequence_id: string
          status: string
          step_number: number
          step_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          created_at?: string
          generated_message?: string | null
          id?: string
          recommended_due_at?: string | null
          scheduled_at: string
          sent_at?: string | null
          sequence_id: string
          status?: string
          step_number: number
          step_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          created_at?: string
          generated_message?: string | null
          id?: string
          recommended_due_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          sequence_id?: string
          status?: string
          step_number?: number
          step_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "closing_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_settings: {
        Row: {
          ativo: boolean
          timezone: string
          updated_at: string | null
          user_id: string
          weekdays_only: boolean
          window_end: string
          window_start: string
        }
        Insert: {
          ativo?: boolean
          timezone?: string
          updated_at?: string | null
          user_id: string
          weekdays_only?: boolean
          window_end?: string
          window_start?: string
        }
        Update: {
          ativo?: boolean
          timezone?: string
          updated_at?: string | null
          user_id?: string
          weekdays_only?: boolean
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      conversation_classifications: {
        Row: {
          categoria: Database["public"]["Enums"]["contact_category"]
          confianca: number
          contact_id: string | null
          created_at: string | null
          id: string
          mensagens_analisadas: number | null
          modelo: string | null
          overridden_by_junior: boolean | null
          phone: string
          razao: string | null
          sinais: string[] | null
          user_id: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["contact_category"]
          confianca: number
          contact_id?: string | null
          created_at?: string | null
          id?: string
          mensagens_analisadas?: number | null
          modelo?: string | null
          overridden_by_junior?: boolean | null
          phone: string
          razao?: string | null
          sinais?: string[] | null
          user_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["contact_category"]
          confianca?: number
          contact_id?: string | null
          created_at?: string | null
          id?: string
          mensagens_analisadas?: number | null
          modelo?: string | null
          overridden_by_junior?: boolean | null
          phone?: string
          razao?: string | null
          sinais?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_classifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_queue: {
        Row: {
          attempt_number: number
          created_at: string
          id: string
          lead_id: string
          max_attempts: number
          message_content: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          id?: string
          lead_id: string
          max_attempts?: number
          message_content?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          id?: string
          lead_id?: string
          max_attempts?: number
          message_content?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          lead_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          lead_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          lead_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_checklist: {
        Row: {
          completed: boolean
          created_at: string
          document_id: string | null
          id: string
          item_name: string
          lead_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          document_id?: string | null
          id?: string
          item_name: string
          lead_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          document_id?: string | null
          id?: string
          item_name?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_checklist_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "lead_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_checklist_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_distribution_rules: {
        Row: {
          agente_alvo: string | null
          agentes_pool: string[] | null
          ativo: boolean
          created_at: string
          descricao: string | null
          dias_semana: number[] | null
          filtro_estagio: string[] | null
          filtro_origem: string[] | null
          filtro_palavras_chave: string[] | null
          filtro_tipo: string[] | null
          fora_horario_acao: string
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          max_leads_dia: number | null
          modo_distribuicao: string
          nome: string
          prioridade: number
          updated_at: string
        }
        Insert: {
          agente_alvo?: string | null
          agentes_pool?: string[] | null
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_semana?: number[] | null
          filtro_estagio?: string[] | null
          filtro_origem?: string[] | null
          filtro_palavras_chave?: string[] | null
          filtro_tipo?: string[] | null
          fora_horario_acao?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          max_leads_dia?: number | null
          modo_distribuicao?: string
          nome: string
          prioridade?: number
          updated_at?: string
        }
        Update: {
          agente_alvo?: string | null
          agentes_pool?: string[] | null
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_semana?: number[] | null
          filtro_estagio?: string[] | null
          filtro_origem?: string[] | null
          filtro_palavras_chave?: string[] | null
          filtro_tipo?: string[] | null
          fora_horario_acao?: string
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          max_leads_dia?: number | null
          modo_distribuicao?: string
          nome?: string
          prioridade?: number
          updated_at?: string
        }
        Relationships: []
      }
      lead_distribution_state: {
        Row: {
          contador_dia: number
          data_contador: string
          rule_id: string
          ultimo_indice: number
          updated_at: string
        }
        Insert: {
          contador_dia?: number
          data_contador?: string
          rule_id: string
          ultimo_indice?: number
          updated_at?: string
        }
        Update: {
          contador_dia?: number
          data_contador?: string
          rule_id?: string
          ultimo_indice?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_state_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: true
            referencedRelation: "lead_distribution_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_documents: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          lead_id: string
          member_id: string | null
          ocr_text: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          lead_id: string
          member_id?: string | null
          ocr_text?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          lead_id?: string
          member_id?: string | null
          ocr_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "lead_members"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_members: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          lead_id: string
          name: string
          phone: string | null
          role: string
          updated_at: string
          user_id: string
          vinculo: string | null
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id: string
          name: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id: string
          vinculo?: string | null
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string
          vinculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_memory: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          structured_json: Json | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          structured_json?: Json | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          structured_json?: Json | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          category: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          lead_id: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_routing_log: {
        Row: {
          agente_escolhido: string | null
          contexto: Json | null
          created_at: string
          id: string
          lead_id: string | null
          motivo: string | null
          rule_id: string | null
          rule_nome: string | null
        }
        Insert: {
          agente_escolhido?: string | null
          contexto?: Json | null
          created_at?: string
          id?: string
          lead_id?: string | null
          motivo?: string | null
          rule_id?: string | null
          rule_nome?: string | null
        }
        Update: {
          agente_escolhido?: string | null
          contexto?: Json | null
          created_at?: string
          id?: string
          lead_id?: string | null
          motivo?: string | null
          rule_id?: string | null
          rule_nome?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          approved_value: number | null
          assumed_at: string | null
          assumed_by: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          in_manual_conversation: boolean
          last_contact_at: string | null
          last_quote_sent_at: string | null
          lives: number | null
          lost_reason: string | null
          name: string
          notes: string | null
          operator: string | null
          org_id: string | null
          phone: string
          plan_type: string | null
          quote_min_value: number | null
          quote_operadora: string | null
          quote_plan_name: string | null
          stage: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_value?: number | null
          assumed_at?: string | null
          assumed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          in_manual_conversation?: boolean
          last_contact_at?: string | null
          last_quote_sent_at?: string | null
          lives?: number | null
          lost_reason?: string | null
          name: string
          notes?: string | null
          operator?: string | null
          org_id?: string | null
          phone: string
          plan_type?: string | null
          quote_min_value?: number | null
          quote_operadora?: string | null
          quote_plan_name?: string | null
          stage?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_value?: number | null
          assumed_at?: string | null
          assumed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          in_manual_conversation?: boolean
          last_contact_at?: string | null
          last_quote_sent_at?: string | null
          lives?: number | null
          lost_reason?: string | null
          name?: string
          notes?: string | null
          operator?: string | null
          org_id?: string | null
          phone?: string
          plan_type?: string | null
          quote_min_value?: number | null
          quote_operadora?: string | null
          quote_plan_name?: string | null
          stage?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mente_usage_log: {
        Row: {
          agent_slug: string
          campaign_id: string | null
          cerebro_declarado: string | null
          cerebro_id: string | null
          conversation_id: string | null
          created_at: string
          evidencia_trecho: string | null
          id: string
          resposta_final: string | null
          semantic_approved: boolean | null
          semantic_confidence: number | null
          semantic_reason: string | null
          tecnica_declarada: string | null
          tecnica_id: string | null
          tom_cliente: string | null
          turn_number: number
          ultima_msg_cliente: string | null
        }
        Insert: {
          agent_slug: string
          campaign_id?: string | null
          cerebro_declarado?: string | null
          cerebro_id?: string | null
          conversation_id?: string | null
          created_at?: string
          evidencia_trecho?: string | null
          id?: string
          resposta_final?: string | null
          semantic_approved?: boolean | null
          semantic_confidence?: number | null
          semantic_reason?: string | null
          tecnica_declarada?: string | null
          tecnica_id?: string | null
          tom_cliente?: string | null
          turn_number?: number
          ultima_msg_cliente?: string | null
        }
        Update: {
          agent_slug?: string
          campaign_id?: string | null
          cerebro_declarado?: string | null
          cerebro_id?: string | null
          conversation_id?: string | null
          created_at?: string
          evidencia_trecho?: string | null
          id?: string
          resposta_final?: string | null
          semantic_approved?: boolean | null
          semantic_confidence?: number | null
          semantic_reason?: string | null
          tecnica_declarada?: string | null
          tecnica_id?: string | null
          tom_cliente?: string | null
          turn_number?: number
          ultima_msg_cliente?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          lead_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lead_id?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          completed: boolean
          created_at: string
          date: string
          deleted_at: string | null
          description: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          date: string
          deleted_at?: string | null
          description: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      rewarming_campaigns: {
        Row: {
          agente_slug: string
          ativo: boolean
          created_at: string
          descricao: string | null
          dias_inativo_min: number
          dias_semana: number[] | null
          estagios_alvo: string[] | null
          excluir_perdidos: boolean
          filtro_tipo: string[] | null
          horario_envio: string
          id: string
          intervalo_dias: number
          max_tentativas: number
          mensagens_template: Json
          nome: string
          objetivo: string | null
          tom: string | null
          updated_at: string
        }
        Insert: {
          agente_slug: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_inativo_min?: number
          dias_semana?: number[] | null
          estagios_alvo?: string[] | null
          excluir_perdidos?: boolean
          filtro_tipo?: string[] | null
          horario_envio?: string
          id?: string
          intervalo_dias?: number
          max_tentativas?: number
          mensagens_template?: Json
          nome: string
          objetivo?: string | null
          tom?: string | null
          updated_at?: string
        }
        Update: {
          agente_slug?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_inativo_min?: number
          dias_semana?: number[] | null
          estagios_alvo?: string[] | null
          excluir_perdidos?: boolean
          filtro_tipo?: string[] | null
          horario_envio?: string
          id?: string
          intervalo_dias?: number
          max_tentativas?: number
          mensagens_template?: Json
          nome?: string
          objetivo?: string | null
          tom?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rewarming_log: {
        Row: {
          created_at: string
          erro: string | null
          id: string
          lead_id: string | null
          mensagem: string | null
          pool_id: string | null
          status: string
          tentativa: number
          user_id: string
        }
        Insert: {
          created_at?: string
          erro?: string | null
          id?: string
          lead_id?: string | null
          mensagem?: string | null
          pool_id?: string | null
          status?: string
          tentativa: number
          user_id: string
        }
        Update: {
          created_at?: string
          erro?: string | null
          id?: string
          lead_id?: string | null
          mensagem?: string | null
          pool_id?: string | null
          status?: string
          tentativa?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewarming_log_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "rewarming_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      rewarming_pool: {
        Row: {
          campaign_id: string
          enrolled_at: string
          id: string
          lead_id: string
          motivo_saida: string | null
          proxima_execucao: string
          status: string
          tentativas_feitas: number
          ultima_resposta_em: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          enrolled_at?: string
          id?: string
          lead_id: string
          motivo_saida?: string | null
          proxima_execucao?: string
          status?: string
          tentativas_feitas?: number
          ultima_resposta_em?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          enrolled_at?: string
          id?: string
          lead_id?: string
          motivo_saida?: string | null
          proxima_execucao?: string
          status?: string
          tentativas_feitas?: number
          ultima_resposta_em?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewarming_pool_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "rewarming_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      router_decisions: {
        Row: {
          agent_escolhido: string
          contexto_avaliado: Json | null
          conversation_id: string | null
          created_at: string
          id: string
          message_in: string | null
          motivo: string | null
        }
        Insert: {
          agent_escolhido: string
          contexto_avaliado?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_in?: string | null
          motivo?: string | null
        }
        Update: {
          agent_escolhido?: string
          contexto_avaliado?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_in?: string | null
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "router_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_techniques: {
        Row: {
          ativo: boolean
          categoria: string
          como_aplicar: string
          cor_hex: string | null
          created_at: string
          descricao: string | null
          exemplos: Json
          fonte_autor: string | null
          gatilho_uso: string | null
          icone: string | null
          id: string
          is_default: boolean
          nivel_dificuldade: number
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          como_aplicar: string
          cor_hex?: string | null
          created_at?: string
          descricao?: string | null
          exemplos?: Json
          fonte_autor?: string | null
          gatilho_uso?: string | null
          icone?: string | null
          id?: string
          is_default?: boolean
          nivel_dificuldade?: number
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          como_aplicar?: string
          cor_hex?: string | null
          created_at?: string
          descricao?: string | null
          exemplos?: Json
          fonte_autor?: string | null
          gatilho_uso?: string | null
          icone?: string | null
          id?: string
          is_default?: boolean
          nivel_dificuldade?: number
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          agent_slug: string | null
          created_at: string | null
          error: string | null
          id: string
          lead_id: string | null
          message: string
          phone: string
          send_at: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_slug?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message: string
          phone: string
          send_at: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_slug?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message?: string
          phone?: string
          send_at?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_at: string | null
          id: string
          lead_id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_enabled: boolean | null
          created_at: string
          daily_token_limit: number | null
          display_name: string | null
          id: string
          monthly_token_limit: number | null
          notification_browser: boolean | null
          notification_sound: boolean | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_enabled?: boolean | null
          created_at?: string
          daily_token_limit?: number | null
          display_name?: string | null
          id?: string
          monthly_token_limit?: number | null
          notification_browser?: boolean | null
          notification_sound?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_enabled?: boolean | null
          created_at?: string
          daily_token_limit?: number | null
          display_name?: string | null
          id?: string
          monthly_token_limit?: number | null
          notification_browser?: boolean | null
          notification_sound?: boolean | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendor_profiles: {
        Row: {
          ativo: boolean
          cor_hex: string | null
          created_at: string
          descricao: string | null
          estilo: string | null
          evitar_quando: string | null
          exemplos_frases: Json
          icone: string | null
          id: string
          is_default: boolean
          nome: string
          origem: string | null
          principios: string | null
          quando_usar: string | null
          slug: string
          tags: string[]
          tom: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor_hex?: string | null
          created_at?: string
          descricao?: string | null
          estilo?: string | null
          evitar_quando?: string | null
          exemplos_frases?: Json
          icone?: string | null
          id?: string
          is_default?: boolean
          nome: string
          origem?: string | null
          principios?: string | null
          quando_usar?: string | null
          slug: string
          tags?: string[]
          tom?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor_hex?: string | null
          created_at?: string
          descricao?: string | null
          estilo?: string | null
          evitar_quando?: string | null
          exemplos_frases?: Json
          icone?: string | null
          id?: string
          is_default?: boolean
          nome?: string
          origem?: string | null
          principios?: string | null
          quando_usar?: string | null
          slug?: string
          tags?: string[]
          tom?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          category: Database["public"]["Enums"]["contact_category"] | null
          category_classified_at: string | null
          category_confidence: number | null
          category_source: string | null
          contact_name: string | null
          created_at: string
          id: string
          is_personal: boolean
          lead_id: string | null
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["contact_category"] | null
          category_classified_at?: string | null
          category_confidence?: number | null
          category_source?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_personal?: boolean
          lead_id?: string | null
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["contact_category"] | null
          category_classified_at?: string | null
          category_confidence?: number | null
          category_source?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_personal?: boolean
          lead_id?: string | null
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          business_relevance_score: number | null
          classification_confidence: string | null
          contact_name: string | null
          content: string | null
          created_at: string
          direction: string
          extracted_entities: Json | null
          extracted_semantic_summary: string | null
          extracted_text: string | null
          id: string
          intent: string | null
          lead_id: string | null
          media_storage_path: string | null
          media_url: string | null
          message_category: string | null
          message_type: string
          phone: string
          processing_error: string | null
          processing_status: string | null
          status: string | null
          uazapi_message_id: string | null
          user_id: string
        }
        Insert: {
          business_relevance_score?: number | null
          classification_confidence?: string | null
          contact_name?: string | null
          content?: string | null
          created_at?: string
          direction: string
          extracted_entities?: Json | null
          extracted_semantic_summary?: string | null
          extracted_text?: string | null
          id?: string
          intent?: string | null
          lead_id?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_category?: string | null
          message_type?: string
          phone: string
          processing_error?: string | null
          processing_status?: string | null
          status?: string | null
          uazapi_message_id?: string | null
          user_id: string
        }
        Update: {
          business_relevance_score?: number | null
          classification_confidence?: string | null
          contact_name?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          extracted_entities?: Json | null
          extracted_semantic_summary?: string | null
          extracted_text?: string | null
          id?: string
          intent?: string | null
          lead_id?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_category?: string | null
          message_type?: string
          phone?: string
          processing_error?: string | null
          processing_status?: string | null
          status?: string | null
          uazapi_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "corretor" | "viewer"
      contact_category:
        | "lead_novo"
        | "lead_retorno"
        | "personal"
        | "team"
        | "partner"
        | "vendor"
        | "spam"
        | "ambiguo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "corretor", "viewer"],
      contact_category: [
        "lead_novo",
        "lead_retorno",
        "personal",
        "team",
        "partner",
        "vendor",
        "spam",
        "ambiguo",
      ],
    },
  },
} as const
