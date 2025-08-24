import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';

/**
 * Enhanced SQL Tools for Self-Hosted Supabase
 * 
 * These tools bypass Supabase client limitations by using raw SQL
 * and custom data processing for advanced queries.
 */

export function getEnhancedSqlTools(): Tool[] {
  return [
    {
      name: 'sql_aggregate_enhanced',
      description: 'Execute aggregate functions using raw SQL (bypasses Supabase client limitations)',
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
            description: 'WHERE clause filters (key-value pairs)',
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
    {
      name: 'sql_execute_raw',
      description: 'Execute raw SQL with enhanced error handling and result formatting',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Raw SQL query to execute',
          },
          params: {
            type: 'array',
            description: 'Query parameters',
            items: { type: 'string' },
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'sql_analyze_table',
      description: 'Get detailed table analysis including statistics',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Table name to analyze',
          },
        },
        required: ['table_name'],
      },
    },
  ];
}

export async function handleEnhancedSqlTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  switch (name) {
    case 'sql_aggregate_enhanced':
      return await handleEnhancedAggregate(supabaseClient, args);
    
    case 'sql_execute_raw':
      return await handleRawSqlExecute(supabaseClient, args);
    
    case 'sql_analyze_table':
      return await handleTableAnalysis(supabaseClient, args);
    
    default:
      throw new Error(`Unknown enhanced SQL tool: ${name}`);
  }
}

/**
 * Handle enhanced aggregate queries using raw SQL
 */
async function handleEnhancedAggregate(
  supabaseClient: SupabaseClient,
  args: any
): Promise<CallToolResult> {
  const { table, function: aggregateFunction, column, filters = {}, group_by } = args;

  try {
    // Build the aggregate query
    let query = buildAggregateQuery(table, aggregateFunction, column, filters, group_by);
    
    // Try multiple approaches for SQL execution
    const results = await executeWithFallbacks(supabaseClient, query);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: 'enhanced_aggregate',
            function: aggregateFunction,
            table,
            column: column || 'all',
            filters,
            group_by,
            results,
            query_executed: query,
            method: 'raw_sql_with_fallbacks',
            note: 'Enhanced aggregate bypassing Supabase client limitations',
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // If raw SQL fails, try client-side aggregation
    return await fallbackToClientAggregation(supabaseClient, args, error);
  }
}

/**
 * Build aggregate SQL query
 */
function buildAggregateQuery(
  table: string,
  aggregateFunction: string,
  column?: string,
  filters: Record<string, any> = {},
  groupBy?: string
): string {
  let selectClause = '';
  
  switch (aggregateFunction.toLowerCase()) {
    case 'count':
      selectClause = 'COUNT(*)';
      break;
    case 'sum':
    case 'avg':
    case 'min':
    case 'max':
      if (!column) {
        throw new Error(`Column is required for ${aggregateFunction} function`);
      }
      selectClause = `${aggregateFunction.toUpperCase()}(${column})`;
      break;
    default:
      throw new Error(`Unsupported aggregate function: ${aggregateFunction}`);
  }

  if (groupBy) {
    selectClause = `${groupBy}, ${selectClause}`;
  }

  let query = `SELECT ${selectClause} FROM ${table}`;

  // Add WHERE clause
  if (Object.keys(filters).length > 0) {
    const conditions = Object.entries(filters)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key} = '${value.replace(/'/g, "''")}'`;
        } else if (typeof value === 'number') {
          return `${key} = ${value}`;
        } else if (value === null) {
          return `${key} IS NULL`;
        } else {
          return `${key} = '${String(value).replace(/'/g, "''")}'`;
        }
      });
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (groupBy) {
    query += ` GROUP BY ${groupBy}`;
  }

  return query;
}

/**
 * Execute SQL with multiple fallback approaches
 */
