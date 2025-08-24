import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';

export function getSecurityTools(): Tool[] {
  return [
    {
      name: 'security_enable_rls',
      description: 'Enable Row Level Security (RLS) on a table',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table to enable RLS on',
          },
        },
        required: ['table_name'],
      },
    },
    {
      name: 'security_disable_rls',
      description: 'Disable Row Level Security (RLS) on a table',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table to disable RLS on',
          },
        },
        required: ['table_name'],
      },
    },
    {
      name: 'security_create_policy',
      description: 'Create a Row Level Security policy',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table to create policy for',
          },
          policy_name: {
            type: 'string',
            description: 'Name of the policy',
          },
          command: {
            type: 'string',
            description: 'Command type (SELECT, INSERT, UPDATE, DELETE, ALL)',
            enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'],
          },
          roles: {
            type: 'array',
            description: 'Roles the policy applies to (default: authenticated)',
            items: {
              type: 'string',
            },
          },
          using_expression: {
            type: 'string',
            description: 'USING clause expression for SELECT/DELETE',
          },
          with_check_expression: {
            type: 'string',
            description: 'WITH CHECK clause expression for INSERT/UPDATE',
          },
        },
        required: ['table_name', 'policy_name', 'command'],
      },
    },
    {
      name: 'security_drop_policy',
      description: 'Drop a Row Level Security policy',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table',
          },
          policy_name: {
            type: 'string',
            description: 'Name of the policy to drop',
          },
        },
        required: ['table_name', 'policy_name'],
      },
    },
    {
      name: 'security_list_policies',
      description: 'List all policies for a table',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table to list policies for',
          },
        },
        required: ['table_name'],
      },
    },
    {
      name: 'security_check_rls_status',
      description: 'Check RLS status for tables',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of specific table (optional, lists all if not provided)',
          },
        },
      },
    },
    {
      name: 'security_test_policy',
      description: 'Test a policy by simulating different user contexts',
      inputSchema: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: 'Name of the table',
          },
          test_query: {
            type: 'string',
            description: 'Test query to execute',
          },
          user_context: {
            type: 'object',
            description: 'User context to simulate (user_id, role, etc.)',
            additionalProperties: true,
          },
        },
        required: ['table_name', 'test_query'],
      },
    },
  ];
}

