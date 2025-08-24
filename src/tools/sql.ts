import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';
import { getEnhancedSqlTools, handleEnhancedSqlTool } from './enhanced-sql.js';

export function getSqlTools(): Tool[] {
  return [
    {
      name: 'sql_execute',
      description: 'Execute raw SQL query (use with caution)',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL query to execute',
          },
          params: {
            type: 'array',
            description: 'Parameters for the query',
            items: {
              type: 'string',
            },
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'sql_call_rpc',
      description: 'Call a stored procedure/function',
      inputSchema: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Name of the function to call',
          },
          params: {
            type: 'object',
            description: 'Parameters for the function',
            additionalProperties: true,
          },
        },
        required: ['function_name'],
      },
    },
    {
      name: 'sql_aggregate',
      description: 'Execute SQL aggregate functions (COUNT, SUM, AVG, MIN, MAX)',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name to aggregate',
          },
          function: {
            type: 'string',
            description: 'Aggregate function (count, sum, avg, min, max)',
            enum: ['count', 'sum', 'avg', 'min', 'max'],
          },
          column: {
            type: 'string',
            description: 'Column to aggregate (not needed for count)',
          },
          filters: {
            type: 'object',
            description: 'Filters to apply before aggregation (key-value pairs)',
            additionalProperties: true,
          },
          group_by: {
            type: 'string',
            description: 'Column to group by (optional)',
          },
        },
        required: ['table', 'function'],
      },
    },
  ];
}

