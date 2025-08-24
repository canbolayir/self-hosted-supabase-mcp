import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface DatabaseRow {
  [key: string]: any;
}

export interface TableInfo {
  table_name: string;
  table_schema: string;
  table_type: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export interface RelationInfo {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
}

export interface StorageObject {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, any>;
}

export interface BucketInfo {
  id: string;
  name: string;
  owner: string;
  created_at: string;
  updated_at: string;
  public: boolean;
}

export interface RealtimeSubscription {
  id: string;
  table: string;
  event: string;
  active: boolean;
}

export interface EdgeFunction {
  id: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface MetricData {
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}