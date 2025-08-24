import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';

export function getSchemaTools(): Tool[] {
  return [
    {
      name: 'schema_get_tables',
      description: 'Get list of all tables in the database schema',
      inputSchema: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
            default: 'public',
          },
        },
      },
    },
    {
      name: 'schema_get_columns',
      description: 'Get columns information for a specific table',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table',
          },
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
            default: 'public',
          },
        },
        required: ['table_name'],
      },
    },
    {
      name: 'schema_get_relations',
      description: 'Get foreign key relationships for a table',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table',
          },
          schema: {
            type: 'string',
            description: 'Schema name (default: public)',
            default: 'public',
          },
        },
        required: ['table_name'],
      },
    },
  ];
}

export async function handleSchemaTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getAdminClient();
  const config = supabaseClient.getConfig();

  switch (name) {
    case 'schema_get_tables': {
      const schema = args.schema || 'public';
      
      try {
        // Try to query existing tables directly via REST API
        const response = await fetch(`${config.url}/rest/v1/`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.serviceRoleKey}`,
            'Content-Type': 'application/json',
            'apikey': config.serviceRoleKey,
          }
        });

        if (!response.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `HTTP ${response.status}: ${response.statusText}`,
                  schema,
                  suggestion: 'Check your Supabase URL and service role key',
                }, null, 2),
              },
            ],
          };
        }

        // Parse OpenAPI schema to get table names
        const openApiSpec = await response.json();
        const tables = [];
        
        if (openApiSpec.paths) {
          for (const path in openApiSpec.paths) {
            if (path.startsWith('/') && !path.includes('rpc')) {
              const tableName = path.substring(1);
              if (tableName && !tableName.includes('/')) {
                tables.push({
                  table_name: tableName,
                  table_schema: schema,
                  table_type: 'BASE TABLE'
                });
              }
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                schema,
                tables: tables || [],
                count: tables?.length || 0,
                method: 'openapi_parsing',
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
                schema,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'schema_get_columns': {
      const { table_name, schema = 'public' } = args;
      
      try {
        // Try to infer columns from a sample query
        const { data: sampleData, error: sampleError } = await client
          .from(table_name)
          .select('*')
          .limit(1);

        if (sampleError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: sampleError.message,
                  table: table_name,
                  schema,
                  suggestion: 'Table might not exist or you might not have permissions',
                }, null, 2),
              },
            ],
          };
        }

        // Extract column information from sample data
        const columns = [];
        if (sampleData && sampleData.length > 0) {
          const sampleRow = sampleData[0];
          Object.keys(sampleRow).forEach((columnName, index) => {
            const value = sampleRow[columnName];
            let dataType = 'unknown';
            
            if (value === null) {
              dataType = 'nullable';
            } else if (typeof value === 'string') {
              dataType = 'text';
            } else if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'numeric';
            } else if (typeof value === 'boolean') {
              dataType = 'boolean';
            } else if (value instanceof Date) {
              dataType = 'timestamp';
            }
            
            columns.push({
              column_name: columnName,
              data_type: dataType,
              is_nullable: value === null ? 'YES' : 'UNKNOWN',
              column_default: null,
              ordinal_position: index + 1
            });
          });
        } else {
          // Empty table, try to get schema from error or return basic info
          columns.push({
            column_name: 'No data available',
            data_type: 'Run a select query to see columns',
            is_nullable: 'UNKNOWN',
            column_default: null,
            ordinal_position: 1
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table: table_name,
                schema,
                columns: columns || [],
                count: columns?.length || 0,
                method: 'sample_data_inference',
                note: 'Column types inferred from sample data. For exact schema use SQL functions.',
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
                table: table_name,
                schema,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'schema_get_relations': {
      const { table_name, schema = 'public' } = args;
      
      try {
        // Since we can't easily query foreign keys, provide a helpful response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                table: table_name,
                schema,
                relations: [],
                message: 'Foreign key relationships require SQL introspection',
                note: 'Use Supabase Dashboard > Table Editor to view relationships, or create custom SQL functions for detailed schema analysis',
                suggestion: 'For simple relationships, check related tables using schema_get_tables and look for *_id columns',
                alternative_approach: `Use db_select with filters like: {"filters": {"${table_name}_id": "some_id"}} to test relationships`,
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
                table: table_name,
                schema,
                operation: 'get_relations',
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown schema tool: ${name}`);
  }
}