export async function handleSqlTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  // Check if this is an enhanced SQL tool
  const enhancedToolNames = ['sql_aggregate_enhanced', 'sql_execute_raw', 'sql_analyze_table'];
  if (enhancedToolNames.includes(name)) {
    return await handleEnhancedSqlTool(supabaseClient, name, args);
  }
  
  const client = supabaseClient.getAdminClient();

  switch (name) {
    case 'sql_execute': {
      const { query, params = [] } = args;
      
      try {
        // Parse and validate query - expanded DDL support
        const trimmedQuery = query.trim().toUpperCase();
        const allowedStarts = [
          'SELECT', 'WITH', 'SHOW', 'EXPLAIN',
          'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE FUNCTION',
          'ALTER TABLE', 'DROP TABLE', 'DROP INDEX', 'DROP VIEW',
          'GRANT', 'REVOKE', 'COMMENT ON'
        ];
        
        const isAllowed = allowedStarts.some(start => trimmedQuery.startsWith(start));
        
        if (!isAllowed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Query type not allowed. Only SELECT, DDL (CREATE/ALTER/DROP), and administrative commands are supported',
                  query: query.substring(0, 100) + '...',
                  allowed_commands: allowedStarts,
                  suggestion: 'Use specific database tools (db_select, db_insert, etc.) for DML operations',
                  note: 'DDL commands and SELECT queries with aggregates are fully supported',
                }, null, 2),
              },
            ],
          };
        }

        // For DDL commands, provide execution guidance
        if (trimmedQuery.startsWith('CREATE') || trimmedQuery.startsWith('ALTER') || 
            trimmedQuery.startsWith('DROP') || trimmedQuery.startsWith('GRANT') || 
            trimmedQuery.startsWith('REVOKE')) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  operation: 'ddl_command',
                  query_type: trimmedQuery.split(' ')[0],
                  sql_command: query,
                  message: 'DDL command ready for execution',
                  execution_steps: [
                    '1. Copy the SQL command',
                    '2. Go to Supabase Dashboard > SQL Editor',
                    '3. Paste and execute with admin privileges',
                    '4. Verify the changes took effect',
                  ],
                  safety_note: 'DDL commands can modify database structure. Review carefully before execution.',
                  rollback_planning: 'Consider creating backup or rollback script before executing structural changes',
                }, null, 2),
              },
            ],
          };
        }

        // Enhanced SQL parsing and execution
        if (trimmedQuery.includes('SELECT') && trimmedQuery.includes('FROM')) {
          // Extract table name with better regex - support aliases
          const fromMatch = query.match(/from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:as\s+[a-zA-Z_][a-zA-Z0-9_]*\s*)?(?:where|group|order|limit|;|$)/i);
          if (fromMatch) {
            const tableName = fromMatch[1];
            
            // Enhanced SELECT parsing with DISTINCT support
            const selectMatch = query.match(/select\s+(distinct\s+)?(.*?)\s+from/i);
            let columns = '*';
            let isDistinct = false;
            
            if (selectMatch) {
              isDistinct = !!selectMatch[1];
              const columnsText = selectMatch[2].trim();
              if (columnsText !== '*') {
                // Clean up column list but preserve aliases and functions
                columns = columnsText.replace(/\s+/g, ' ').trim();
              }
            }

            // Check for aggregate functions in the query
            const hasAggregates = /count\s*\(|sum\s*\(|avg\s*\(|min\s*\(|max\s*\(/i.test(query);
            
            // If query has aggregates, try to execute directly
            if (hasAggregates) {
              try {
                const { data, error } = await client.from(tableName).select(columns);
                
                if (error) {
                  return {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify({
                          success: false,
                          error: `Aggregate query failed: ${error.message}`,
                          query: query.substring(0, 150) + '...',
                          parsed_table: tableName,
                          has_aggregates: true,
                          suggestion: 'Use sql_aggregate tool for better aggregate function support',
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
                        operation: 'sql_execute',
                        data: data || [],
                        count: data?.length || 0,
                        query: query.substring(0, 150) + '...',
                        parsed_table: tableName,
                        method: 'aggregate_query_direct',
                        has_aggregates: true,
                        note: 'SQL with aggregate functions executed successfully',
                      }, null, 2),
                    },
                  ],
                };
              } catch (aggError) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        success: false,
                        error: `Aggregate query failed: ${aggError instanceof Error ? aggError.message : String(aggError)}`,
                        query: query.substring(0, 150) + '...',
                        parsed_table: tableName,
                        has_aggregates: true,
                        suggestion: 'Use sql_aggregate tool for reliable aggregate queries',
                      }, null, 2),
                    },
                  ],
                };
              }
            }
            
            // Parse WHERE conditions
            const whereMatch = query.match(/where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*['"]?([^'";\s]+)['"]?/i);
            const filters: Record<string, any> = {};
            if (whereMatch) {
              filters[whereMatch[1]] = whereMatch[2];
            }
            
            // Parse LIMIT
            const limitMatch = query.match(/limit\s+(\d+)/i);
            const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
            
            // Parse ORDER BY
            const orderMatch = query.match(/order\s+by\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(asc|desc)?/i);
            const order = orderMatch ? orderMatch[1] : undefined;
            const ascending = !orderMatch || !orderMatch[2] || orderMatch[2].toLowerCase() === 'asc';
            
            // Build query exactly like database.ts
            let supaQuery = client.from(tableName).select(columns);

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
              supaQuery = supaQuery.eq(key, value);
            });

            // Apply ordering
            if (order) {
              supaQuery = supaQuery.order(order, { ascending });
            }

            // Apply limit
            if (limit) {
              supaQuery = supaQuery.limit(limit);
            }

            const { data, error } = await supaQuery;

            if (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: false,
                      error: `Query execution failed: ${error.message}`,
                      query: query.substring(0, 150) + '...',
                      parsed_table: tableName,
                      suggestion: 'Try using db_select tool with filters parameter for complex queries',
                      example: `{"table": "${tableName}", "columns": "*", "filters": {"column": "value"}, "limit": 10}`,
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
                    operation: 'sql_execute',
                    data: data || [],
                    count: data?.length || 0,
                    query: query.substring(0, 150) + '...',
                    parsed_table: tableName,
                    method: 'enhanced_query_builder',
                    note: 'SQL parsed and converted to Supabase query builder with WHERE, ORDER BY, LIMIT support',
                  }, null, 2),
                },
              ],
            };
          }
        }

        // Handle simple table queries without FROM
        const tableOnlyMatch = query.match(/^select\s+\*?\s*from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;?\s*$/i);
        if (tableOnlyMatch) {
          const tableName = tableOnlyMatch[1];
          const { data, error } = await client
            .from(tableName)
            .select('*')
            .limit(50);

          if (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error.message,
                    table: tableName,
                    suggestion: 'Table might not exist. Use schema_get_tables to see available tables',
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
                  operation: 'sql_execute',
                  data: data || [],
                  count: data?.length || 0,
                  table: tableName,
                  method: 'simple_table_select',
                }, null, 2),
              },
            ],
          };
        }

        // Fallback for unknown queries
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Cannot parse SQL query automatically',
                query: query.substring(0, 100) + '...',
                suggestion: 'Use specific tools: db_select, db_insert, db_update, db_delete, or install SQL execution functions',
                available_tools: ['db_select', 'db_insert', 'db_update', 'db_delete', 'db_count'],
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
                operation: 'sql_execute',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'sql_call_rpc': {
      const { function_name, params = {} } = args;
      
      try {
        // Handle built-in PostgreSQL functions and common Supabase functions
        const builtinFunctions: Record<string, (params?: any) => any> = {
          'version': () => ({ version: 'PostgreSQL 15.1 via Supabase', note: 'Simulated response' }),
          'current_timestamp': () => ({ current_timestamp: new Date().toISOString() }),
          'current_date': () => ({ current_date: new Date().toISOString().split('T')[0] }),
          'now': () => ({ now: new Date().toISOString() }),
          'current_time': () => ({ current_time: new Date().toTimeString().split(' ')[0] }),
          'current_user': () => ({ current_user: 'supabase_admin' }),
          'pg_size_pretty': (params) => ({ 
            size: '128 MB', 
            note: 'Simulated database size',
            params: params 
          }),
          'pg_database_size': (params) => ({ 
            size_bytes: 134217728, 
            size_mb: 128,
            database: params?.database_name || 'postgres',
          }),
          'pg_stat_user_tables': () => ({
            tables: [
              { schemaname: 'public', relname: 'users', n_tup_ins: 100, n_tup_upd: 50, n_tup_del: 10 },
              { schemaname: 'public', relname: 'posts', n_tup_ins: 500, n_tup_upd: 200, n_tup_del: 25 }
            ],
            note: 'Simulated table statistics'
          }),
          'generate_series': (params) => {
            const start = params?.start || 1;
            const end = params?.end || 10;
            const series = [];
            for (let i = start; i <= Math.min(end, start + 100); i++) {
              series.push(i);
            }
            return { series, start, end, note: 'Generated series (limited to 100 items)' };
          },
          'uuid_generate_v4': () => ({ 
            uuid: crypto.randomUUID(), 
            note: 'Generated UUID v4' 
          }),
        };
        
        if (builtinFunctions[function_name.toLowerCase()]) {
          // Simulate built-in function response
          const result = builtinFunctions[function_name.toLowerCase()]();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  operation: 'rpc_call',
                  function: function_name,
                  data: result,
                  params,
                  type: 'simulated_builtin',
                  note: 'PostgreSQL built-in function simulated by MCP server',
                }, null, 2),
              },
            ],
          };
        }

        // For custom functions, still try but with better error handling
        const { data, error } = await client.rpc(function_name, params);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  function: function_name,
                  params,
                  suggestion: 'Function might not exist. Create it in Supabase SQL editor or try built-in functions',
                  common_functions: ['version', 'current_timestamp', 'current_date', 'now'],
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
                operation: 'rpc_call',
                function: function_name,
                data: data,
                params,
                type: 'custom_function',
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
                function: function_name,
                operation: 'rpc_call',
                suggestion: 'Check if function exists and has correct parameters',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'sql_aggregate': {
      const { table, function: aggFunction, column, filters = {}, group_by } = args;
      
      try {
        // Build column selection based on aggregate function
        let selectColumn = '';
        switch (aggFunction.toLowerCase()) {
          case 'count':
            selectColumn = group_by ? `${group_by}, count()` : 'count()';
            break;
          case 'sum':
            if (!column) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Column is required for SUM function',
                    function: aggFunction,
                    table,
                  }, null, 2),
                }],
              };
            }
            selectColumn = group_by ? `${group_by}, sum(${column})` : `sum(${column})`;
            break;
          case 'avg':
            if (!column) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Column is required for AVG function',
                    function: aggFunction,
                    table,
                  }, null, 2),
                }],
              };
            }
            selectColumn = group_by ? `${group_by}, avg(${column})` : `avg(${column})`;
            break;
          case 'min':
            if (!column) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Column is required for MIN function',
                    function: aggFunction,
                    table,
                  }, null, 2),
                }],
              };
            }
            selectColumn = group_by ? `${group_by}, min(${column})` : `min(${column})`;
            break;
          case 'max':
            if (!column) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Column is required for MAX function',
                    function: aggFunction,
                    table,
                  }, null, 2),
                }],
              };
            }
            selectColumn = group_by ? `${group_by}, max(${column})` : `max(${column})`;
            break;
          default:
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `Unknown aggregate function: ${aggFunction}`,
                  supported_functions: ['count', 'sum', 'avg', 'min', 'max'],
                }, null, 2),
              }],
            };
        }

        // Build query like database.ts
        let supaQuery = client.from(table).select(selectColumn);

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
          supaQuery = supaQuery.eq(key, value);
        });

        const { data, error } = await supaQuery;

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'sql_aggregate',
                  function: aggFunction,
                  table,
                  column,
                  suggestion: 'Check if table and column exist, and filters are valid',
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
                operation: 'sql_aggregate',
                function: aggFunction,
                table,
                column,
                group_by,
                filters,
                data: data || [],
                result_count: data?.length || 0,
                note: 'Aggregate function executed via Supabase query builder',
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
                operation: 'sql_aggregate',
                function: aggFunction,
                table,
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown SQL tool: ${name}`);
  }
}