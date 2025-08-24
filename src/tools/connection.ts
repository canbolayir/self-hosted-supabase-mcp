import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function getConnectionTools(): Tool[] {
  return [
    {
      name: 'connection_test',
      description: 'Test connection to Supabase database and get basic info',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

export async function handleConnectionTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  switch (name) {
    case 'connection_test': {
      const testResult = await supabaseClient.testConnection();
      const status = supabaseClient.getConnectionStatus();
      
      const result = {
        connection: testResult,
        status: status,
        timestamp: new Date().toISOString()
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown connection tool: ${name}`);
  }
}