async function executeWithFallbacks(
  supabaseClient: SupabaseClient,
  query: string
): Promise<any> {
  const client = supabaseClient.getClient();
  const errors: string[] = [];

  // Method 1: Try rpc with a custom function (if exists)
  try {
    const { data, error } = await client.rpc('execute_sql', { sql_query: query });
    if (!error && data) {
      return { method: 'rpc_execute_sql', data };
    }
    if (error) errors.push(`RPC method: ${error.message}`);
  } catch (error) {
    errors.push(`RPC method: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Method 2: Try client-side query execution (improved)
  try {
    // Extract table name and attempt direct query building
    const tableMatch = query.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      
      // Try to access the table first
      const { error: accessError } = await client
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (!accessError) {
        // If we can access the table, build a client-side solution
        const result = await executeClientSideQuery(client, query, tableName);
        return { method: 'client_side_execution', data: result };
      } else {
        errors.push(`Table access: ${accessError.message}`);
      }
    }
  } catch (error) {
    errors.push(`Client-side method: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Method 3: Try built-in aggregate functions via select
  try {
    const tableMatch = query.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      
      // Parse aggregate function
      const aggregateMatch = query.match(/(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([^)]*)\s*\)/i);
      if (aggregateMatch) {
        const [, func, column] = aggregateMatch;
        
        let selectClause = '';
        if (func.toUpperCase() === 'COUNT') {
          selectClause = 'count()';
        } else if (column && column !== '*') {
          selectClause = `${func.toLowerCase()}(${column})`;
        }
        
        if (selectClause) {
          const { data, error } = await client
            .from(tableName)
            .select(selectClause);
            
          if (!error && data) {
            return { method: 'builtin_aggregate', data };
          }
          
          if (error) {
            errors.push(`Built-in aggregate: ${error.message}`);
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Built-in aggregate method: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Method 4: Try direct HTTP approach to REST API
  try {
    const config = supabaseClient.getConfig();
    const response = await fetch(`${config.url}/rest/v1/rpc/sql_query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.anonKey}`,
        'apikey': config.anonKey,
      },
      body: JSON.stringify({ query }),
    });

    if (response.ok) {
      const result = await response.json();
      return { method: 'direct_http', data: result };
    }
    errors.push(`HTTP method: ${response.status} ${response.statusText}`);
  } catch (error) {
    errors.push(`HTTP method: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Method 5: Fallback to database tool emulation
  try {
    const tableMatch = query.match(/FROM\s+(\w+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      const result = await emulateSqlWithDatabaseTools(client, query, tableName);
      return { method: 'database_tool_emulation', data: result };
    }
  } catch (error) {
    errors.push(`Database tool emulation: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`All SQL execution methods failed: ${errors.join('; ')}`);
}

/**
 * Emulate SQL queries using basic database tools
 */
async function emulateSqlWithDatabaseTools(client: any, query: string, tableName: string): Promise<any> {
  // Simple SELECT emulation
  if (query.toUpperCase().includes('SELECT')) {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .limit(100);
    
    if (error) throw error;
    
    // Apply client-side filtering if WHERE clause exists
    let filteredData = data;
    const whereMatch = query.match(/WHERE\s+([^GROUP\s]+)/i);
    if (whereMatch && data) {
      const whereClause = whereMatch[1].trim();
      // Basic equality filtering
      const equalityMatch = whereClause.match(/(\w+)\s*=\s*'?([^']+)'?/);
      if (equalityMatch) {
        const [, column, value] = equalityMatch;
        filteredData = data.filter((row: any) => String(row[column]) === String(value));
      }
    }
    
    // Apply aggregate functions if present
    const aggregateMatch = query.match(/(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([^)]*)\s*\)/i);
    if (aggregateMatch && filteredData) {
      const [, func, column] = aggregateMatch;
      const result = calculateAggregate(filteredData, func, func.toUpperCase() === 'COUNT' ? null : column);
      return [{ [func.toLowerCase()]: result }];
    }
    
    return filteredData;
  }
  
  throw new Error('Query pattern not supported for database tool emulation');
}

/**
 * Execute query using client-side processing
 */
async function executeClientSideQuery(client: any, query: string, tableName: string): Promise<any> {
  // Parse the query to understand what we need to do
  const aggregateMatch = query.match(/(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([^)]*)\s*\)/i);
  const groupByMatch = query.match(/GROUP BY\s+(\w+)/i);
  
  if (!aggregateMatch) {
    throw new Error('Could not parse aggregate function from query');
  }

  const [, func, column] = aggregateMatch;
  const isCount = func.toUpperCase() === 'COUNT';
  
  // Fetch all data from the table
  let queryBuilder = client.from(tableName).select('*');
  
  // Apply filters if any (basic parsing)
  const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+GROUP BY|\s*$)/i);
  if (whereMatch) {
    // Simple filter parsing - this could be enhanced
    const filterStr = whereMatch[1];
    const simpleFilter = filterStr.match(/(\w+)\s*=\s*'?([^']+)'?/);
    if (simpleFilter) {
      const [, filterColumn, filterValue] = simpleFilter;
      queryBuilder = queryBuilder.eq(filterColumn, filterValue);
    }
  }

  const { data, error } = await queryBuilder;
  
  if (error) {
    throw error;
  }

  if (!data || !Array.isArray(data)) {
    throw new Error('No data returned from table query');
  }

  // Perform client-side aggregation
  if (groupByMatch && groupByMatch[1]) {
    const groupColumn = groupByMatch[1];
    const grouped = groupBy(data, groupColumn);
    
    return Object.entries(grouped).map(([key, group]) => ({
      [groupColumn]: key,
      [func.toLowerCase()]: calculateAggregate(group, func, isCount ? null : column),
    }));
  } else {
    const result = calculateAggregate(data, func, isCount ? null : column);
    return [{ [func.toLowerCase()]: result }];
  }
}

