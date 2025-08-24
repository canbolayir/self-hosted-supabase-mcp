import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';

export function getDatabaseTools(): Tool[] {
  return [
    {
      name: 'db_select',
      description: 'Select data from a table with optional filters and sorting',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to query',
          },
          columns: {
            type: 'string',
            description: 'Columns to select (comma-separated, default: *)',
            default: '*',
          },
          filters: {
            type: 'object',
            description: 'Filters to apply (key-value pairs)',
            additionalProperties: true,
          },
          order: {
            type: 'string',
            description: 'Column to order by',
          },
          ascending: {
            type: 'boolean',
            description: 'Sort order (default: true)',
            default: true,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of rows to return',
          },
          offset: {
            type: 'number',
            description: 'Number of rows to skip',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'db_insert',
      description: 'Insert new row(s) into a table',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to insert into',
          },
          data: {
            type: 'object',
            description: 'Data to insert (single row as object or array of objects)',
            additionalProperties: true,
          },
          returning: {
            type: 'string',
            description: 'Columns to return (comma-separated, default: *)',
            default: '*',
          },
        },
        required: ['table', 'data'],
      },
    },
    {
      name: 'db_update',
      description: 'Update existing rows in a table',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to update',
          },
          data: {
            type: 'object',
            description: 'Data to update (key-value pairs)',
            additionalProperties: true,
          },
          filters: {
            type: 'object',
            description: 'Filters to identify rows to update (key-value pairs)',
            additionalProperties: true,
          },
          returning: {
            type: 'string',
            description: 'Columns to return (comma-separated, default: *)',
            default: '*',
          },
        },
        required: ['table', 'data', 'filters'],
      },
    },
    {
      name: 'db_delete',
      description: 'Delete rows from a table',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to delete from',
          },
          filters: {
            type: 'object',
            description: 'Filters to identify rows to delete (key-value pairs)',
            additionalProperties: true,
          },
          returning: {
            type: 'string',
            description: 'Columns to return (comma-separated, default: *)',
            default: '*',
          },
        },
        required: ['table', 'filters'],
      },
    },
    {
      name: 'db_upsert',
      description: 'Insert or update rows (upsert) in a table',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to upsert into',
          },
          data: {
            type: 'object',
            description: 'Data to upsert (single row as object or array of objects)',
            additionalProperties: true,
          },
          on_conflict: {
            type: 'string',
            description: 'Column(s) to check for conflicts (comma-separated)',
          },
          returning: {
            type: 'string',
            description: 'Columns to return (comma-separated, default: *)',
            default: '*',
          },
        },
        required: ['table', 'data'],
      },
    },
    {
      name: 'db_count',
      description: 'Count rows in a table with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to count rows from',
          },
          filters: {
            type: 'object',
            description: 'Filters to apply (key-value pairs)',
            additionalProperties: true,
          },
        },
        required: ['table'],
      },
    },
  ];
}

export async function handleDatabaseTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getAdminClient();

  switch (name) {
    case 'db_select': {
      const { table, columns = '*', filters = {}, order, ascending = true, limit, offset } = args;
      
      try {
        let query = client.from(table).select(columns);

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        // Apply ordering
        if (order) {
          query = query.order(order, { ascending });
        }

        // Apply pagination
        if (limit) {
          query = query.limit(limit);
        }
        if (offset) {
          query = query.range(offset, offset + (limit || 1000) - 1);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'select',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'select',
                data: data || [],
                count: data?.length || 0,
                filters,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'select',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'db_insert': {
      const { table, data, returning = '*' } = args;
      
      try {
        const { data: result, error } = await client
          .from(table)
          .insert(data)
          .select(returning);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'insert',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'insert',
                data: result || [],
                count: result?.length || 0,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'insert',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'db_update': {
      const { table, data, filters, returning = '*' } = args;
      
      try {
        let query = client.from(table).update(data);

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        const { data: result, error } = await query.select(returning);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'update',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'update',
                data: result || [],
                count: result?.length || 0,
                filters,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'update',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'db_delete': {
      const { table, filters, returning = '*' } = args;
      
      try {
        let query = client.from(table).delete();

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        const { data: result, error } = await query.select(returning);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'delete',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'delete',
                data: result || [],
                count: result?.length || 0,
                filters,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'delete',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'db_upsert': {
      const { table, data, on_conflict, returning = '*' } = args;
      
      try {
        const { data: result, error } = await client
          .from(table)
          .upsert(data)
          .select(returning);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'upsert',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'upsert',
                data: result || [],
                count: Array.isArray(result) ? result.length : 0,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'upsert',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'db_count': {
      const { table, filters = {} } = args;
      
      try {
        let query = client.from(table).select('*', { count: 'exact', head: true });

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        const { count, error } = await query;

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  table,
                  operation: 'count',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table,
                operation: 'count',
                count: count || 0,
                filters,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                table,
                operation: 'count',
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown database tool: ${name}`);
  }
}