export async function handleSecurityTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getAdminClient();

  switch (name) {
    case 'security_enable_rls': {
      const { table_name } = args;
      
      try {
        // Directly provide SQL command for execution
        const sql = `ALTER TABLE ${table_name} ENABLE ROW LEVEL SECURITY;`;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'enable_rls',
                table: table_name,
                sql_command: sql,
                message: `SQL command ready to enable RLS on '${table_name}'`,
                execution_steps: [
                  '1. Copy the SQL command below',
                  '2. Go to Supabase Dashboard > SQL Editor',
                  '3. Paste and execute the SQL command',
                  '4. Verify with security_check_rls_status tool',
                ],
                verification_sql: `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = '${table_name}';`,
                next_steps: [
                  'Create policies using security_create_policy after enabling RLS',
                  'Test policies with different user contexts',
                ],
                note: 'RLS will block all operations until you create appropriate policies',
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
                operation: 'enable_rls',
                table: table_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_disable_rls': {
      const { table_name } = args;
      
      try {
        const sql = `ALTER TABLE ${table_name} DISABLE ROW LEVEL SECURITY`;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'disable_rls',
                table: table_name,
                message: `Row Level Security disabled for table '${table_name}'`,
                sql_command: sql,
                note: 'Execute this SQL command manually in Supabase SQL Editor',
                warning: 'Disabling RLS removes all row-level access controls. Data will be accessible based on column-level permissions only.',
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
                operation: 'disable_rls',
                table: table_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_create_policy': {
      const { table_name, policy_name, command, roles = ['authenticated'], using_expression, with_check_expression } = args;
      
      try {
        // Build the CREATE POLICY SQL statement
        let sql = `CREATE POLICY "${policy_name}" ON ${table_name}`;
        
        // Add command
        sql += `\n  FOR ${command}`;
        
        // Add roles
        if (roles.length > 0) {
          sql += `\n  TO ${roles.join(', ')}`;
        }
        
        // Add USING clause
        if (using_expression) {
          sql += `\n  USING (${using_expression})`;
        }
        
        // Add WITH CHECK clause
        if (with_check_expression) {
          sql += `\n  WITH CHECK (${with_check_expression})`;
        }
        
        sql += ';';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'create_policy',
                table: table_name,
                policy: policy_name,
                command: command,
                roles: roles,
                sql_command: sql,
                message: `Policy '${policy_name}' ready to be created`,
                execution_steps: [
                  '1. Copy the SQL command below',
                  '2. Go to Supabase Dashboard > SQL Editor', 
                  '3. Paste and execute the SQL',
                  '4. Test the policy with security_test_policy',
                ],
                examples: {
                  user_owns_record: 'auth.uid() = user_id',
                  public_readable: 'true',
                  admin_only: 'auth.jwt() ->> \'role\' = \'admin\'',
                  team_member: 'team_id IN (SELECT team_id FROM user_teams WHERE user_id = auth.uid())',
                },
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
                operation: 'create_policy',
                table: table_name,
                policy: policy_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_drop_policy': {
      const { table_name, policy_name } = args;
      
      try {
        const sql = `DROP POLICY IF EXISTS "${policy_name}" ON ${table_name};`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'drop_policy',
                table: table_name,
                policy: policy_name,
                sql_command: sql,
                message: `Policy '${policy_name}' ready to be dropped`,
                execution_steps: [
                  '1. Execute the SQL command in Supabase SQL Editor',
                  '2. Verify with security_list_policies',
                ],
                warning: 'Dropping a policy may affect data access. Ensure other policies cover the access patterns.',
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
                operation: 'drop_policy',
                table: table_name,
                policy: policy_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_list_policies': {
      const { table_name } = args;
      
      try {
        // Query to get policies information
        const sql = `
          SELECT 
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
          FROM pg_policies 
          WHERE tablename = '${table_name}'
          ORDER BY policyname;
        `;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'list_policies',
                table: table_name,
                sql_query: sql,
                message: `Policies for table '${table_name}' query ready`,
                execution_steps: [
                  '1. Execute the SQL query in Supabase SQL Editor',
                  '2. Review the policy details',
                ],
                policy_columns: {
                  policyname: 'Name of the policy',
                  permissive: 'PERMISSIVE or RESTRICTIVE',
                  roles: 'Roles the policy applies to',
                  cmd: 'Command type (SELECT, INSERT, UPDATE, DELETE)',
                  qual: 'USING expression',
                  with_check: 'WITH CHECK expression',
                },
                note: 'Use sql_execute tool with this query to get actual results',
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
                operation: 'list_policies',
                table: table_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_check_rls_status': {
      const { table_name } = args;
      
      try {
        const sql = table_name 
          ? `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = '${table_name}';`
          : `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'check_rls_status',
                table: table_name || 'all_tables',
                sql_query: sql,
                message: 'RLS status query ready',
                execution_steps: [
                  '1. Execute the SQL query in Supabase SQL Editor',
                  '2. Check the rowsecurity column (t = enabled, f = disabled)',
                ],
                column_explanation: {
                  schemaname: 'Database schema name',
                  tablename: 'Table name',
                  rowsecurity: 'true if RLS is enabled, false if disabled',
                },
                note: 'Use sql_execute tool with this query to get actual results',
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
                operation: 'check_rls_status',
                table: table_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'security_test_policy': {
      const { table_name, test_query, user_context = {} } = args;
      
      try {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'test_policy',
                table: table_name,
                test_query: test_query,
                user_context: user_context,
                message: 'Policy testing guidance provided',
                testing_approaches: {
                  manual_testing: [
                    '1. Use different user accounts to test access',
                    '2. Execute queries in Supabase SQL Editor with different auth contexts',
                    '3. Use SET statement to simulate different users: SET request.jwt.claims TO \'{"sub":"user-id"}\'',
                  ],
                  programmatic_testing: [
                    '1. Use different Supabase client instances with different auth tokens',
                    '2. Test with authenticated and anonymous users',
                    '3. Verify both allowed and blocked scenarios',
                  ],
                },
                common_test_scenarios: [
                  'SELECT queries with different user IDs',
                  'INSERT attempts with invalid data',
                  'UPDATE attempts on other users\' data',
                  'DELETE attempts on protected records',
                ],
                debugging_tips: [
                  'Check auth.uid() returns expected user ID',
                  'Verify JWT claims are correct',
                  'Test with both authenticated and anonymous contexts',
                  'Use EXPLAIN to see query execution plan',
                ],
                note: 'Policy testing requires actual user authentication contexts. Use Supabase auth methods to create test scenarios.',
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
                operation: 'test_policy',
                table: table_name,
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown security tool: ${name}`);
  }
}