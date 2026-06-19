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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      backlog_snapshots: {
        Row: {
          created_at: string
          detalhes: Json
          id: string
          indicador: string
          iso_week: string
          snapshot_date: string
          tributacao: string | null
          unidade: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          detalhes?: Json
          id?: string
          indicador: string
          iso_week: string
          snapshot_date: string
          tributacao?: string | null
          unidade?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          detalhes?: Json
          id?: string
          indicador?: string
          iso_week?: string
          snapshot_date?: string
          tributacao?: string | null
          unidade?: string | null
          valor?: number
        }
        Relationships: []
      }
      briefing_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_alerts: Json
          auto_summary: string | null
          created_at: string
          custom_alerts: Json
          custom_focus: Json
          custom_summary: string | null
          data_referencia: string
          generated_at: string
          id: string
          iso_week: string
          notes_internas: string | null
          pptx_storage_path: string | null
          recipients_snapshot: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_alerts?: Json
          auto_summary?: string | null
          created_at?: string
          custom_alerts?: Json
          custom_focus?: Json
          custom_summary?: string | null
          data_referencia: string
          generated_at?: string
          id?: string
          iso_week: string
          notes_internas?: string | null
          pptx_storage_path?: string | null
          recipients_snapshot?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_alerts?: Json
          auto_summary?: string | null
          created_at?: string
          custom_alerts?: Json
          custom_focus?: Json
          custom_summary?: string | null
          data_referencia?: string
          generated_at?: string
          id?: string
          iso_week?: string
          notes_internas?: string | null
          pptx_storage_path?: string | null
          recipients_snapshot?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          email: string
          id: string
          is_default: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          email: string
          id?: string
          is_default?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          is_default?: boolean
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          cnpj: string
          competencia_inicio: string
          created_at: string
          created_by: string
          data_fim_contrato: string | null
          gclick_cliente_id: string | null
          id: string
          motivo_distrato: string | null
          obrigatoriedade_ecd: boolean
          perfil: string
          razao_social: string
          tributacao: string
          unidade: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          competencia_inicio: string
          created_at?: string
          created_by: string
          data_fim_contrato?: string | null
          gclick_cliente_id?: string | null
          id?: string
          motivo_distrato?: string | null
          obrigatoriedade_ecd?: boolean
          perfil?: string
          razao_social: string
          tributacao?: string
          unidade?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          competencia_inicio?: string
          created_at?: string
          created_by?: string
          data_fim_contrato?: string | null
          gclick_cliente_id?: string | null
          id?: string
          motivo_distrato?: string | null
          obrigatoriedade_ecd?: boolean
          perfil?: string
          razao_social?: string
          tributacao?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      closing_attachments: {
        Row: {
          client_name: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          updated_at: string
          uploaded_by: string
          year: string
        }
        Insert: {
          client_name: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          updated_at?: string
          uploaded_by: string
          year: string
        }
        Update: {
          client_name?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          updated_at?: string
          uploaded_by?: string
          year?: string
        }
        Relationships: []
      }
      closing_deliverables: {
        Row: {
          approved: boolean
          arquivo_path: string
          client_id: string
          competencia: string
          created_at: string
          file_size_bytes: number | null
          gerado_em: string
          gerado_por: string | null
          id: string
          origem: string
          review_submission_id: string | null
          tipo_demonstrativo: string
          titulo: string | null
          updated_at: string
          versao: number
        }
        Insert: {
          approved?: boolean
          arquivo_path: string
          client_id: string
          competencia: string
          created_at?: string
          file_size_bytes?: number | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          origem?: string
          review_submission_id?: string | null
          tipo_demonstrativo: string
          titulo?: string | null
          updated_at?: string
          versao?: number
        }
        Update: {
          approved?: boolean
          arquivo_path?: string
          client_id?: string
          competencia?: string
          created_at?: string
          file_size_bytes?: number | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          origem?: string
          review_submission_id?: string | null
          tipo_demonstrativo?: string
          titulo?: string | null
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "closing_deliverables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_deliverables_review_submission_id_fkey"
            columns: ["review_submission_id"]
            isOneToOne: false
            referencedRelation: "review_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_status_entries: {
        Row: {
          client_name: string
          created_at: string
          demand_type: string
          filled_by: string
          id: string
          month: string
          status: string
          updated_at: string
          year: string
        }
        Insert: {
          client_name: string
          created_at?: string
          demand_type: string
          filled_by: string
          id?: string
          month: string
          status?: string
          updated_at?: string
          year: string
        }
        Update: {
          client_name?: string
          created_at?: string
          demand_type?: string
          filled_by?: string
          id?: string
          month?: string
          status?: string
          updated_at?: string
          year?: string
        }
        Relationships: []
      }
      demands: {
        Row: {
          assignee: string
          client: string
          client_deadline: string
          competencias: string[]
          completed_at: string | null
          complexity: string
          created_at: string
          created_by: string
          description: string
          id: string
          internal_deadline: string
          is_legacy: boolean
          notes: string
          priority: string
          status: string
          time_spent_minutes: number
          types: string[]
          updated_at: string
          weight: number
        }
        Insert: {
          assignee: string
          client: string
          client_deadline: string
          competencias: string[]
          completed_at?: string | null
          complexity?: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          internal_deadline: string
          is_legacy?: boolean
          notes?: string
          priority?: string
          status?: string
          time_spent_minutes?: number
          types: string[]
          updated_at?: string
          weight?: number
        }
        Update: {
          assignee?: string
          client?: string
          client_deadline?: string
          competencias?: string[]
          completed_at?: string | null
          complexity?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          internal_deadline?: string
          is_legacy?: boolean
          notes?: string
          priority?: string
          status?: string
          time_spent_minutes?: number
          types?: string[]
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      gclick_credentials: {
        Row: {
          assunto_template: string
          client_id_secret_name: string
          client_secret_secret_name: string
          created_at: string
          enabled: boolean
          id: string
          sistema_id: string
          tag_por_setor: Json
          unidade: string
          updated_at: string
          usuario: string
        }
        Insert: {
          assunto_template?: string
          client_id_secret_name: string
          client_secret_secret_name: string
          created_at?: string
          enabled?: boolean
          id?: string
          sistema_id?: string
          tag_por_setor?: Json
          unidade: string
          updated_at?: string
          usuario?: string
        }
        Update: {
          assunto_template?: string
          client_id_secret_name?: string
          client_secret_secret_name?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sistema_id?: string
          tag_por_setor?: Json
          unidade?: string
          updated_at?: string
          usuario?: string
        }
        Relationships: []
      }
      gestao_metas: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          indicador: string
          tipo_meta: string
          unidade: string | null
          updated_at: string
          valor_meta: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicador: string
          tipo_meta: string
          unidade?: string | null
          updated_at?: string
          valor_meta: number
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          indicador?: string
          tipo_meta?: string
          unidade?: string | null
          updated_at?: string
          valor_meta?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          escopo: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          descricao: string
          escopo?: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          escopo?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          service: string
          unidade: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          service: string
          unidade: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          service?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      nibo_document_alerts: {
        Row: {
          client_cnpj: string
          client_name: string
          created_at: string
          document_count: number
          id: string
          last_filed_date: string | null
          month: string
          nibo_status: string
          synced_at: string
          updated_at: string
          year: string
        }
        Insert: {
          client_cnpj: string
          client_name: string
          created_at?: string
          document_count?: number
          id?: string
          last_filed_date?: string | null
          month: string
          nibo_status?: string
          synced_at?: string
          updated_at?: string
          year: string
        }
        Update: {
          client_cnpj?: string
          client_name?: string
          created_at?: string
          document_count?: number
          id?: string
          last_filed_date?: string | null
          month?: string
          nibo_status?: string
          synced_at?: string
          updated_at?: string
          year?: string
        }
        Relationships: []
      }
      pendencies: {
        Row: {
          client_id: string
          client_submit_count: number
          competencia: string
          contato_cliente_email: string | null
          contato_cliente_nome: string | null
          contato_cliente_telefone: string | null
          created_at: string
          created_by: string
          demand_type: string | null
          descricao: string
          documento_solicitado: string | null
          escalated_at: string | null
          followup_cadence_days: number
          followup_paused: boolean
          followup_paused_reason: string | null
          followup_paused_until: string | null
          gclick_status: string | null
          gclick_sync_error: string | null
          gclick_synced_at: string | null
          gclick_task_id: string | null
          gclick_task_url: string | null
          id: string
          import_batch_id: string | null
          last_client_submit_at: string | null
          next_followup_at: string | null
          prazo_resposta: string | null
          prioridade: string
          resolution_notes: string | null
          resolved_at: string | null
          responsavel_id: string
          setor_responsavel: string | null
          status: string
          tipo: string
          total_contatos: number
          ultimo_contato_em: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_submit_count?: number
          competencia: string
          contato_cliente_email?: string | null
          contato_cliente_nome?: string | null
          contato_cliente_telefone?: string | null
          created_at?: string
          created_by: string
          demand_type?: string | null
          descricao: string
          documento_solicitado?: string | null
          escalated_at?: string | null
          followup_cadence_days?: number
          followup_paused?: boolean
          followup_paused_reason?: string | null
          followup_paused_until?: string | null
          gclick_status?: string | null
          gclick_sync_error?: string | null
          gclick_synced_at?: string | null
          gclick_task_id?: string | null
          gclick_task_url?: string | null
          id?: string
          import_batch_id?: string | null
          last_client_submit_at?: string | null
          next_followup_at?: string | null
          prazo_resposta?: string | null
          prioridade?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          responsavel_id: string
          setor_responsavel?: string | null
          status?: string
          tipo: string
          total_contatos?: number
          ultimo_contato_em?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_submit_count?: number
          competencia?: string
          contato_cliente_email?: string | null
          contato_cliente_nome?: string | null
          contato_cliente_telefone?: string | null
          created_at?: string
          created_by?: string
          demand_type?: string | null
          descricao?: string
          documento_solicitado?: string | null
          escalated_at?: string | null
          followup_cadence_days?: number
          followup_paused?: boolean
          followup_paused_reason?: string | null
          followup_paused_until?: string | null
          gclick_status?: string | null
          gclick_sync_error?: string | null
          gclick_synced_at?: string | null
          gclick_task_id?: string | null
          gclick_task_url?: string | null
          id?: string
          import_batch_id?: string | null
          last_client_submit_at?: string | null
          next_followup_at?: string | null
          prazo_resposta?: string | null
          prioridade?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          responsavel_id?: string
          setor_responsavel?: string | null
          status?: string
          tipo?: string
          total_contatos?: number
          ultimo_contato_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pendencies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencies_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "pendency_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      pendency_access_tokens: {
        Row: {
          access_code_hash: string
          access_count: number
          created_at: string
          created_by: string
          expires_at: string
          id: string
          last_accessed_at: string | null
          pendency_id: string
          revoked: boolean
          token: string
          updated_at: string
        }
        Insert: {
          access_code_hash: string
          access_count?: number
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          last_accessed_at?: string | null
          pendency_id: string
          revoked?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          access_code_hash?: string
          access_count?: number
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          pendency_id?: string
          revoked?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      pendency_communications: {
        Row: {
          canal: string
          created_at: string
          descricao: string
          id: string
          pendency_id: string
          realizado_em: string
          realizado_por: string
          resposta_descricao: string | null
          resposta_recebida: boolean
        }
        Insert: {
          canal: string
          created_at?: string
          descricao: string
          id?: string
          pendency_id: string
          realizado_em?: string
          realizado_por: string
          resposta_descricao?: string | null
          resposta_recebida?: boolean
        }
        Update: {
          canal?: string
          created_at?: string
          descricao?: string
          id?: string
          pendency_id?: string
          realizado_em?: string
          realizado_por?: string
          resposta_descricao?: string | null
          resposta_recebida?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pendency_communications_pendency_id_fkey"
            columns: ["pendency_id"]
            isOneToOne: false
            referencedRelation: "pendencies"
            referencedColumns: ["id"]
          },
        ]
      }
      pendency_import_batches: {
        Row: {
          arquivo_nome: string | null
          arquivo_path: string | null
          client_id: string
          competencia: string
          created_at: string
          created_by: string
          id: string
          template_type: string
          total_criadas: number
          total_linhas: number
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          client_id: string
          competencia: string
          created_at?: string
          created_by: string
          id?: string
          template_type: string
          total_criadas?: number
          total_linhas?: number
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          client_id?: string
          competencia?: string
          created_at?: string
          created_by?: string
          id?: string
          template_type?: string
          total_criadas?: number
          total_linhas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pendency_import_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pendency_item_comments: {
        Row: {
          created_at: string
          id: string
          item_id: string
          pendency_id: string
          sender_nome: string | null
          sender_user_id: string | null
          texto: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          pendency_id: string
          sender_nome?: string | null
          sender_user_id?: string | null
          texto: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          pendency_id?: string
          sender_nome?: string | null
          sender_user_id?: string | null
          texto?: string
        }
        Relationships: []
      }
      pendency_item_responses: {
        Row: {
          arquivo_nome: string | null
          arquivo_path: string | null
          arquivo_tamanho: number | null
          created_at: string
          id: string
          item_id: string
          pendency_id: string
          sender_nome: string | null
          sender_user_id: string | null
          texto: string | null
          tipo: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_tamanho?: number | null
          created_at?: string
          id?: string
          item_id: string
          pendency_id: string
          sender_nome?: string | null
          sender_user_id?: string | null
          texto?: string | null
          tipo: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_tamanho?: number | null
          created_at?: string
          id?: string
          item_id?: string
          pendency_id?: string
          sender_nome?: string | null
          sender_user_id?: string | null
          texto?: string | null
          tipo?: string
        }
        Relationships: []
      }
      pendency_items: {
        Row: {
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          ordem: number
          pendency_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          ordem?: number
          pendency_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          ordem?: number
          pendency_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      plannings: {
        Row: {
          assignee: string
          client: string
          competencias: string[]
          created_at: string
          created_by: string
          description: string
          id: string
          internal_deadline: string
          notes: string
          priority: string
          recurrence: string
          recurrence_child_id: string | null
          recurrence_parent_id: string | null
          status: string
          types: string[]
          updated_at: string
        }
        Insert: {
          assignee: string
          client: string
          competencias: string[]
          created_at?: string
          created_by: string
          description?: string
          id?: string
          internal_deadline: string
          notes?: string
          priority?: string
          recurrence?: string
          recurrence_child_id?: string | null
          recurrence_parent_id?: string | null
          status?: string
          types: string[]
          updated_at?: string
        }
        Update: {
          assignee?: string
          client?: string
          competencias?: string[]
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          internal_deadline?: string
          notes?: string
          priority?: string
          recurrence?: string
          recurrence_child_id?: string | null
          recurrence_parent_id?: string | null
          status?: string
          types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plannings_recurrence_child_id_fkey"
            columns: ["recurrence_child_id"]
            isOneToOne: false
            referencedRelation: "plannings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plannings_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "plannings"
            referencedColumns: ["id"]
          },
        ]
      }
      productivity_snapshots: {
        Row: {
          ano: number
          calculated_at: string | null
          capacity_minutes: number
          composite_score: number
          created_at: string
          details: Json
          effort_points: number
          effort_score_pct: number
          id: string
          mes: number
          quality_score_pct: number | null
          submissions_approved_first: number
          submissions_total: number
          tasks_completed_count: number
          tasks_on_time_count: number
          timeliness_score_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano: number
          calculated_at?: string | null
          capacity_minutes?: number
          composite_score?: number
          created_at?: string
          details?: Json
          effort_points?: number
          effort_score_pct?: number
          id?: string
          mes: number
          quality_score_pct?: number | null
          submissions_approved_first?: number
          submissions_total?: number
          tasks_completed_count?: number
          tasks_on_time_count?: number
          timeliness_score_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: number
          calculated_at?: string | null
          capacity_minutes?: number
          composite_score?: number
          created_at?: string
          details?: Json
          effort_points?: number
          effort_score_pct?: number
          id?: string
          mes?: number
          quality_score_pct?: number | null
          submissions_approved_first?: number
          submissions_total?: number
          tasks_completed_count?: number
          tasks_on_time_count?: number
          timeliness_score_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          can_review: boolean
          created_at: string
          display_name: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          can_review?: boolean
          created_at?: string
          display_name: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          can_review?: boolean
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_apontamentos: {
        Row: {
          conta_referencia: string | null
          created_at: string
          created_by: string
          deliverable_id: string
          descricao: string
          id: string
          resolved: boolean
          submission_id: string
          updated_at: string
        }
        Insert: {
          conta_referencia?: string | null
          created_at?: string
          created_by: string
          deliverable_id: string
          descricao: string
          id?: string
          resolved?: boolean
          submission_id: string
          updated_at?: string
        }
        Update: {
          conta_referencia?: string | null
          created_at?: string
          created_by?: string
          deliverable_id?: string
          descricao?: string
          id?: string
          resolved?: boolean
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_apontamentos_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "closing_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_apontamentos_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "review_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_submissions: {
        Row: {
          client_id: string
          competencia: string
          created_at: string
          cycle_number: number
          id: string
          review_started_at: string | null
          review_summary: string | null
          reviewed_at: string | null
          reviewer_assigned_at: string
          reviewer_id: string
          reviewer_reassigned_count: number
          status: string
          submitted_at: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          client_id: string
          competencia: string
          created_at?: string
          cycle_number?: number
          id?: string
          review_started_at?: string | null
          review_summary?: string | null
          reviewed_at?: string | null
          reviewer_assigned_at?: string
          reviewer_id: string
          reviewer_reassigned_count?: number
          status?: string
          submitted_at?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          competencia?: string
          created_at?: string
          cycle_number?: number
          id?: string
          review_started_at?: string | null
          review_summary?: string | null
          reviewed_at?: string | null
          reviewer_assigned_at?: string
          reviewer_id?: string
          reviewer_reassigned_count?: number
          status?: string
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      team_availability: {
        Row: {
          created_at: string
          created_by: string
          data_fim: string
          data_inicio: string
          descricao: string | null
          horas_dia: number
          id: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_fim: string
          data_inicio: string
          descricao?: string | null
          horas_dia?: number
          id?: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          horas_dia?: number
          id?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      backlog_drilldown: {
        Args: {
          p_demand_type: string
          p_only_current_year?: boolean
          p_tributacao?: string
          p_unidade?: string
        }
        Returns: {
          client_name: string
          demand_type: string
          month: number
          tributacao: string
          unidade: string
          year: number
        }[]
      }
      backlog_overview: {
        Args: { p_tributacao?: string; p_unidade?: string }
        Returns: Json
      }
      business_days_in_month: {
        Args: { p_ano: number; p_mes: number }
        Returns: number
      }
      can_view_submission: {
        Args: { p_submission_id: string }
        Returns: boolean
      }
      expected_pending_cells: {
        Args: {
          p_demand_types?: string[]
          p_tributacao?: string
          p_unidade?: string
        }
        Returns: {
          client_id: string
          client_name: string
          demand_type: string
          month: number
          tributacao: string
          unidade: string
          year: number
        }[]
      }
      generate_backlog_snapshot: { Args: { p_force?: boolean }; Returns: Json }
      has_action_permission: {
        Args: { _action: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_coordenacao: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
