export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      entitlements: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          environment: string;
          transaction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          environment: string;
          transaction_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          environment?: string;
          transaction_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          source_type: string;
          params: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          source_type: string;
          params: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          source_type?: string;
          params?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      list_my_forge_uploads: {
        Args: { p_token: string };
        Returns: Array<{
          id: string;
          filename: string;
          storage_path: string;
          uploaded_at: string;
          analysis: Json;
          status: string;
          error: string | null;
          outputs_count: number;
        }>;
      };
    };
    Enums: Record<string, never>;
  };
};
