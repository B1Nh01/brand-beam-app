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
      activity_log: {
        Row: {
          action: string
          actor: string | null
          client_id: string | null
          created_at: string
          id: string
          post_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_files: {
        Row: {
          client_id: string
          created_at: string
          folder_id: string | null
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          visible_in_portal: boolean
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          folder_id?: string | null
          id?: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          visible_in_portal?: boolean
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          mime_type?: string
          name?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          visible_in_portal?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "brand_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_folders: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          visible_in_portal: boolean
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          visible_in_portal?: boolean
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          visible_in_portal?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_folders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_modules: {
        Row: {
          client_id: string
          content: Json
          created_at: string
          id: string
          title: string
          type: Database["public"]["Enums"]["brand_module_type"]
          updated_at: string
          visible_in_portal: boolean
          workspace_id: string
        }
        Insert: {
          client_id: string
          content?: Json
          created_at?: string
          id?: string
          title: string
          type: Database["public"]["Enums"]["brand_module_type"]
          updated_at?: string
          visible_in_portal?: boolean
          workspace_id: string
        }
        Update: {
          client_id?: string
          content?: Json
          created_at?: string
          id?: string
          title?: string
          type?: Database["public"]["Enums"]["brand_module_type"]
          updated_at?: string
          visible_in_portal?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_modules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_modules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          avatar_url: string | null
          brand_color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          instagram_handle: string | null
          monthly_fee: number | null
          name: string
          portal_enabled: boolean
          portal_token: string
          status: Database["public"]["Enums"]["client_status"]
          tiktok_handle: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          brand_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instagram_handle?: string | null
          monthly_fee?: number | null
          name: string
          portal_enabled?: boolean
          portal_token?: string
          status?: Database["public"]["Enums"]["client_status"]
          tiktok_handle?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          brand_color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instagram_handle?: string | null
          monthly_fee?: number | null
          name?: string
          portal_enabled?: boolean
          portal_token?: string
          status?: Database["public"]["Enums"]["client_status"]
          tiktok_handle?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["fin_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_expenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_revenues: {
        Row: {
          amount: number
          category: string
          client_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          is_recurring: boolean
          notes: string | null
          paid_at: string | null
          recurrence_day: number | null
          status: Database["public"]["Enums"]["fin_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category?: string
          client_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          paid_at?: string | null
          recurrence_day?: number | null
          status?: Database["public"]["Enums"]["fin_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          paid_at?: string | null
          recurrence_day?: number | null
          status?: Database["public"]["Enums"]["fin_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_revenues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_revenues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_settings: {
        Row: {
          auto_generate_revenues: boolean
          created_at: string
          currency: string
          default_revenue_category: string
          id: string
          revenue_generation_day: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_generate_revenues?: boolean
          created_at?: string
          currency?: string
          default_revenue_category?: string
          id?: string
          revenue_generation_day?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_generate_revenues?: boolean
          created_at?: string
          currency?: string
          default_revenue_category?: string
          id?: string
          revenue_generation_day?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_name: string | null
          author_type: Database["public"]["Enums"]["comment_author_type"]
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          author_type: Database["public"]["Enums"]["comment_author_type"]
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          author_type?: Database["public"]["Enums"]["comment_author_type"]
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          id: string
          post_id: string
          sort_order: number
          storage_path: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          sort_order?: number
          storage_path: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          sort_order?: number
          storage_path?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          caption: string | null
          client_id: string
          copy: string | null
          created_at: string
          flow_stage: Database["public"]["Enums"]["flow_stage"]
          format: Database["public"]["Enums"]["post_format"]
          id: string
          idea: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          position: number
          scheduled_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          caption?: string | null
          client_id: string
          copy?: string | null
          created_at?: string
          flow_stage?: Database["public"]["Enums"]["flow_stage"]
          format?: Database["public"]["Enums"]["post_format"]
          id?: string
          idea?: string | null
          platform?: Database["public"]["Enums"]["post_platform"]
          position?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          caption?: string | null
          client_id?: string
          copy?: string | null
          created_at?: string
          flow_stage?: Database["public"]["Enums"]["flow_stage"]
          format?: Database["public"]["Enums"]["post_format"]
          id?: string
          idea?: string | null
          platform?: Database["public"]["Enums"]["post_platform"]
          position?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          post_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          post_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          post_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_workspace_role"]
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_workspace_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_workspace_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _portal_client: {
        Args: { _token: string }
        Returns: {
          avatar_url: string | null
          brand_color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          instagram_handle: string | null
          monthly_fee: number | null
          name: string
          portal_enabled: boolean
          portal_token: string
          status: Database["public"]["Enums"]["client_status"]
          tiktok_handle: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_invite: { Args: { _token: string }; Returns: string }
      generate_monthly_revenues: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      get_invite: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          role: Database["public"]["Enums"]["app_workspace_role"]
          status: Database["public"]["Enums"]["invite_status"]
          workspace_name: string
        }[]
      }
      is_workspace_owner: { Args: { _workspace_id: string }; Returns: boolean }
      list_workspace_members: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          name: string
          role: Database["public"]["Enums"]["app_workspace_role"]
          user_id: string
        }[]
      }
      my_open_task_count: { Args: never; Returns: number }
      overdue_revenue_count: {
        Args: { _workspace_id: string }
        Returns: number
      }
      portal_add_comment: {
        Args: {
          _author_name: string
          _body: string
          _post_id: string
          _token: string
        }
        Returns: {
          author_name: string | null
          author_type: Database["public"]["Enums"]["comment_author_type"]
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "post_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_approve: {
        Args: { _author_name: string; _post_id: string; _token: string }
        Returns: {
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          caption: string | null
          client_id: string
          copy: string | null
          created_at: string
          flow_stage: Database["public"]["Enums"]["flow_stage"]
          format: Database["public"]["Enums"]["post_format"]
          id: string
          idea: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          position: number
          scheduled_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_get_brand_files: { Args: { _token: string }; Returns: Json }
      portal_get_brand_folders: { Args: { _token: string }; Returns: Json }
      portal_get_brand_modules: { Args: { _token: string }; Returns: Json }
      portal_get_client: {
        Args: { _token: string }
        Returns: {
          avatar_url: string
          brand_color: string
          id: string
          instagram_handle: string
          name: string
          tiktok_handle: string
        }[]
      }
      portal_get_comments: {
        Args: { _post_id: string; _token: string }
        Returns: {
          author_name: string | null
          author_type: Database["public"]["Enums"]["comment_author_type"]
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "post_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      portal_get_media: {
        Args: { _token: string }
        Returns: {
          created_at: string
          id: string
          post_id: string
          sort_order: number
          storage_path: string
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      portal_get_posts: {
        Args: { _token: string }
        Returns: {
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          caption: string | null
          client_id: string
          copy: string | null
          created_at: string
          flow_stage: Database["public"]["Enums"]["flow_stage"]
          format: Database["public"]["Enums"]["post_format"]
          id: string
          idea: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          position: number
          scheduled_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      portal_request_adjustment: {
        Args: {
          _author_name: string
          _body: string
          _post_id: string
          _token: string
        }
        Returns: {
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          caption: string | null
          client_id: string
          copy: string | null
          created_at: string
          flow_stage: Database["public"]["Enums"]["flow_stage"]
          format: Database["public"]["Enums"]["post_format"]
          id: string
          idea: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          position: number
          scheduled_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerate_portal_token: { Args: { _client_id: string }; Returns: string }
      remove_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: undefined
      }
      update_task_positions: { Args: { _updates: Json }; Returns: undefined }
      user_in_workspace: { Args: { _workspace_id: string }; Returns: boolean }
    }
    Enums: {
      app_workspace_role: "owner" | "member"
      approval_mode: "fast" | "flow"
      brand_module_type:
        | "diagnosis"
        | "persona"
        | "competitors"
        | "positioning"
        | "product_ladder"
      client_status: "active" | "paused" | "archived"
      comment_author_type: "team" | "client"
      expense_category:
        | "ferramentas"
        | "trafego_pago"
        | "freelancer"
        | "infraestrutura"
        | "impostos"
        | "outros"
      fin_status: "pending" | "paid" | "overdue" | "cancelled"
      flow_stage: "idea" | "copy" | "media" | "final"
      invite_status: "pending" | "accepted" | "expired"
      post_format: "static" | "carousel" | "reels" | "story"
      post_platform: "instagram" | "tiktok" | "both"
      post_status:
        | "draft"
        | "in_approval"
        | "adjustment_requested"
        | "approved"
        | "scheduled"
        | "published"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "backlog" | "todo" | "in_progress" | "in_review" | "done"
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
      app_workspace_role: ["owner", "member"],
      approval_mode: ["fast", "flow"],
      brand_module_type: [
        "diagnosis",
        "persona",
        "competitors",
        "positioning",
        "product_ladder",
      ],
      client_status: ["active", "paused", "archived"],
      comment_author_type: ["team", "client"],
      expense_category: [
        "ferramentas",
        "trafego_pago",
        "freelancer",
        "infraestrutura",
        "impostos",
        "outros",
      ],
      fin_status: ["pending", "paid", "overdue", "cancelled"],
      flow_stage: ["idea", "copy", "media", "final"],
      invite_status: ["pending", "accepted", "expired"],
      post_format: ["static", "carousel", "reels", "story"],
      post_platform: ["instagram", "tiktok", "both"],
      post_status: [
        "draft",
        "in_approval",
        "adjustment_requested",
        "approved",
        "scheduled",
        "published",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["backlog", "todo", "in_progress", "in_review", "done"],
    },
  },
} as const