/**
 * Group array by column
 */
function groupBy(array: any[], key: string): Record<string, any[]> {
  return array.reduce((groups, item) => {
    const groupKey = item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
}

/**
 * Calculate aggregate value
 */
function calculateAggregate(data: any[], func: string, column: string | null): number {
  switch (func.toUpperCase()) {
    case 'COUNT':
      return data.length;
    
    case 'SUM':
      return data.reduce((sum, item) => sum + (Number(item[column!]) || 0), 0);
    
    case 'AVG':
      const sum = data.reduce((sum, item) => sum + (Number(item[column!]) || 0), 0);
      return data.length > 0 ? sum / data.length : 0;
    
    case 'MIN':
      const values = data.map(item => Number(item[column!])).filter(v => !isNaN(v));
      return values.length > 0 ? Math.min(...values) : 0;
    
    case 'MAX':
      const maxValues = data.map(item => Number(item[column!])).filter(v => !isNaN(v));
      return maxValues.length > 0 ? Math.max(...maxValues) : 0;
    
    default:
      throw new Error(`Unsupported aggregate function: ${func}`);
  }
}

/**
 * Fallback to client-side aggregation when SQL fails
 */
async function fallbackToClientAggregation(
  supabaseClient: SupabaseClient,
  args: any,
  originalError: any
): Promise<CallToolResult> {
  const { table, function: aggregateFunction, column, filters = {}, group_by } = args;
  
  try {
    const client = supabaseClient.getClient();
    
    // Fetch data with filters
    let queryBuilder = client.from(table).select('*');
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      queryBuilder = queryBuilder.eq(key, value);
    });

    const { data, error } = await queryBuilder;
    
    if (error) {
      throw error;
    }

    if (!data || !Array.isArray(data)) {
      throw new Error('No data returned for client-side aggregation');
    }

    // Perform client-side aggregation
    let results;
    if (group_by) {
      const grouped = groupBy(data, group_by);
      results = Object.entries(grouped).map(([key, group]) => ({
        [group_by]: key,
        [aggregateFunction]: calculateAggregate(group, aggregateFunction, column),
        count: group.length,
      }));
    } else {
      const result = calculateAggregate(data, aggregateFunction, column);
      results = [{ [aggregateFunction]: result, total_rows: data.length }];
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: 'client_side_aggregation',
            function: aggregateFunction,
            table,
            column: column || 'all',
            filters,
            group_by,
            results,
            method: 'client_side_processing',
            original_sql_error: originalError instanceof Error ? originalError.message : String(originalError),
            note: 'SQL execution failed, used client-side data processing as fallback',
            performance_note: `Processed ${data.length} rows locally`,
          }, null, 2),
        },
      ],
    };
  } catch (fallbackError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            operation: 'enhanced_aggregate',
            function: aggregateFunction,
            table,
            original_error: originalError instanceof Error ? originalError.message : String(originalError),
            fallback_error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            troubleshooting: {
              possible_causes: [
                'Table does not exist or is not accessible',
                'RLS policies blocking access',
                'Service role key missing or invalid',
                'Column does not exist or wrong data type',
              ],
              solutions: [
                'Verify table exists: Use schema_get_tables tool',
                'Check column exists: Use schema_get_columns tool',
                'Try with service role key for full access',
                'Disable RLS temporarily for testing',
                'Use db_select to verify data access',
              ],
            },
          }, null, 2),
        },
      ],
    };
  }
}

