#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { SupabaseClient } from './supabase-client.js';
import { getConnectionTools, handleConnectionTool } from './tools/connection.js';
import { getAuthTools, handleAuthTool } from './tools/auth.js';
import { getSchemaTools, handleSchemaTool } from './tools/schema.js';
import { getDatabaseTools, handleDatabaseTool } from './tools/database.js';
import { getRealtimeTools, handleRealtimeTool } from './tools/realtime.js';
import { getStorageTools, handleStorageTool } from './tools/storage.js';
import { getSqlTools, handleSqlTool } from './tools/sql.js';
import { getEnhancedSqlTools, handleEnhancedSqlTool } from './tools/enhanced-sql.js';
import { getEdgeFunctionTools, handleEdgeFunctionTool } from './tools/edge-functions.js';
import { getSecurityTools, handleSecurityTool } from './tools/security.js';

dotenv.config();

const server = new Server(
  {
    name: process.env.MCP_SERVER_NAME || 'supabase-mcp-server',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const supabaseClient = new SupabaseClient();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...getConnectionTools(),
      ...getAuthTools(),
      ...getSchemaTools(),
      ...getDatabaseTools(),
      ...getRealtimeTools(),
      ...getStorageTools(),
      ...getSqlTools(),
      ...getEnhancedSqlTools(),
      ...getEdgeFunctionTools(),
      ...getSecurityTools(),
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (true) {
      case name.startsWith('connection_'):
        return await handleConnectionTool(supabaseClient, name, args);
      case name.startsWith('auth_'):
        return await handleAuthTool(supabaseClient, name, args);
      case name.startsWith('schema_'):
        return await handleSchemaTool(supabaseClient, name, args);
      case name.startsWith('db_'):
        return await handleDatabaseTool(supabaseClient, name, args);
      case name.startsWith('realtime_'):
        return await handleRealtimeTool(supabaseClient, name, args);
      case name.startsWith('storage_'):
        return await handleStorageTool(supabaseClient, name, args);
      case name.startsWith('sql_'):
        return await handleSqlTool(supabaseClient, name, args);
      case name.startsWith('edge_'):
        return await handleEdgeFunctionTool(supabaseClient, name, args);
      case name.startsWith('security_'):
        return await handleSecurityTool(supabaseClient, name, args);
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Supabase MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