/**
 * Handle raw SQL execution with enhanced error handling
 */
async function handleRawSqlExecute(
  supabaseClient: SupabaseClient,
  args: any
): Promise<CallToolResult> {
  const { query, params = [] } = args;

  try {
    const results = await executeWithFallbacks(supabaseClient, query);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: 'raw_sql_execute',
            query,
            results,
            note: 'Raw SQL executed successfully with enhanced fallbacks',
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
            operation: 'raw_sql_execute',
            query,
            error: error instanceof Error ? error.message : String(error),
            troubleshooting: {
              common_issues: [
                'SQL syntax error',
                'Table or column does not exist',
                'RLS policies blocking query',
                'Insufficient permissions',
              ],
              suggested_fixes: [
                'Check SQL syntax carefully',
                'Verify table/column names with schema tools',
                'Use service role key for admin access',
                'Test with simpler queries first',
              ],
            },
          }, null, 2),
        },
      ],
    };
  }
}

/**
 * Handle table analysis
 */
async function handleTableAnalysis(
  supabaseClient: SupabaseClient,
  args: any
): Promise<CallToolResult> {
  const { table_name } = args;

  try {
    const client = supabaseClient.getClient();
    
    // Get basic table info
    const { data: tableData, error: tableError } = await client
      .from(table_name)
      .select('*')
      .limit(100);

    if (tableError) {
      throw tableError;
    }

    if (!tableData || !Array.isArray(tableData)) {
      throw new Error('No data available for analysis');
    }

    // Perform analysis
    const rowCount = tableData.length;
    const columns = rowCount > 0 ? Object.keys(tableData[0]) : [];
    
    const columnStats = columns.map(column => {
      const values = tableData.map(row => row[column]).filter(v => v !== null && v !== undefined);
      const nonNullCount = values.length;
      const nullCount = rowCount - nonNullCount;
      
      let dataType = 'unknown';
      let stats = {};
      
      if (values.length > 0) {
        const firstValue = values[0];
        if (typeof firstValue === 'number') {
          dataType = 'number';
          const numbers = values.filter(v => typeof v === 'number');
          stats = {
            min: Math.min(...numbers),
            max: Math.max(...numbers),
            avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
            sum: numbers.reduce((a, b) => a + b, 0),
          };
        } else if (typeof firstValue === 'string') {
          dataType = 'string';
          const lengths = values.map(v => String(v).length);
          stats = {
            min_length: Math.min(...lengths),
            max_length: Math.max(...lengths),
            avg_length: lengths.reduce((a, b) => a + b, 0) / lengths.length,
          };
        } else if (firstValue instanceof Date || typeof firstValue === 'string' && !isNaN(Date.parse(firstValue))) {
          dataType = 'date';
        }
      }

      return {
        column_name: column,
        data_type: dataType,
        non_null_count: nonNullCount,
        null_count: nullCount,
        null_percentage: rowCount > 0 ? (nullCount / rowCount * 100).toFixed(2) + '%' : '0%',
        ...stats,
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: 'table_analysis',
            table: table_name,
            summary: {
              total_rows_analyzed: rowCount,
              total_columns: columns.length,
              analysis_note: rowCount === 100 ? 'Analysis based on first 100 rows' : 'Full table analyzed',
            },
            column_statistics: columnStats,
            quick_aggregates: {
              row_count: rowCount,
              column_count: columns.length,
              has_null_values: columnStats.some(col => col.null_count > 0),
            },
            note: 'Table analysis complete with column statistics and basic aggregates',
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
            operation: 'table_analysis',
            table: table_name,
            error: error instanceof Error ? error.message : String(error),
            troubleshooting: {
              common_issues: [
                'Table does not exist',
                'No permission to access table',
                'RLS policies blocking access',
              ],
              solutions: [
                'Check table name with schema_get_tables',
                'Use service role key for full access',
                'Verify table permissions',
              ],
            },
          }, null, 2),
        },
      ],
    };
  }
}
