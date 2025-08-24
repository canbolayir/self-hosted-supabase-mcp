import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';
import { NodeJSServerlessHandler } from '../nodejs-serverless-handler.js';

// Global Node.js serverless handler instance for self-hosted Supabase
const nodeJSHandler = new NodeJSServerlessHandler();

export function getEdgeFunctionTools(): Tool[] {
  return [
    {
      name: 'edge_invoke_function',
      description: 'Invoke a Supabase Edge Function',
      inputSchema: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Name of the edge function to invoke',
          },
          payload: {
            type: 'object',
            description: 'Payload to send to the function',
            additionalProperties: true,
          },
          headers: {
            type: 'object',
            description: 'Additional headers to send',
            additionalProperties: {
              type: 'string',
            },
          },
        },
        required: ['function_name'],
      },
    },
    {
      name: 'edge_list_functions',
      description: 'List available Edge Functions',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'edge_deploy_function',
      description: 'Deploy an Edge Function to Supabase',
      inputSchema: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Name of the function to deploy',
          },
          function_code: {
            type: 'string',
            description: 'TypeScript/JavaScript code for the function',
          },
          import_map: {
            type: 'object',
            description: 'Import map for dependencies (optional)',
            additionalProperties: true,
          },
        },
        required: ['function_name', 'function_code'],
      },
    },
    {
      name: 'edge_remove_function',
      description: 'Remove an Edge Function from local serverless handler',
      inputSchema: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Name of the function to remove',
          },
        },
        required: ['function_name'],
      },
    },
  ];
}

export async function handleEdgeFunctionTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getClient();
  const config = supabaseClient.getConfig();

  switch (name) {
    case 'edge_invoke_function': {
      const { function_name, payload = {}, headers = {} } = args;
      
      try {
        // First, try to invoke using Node.js serverless handler
        const localExecution = await nodeJSHandler.executeFunction(
          function_name,
          payload,
          headers
        );
        
        if (localExecution.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  function: function_name,
                  operation: 'invoke_function',
                  data: localExecution.data,
                  execution_details: {
                    runtime: localExecution.runtime,
                    execution_time_ms: localExecution.executionTime,
                    status_code: localExecution.statusCode,
                    timestamp: localExecution.timestamp,
                    handler_type: 'nodejs_serverless',
                  },
                  payload_sent: payload,
                  headers_sent: headers,
                  note: 'Function executed successfully using Node.js serverless handler',
                }, null, 2),
              },
            ],
          };
        }
        
        // If local execution failed, try Supabase client as fallback
        const { data, error } = await client.functions.invoke(function_name, {
          body: payload,
          headers,
        });

        if (error) {
          // Provide comprehensive help including local serverless handler
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  function: function_name,
                  operation: 'invoke_function',
                  local_error: localExecution.error,
                  supabase_error: error.message,
                  available_local_functions: localExecution.availableFunctions || [],
                  deployment_help: {
                    function_status: 'not_deployed',
                    deploy_locally: 'Use edge_deploy_function tool to deploy to Node.js serverless handler',
                    deploy_via_cli: [
                      `supabase functions new ${function_name}`,
                      `# Write your function code in supabase/functions/${function_name}/index.ts`,
                      `supabase functions deploy ${function_name}`,
                    ],
                    test_endpoint: `${config.url.replace('/rest', '')}/functions/v1/${function_name}`,
                    example_function_code: `export default async (req: Request): Promise<Response> => {
  const { message } = await req.json()
  return new Response(
    JSON.stringify({ 
      message: "Hello from ${function_name}!", 
      received: message,
      timestamp: new Date().toISOString()
    }),
    { headers: { "Content-Type": "application/json" } }
  )
}`,
                  },
                  note: 'Function not found in Node.js serverless handler or Supabase instance. Deploy it first using edge_deploy_function.'
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
                function: function_name,
                operation: 'invoke_function',
                data: data,
                payload_sent: payload,
                headers_sent: headers,
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
                operation: 'invoke_function',
                troubleshooting: {
                  common_issues: [
                    'Function not deployed',
                    'Function name mismatch', 
                    'CORS issues',
                    'Authentication problems',
                  ],
                  check_deployment: 'supabase functions list',
                  test_locally: 'supabase functions serve --debug',
                },
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'edge_list_functions': {
      try {
        // Get functions from Node.js serverless handler
        const localFunctions = nodeJSHandler.listFunctions();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'list_functions',
                local_functions: localFunctions,
                total_local_functions: localFunctions.length,
                deployment_info: {
                  local_handler_status: 'active',
                  total_functions: localFunctions.length,
                  cli_commands: [
                    'supabase functions new my-function',
                    'supabase functions deploy my-function',
                    'supabase functions list',
                  ],
                  dashboard_url: `${config.url.replace('/rest', '')}/project/_/functions`,
                },
                function_details: localFunctions.map(func => ({
                  name: func.name,
                  deployed_at: func.deployedAt,
                  status: func.status,
                  has_import_map: func.hasImportMap,
                  code_size_bytes: func.codeLength,
                  invoke_command: `Use edge_invoke_function with function_name: '${func.name}'`,
                })),
                common_examples: [
                  { name: 'hello-world', description: 'Basic HTTP function', example_payload: { message: 'Hello' } },
                  { name: 'webhook-handler', description: 'Process webhooks', example_payload: { event: 'user.created', data: {} } },
                  { name: 'image-processor', description: 'Process uploaded images', example_payload: { image_url: 'https://example.com/image.jpg' } },
                  { name: 'email-sender', description: 'Send transactional emails', example_payload: { to: 'user@example.com', subject: 'Hello' } },
                ],
                                  note: localFunctions.length > 0
                  ? `Found ${localFunctions.length} function(s) in Node.js serverless handler. Use edge_invoke_function to execute them.`
                  : 'No functions deployed to Node.js serverless handler yet. Use edge_deploy_function to deploy your first function.'
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
                operation: 'list_functions',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'edge_deploy_function': {
      const { function_name, function_code, import_map = {} } = args;
      
      try {
        const config = supabaseClient.getConfig();
        
        // Extract project reference from URL
        const projectRef = config.url.split('/')[2].split('.')[0];
        
        // Check if we have management API token
        const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
        
        if (!managementToken) {
          // Use built-in Node.js serverless handler for self-hosted Supabase
          const deployResult = await nodeJSHandler.deployFunction(
            function_name,
            function_code,
            import_map
          );
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: deployResult.success,
                  operation: 'deploy_function',
                  function: function_name,
                  status: deployResult.success ? 'deployed_locally' : 'error',
                  message: deployResult.message || deployResult.error,
                  deployment_type: 'nodejs_serverless_handler',
                  function_url: deployResult.functionUrl,
                  execution_runtime: deployResult.executionRuntime,
                  deployed_at: deployResult.deployedAt,
                  function_code_length: function_code.length,
                  import_map_size: Object.keys(import_map).length,
                  alternative_options: {
                    management_api: [
                      '1. Get Management API token from Supabase Dashboard > Settings > Access Tokens',
                      '2. Set environment variable: export SUPABASE_MANAGEMENT_TOKEN=sbp_xxx',
                      '3. Re-run this tool for cloud deployment',
                    ],
                    cli_deployment: `supabase functions deploy ${function_name} --project-ref ${projectRef}`,
                  },
                  note: deployResult.success
                    ? 'Function deployed successfully to built-in serverless handler. Use edge_invoke_function to test it!'
                    : 'Function deployment failed. Check the error message above.',
                }, null, 2),
              },
            ],
          };
        }

        // Create multipart form data for deployment
        const formData = new FormData();
        
        // Add metadata
        const metadata = {
          entrypoint_path: 'index.ts',
          name: function_name,
          import_map: Object.keys(import_map).length > 0 ? import_map : undefined,
        };
        formData.append('metadata', JSON.stringify(metadata));
        
        // Add function code as file
        const blob = new Blob([function_code], { type: 'text/typescript' });
        formData.append('file', blob, 'index.ts');

        // Deploy via Supabase Management API
        const deployUrl = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${function_name}`;
        
        const response = await fetch(deployUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${managementToken}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  operation: 'deploy_function',
                  function: function_name,
                  error: `Deployment failed: ${response.status} ${response.statusText}`,
                  details: errorText,
                  troubleshooting: {
                    check_token: 'Verify SUPABASE_MANAGEMENT_TOKEN is valid and has function deployment permissions',
                    check_project: `Verify project reference: ${projectRef}`,
                    check_code: 'Verify function code syntax is valid TypeScript/JavaScript',
                  },
                }, null, 2),
              },
            ],
          };
        }

        const result = await response.json();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'deploy_function',
                function: function_name,
                status: 'deployed',
                message: `Function '${function_name}' deployed successfully`,
                deployment_result: result,
                function_url: `${config.url.replace('/rest', '')}/functions/v1/${function_name}`,
                test_command: `curl -X POST ${config.url.replace('/rest', '')}/functions/v1/${function_name}`,
                next_steps: [
                  'Test the function using edge_invoke_function tool',
                  'Monitor logs with: supabase logs --type edge',
                  'Update function by deploying again with same name',
                ],
                note: 'Function deployed via Supabase Management API',
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
                operation: 'deploy_function',
                troubleshooting: {
                  common_issues: [
                    'Invalid SUPABASE_MANAGEMENT_TOKEN',
                    'Network connectivity issues',
                    'Function code syntax errors',
                    'Project permissions',
                  ],
                  setup_commands: [
                    'Get token from: Supabase Dashboard > Settings > Access Tokens',
                    'export SUPABASE_MANAGEMENT_TOKEN=sbp_your_token',
                  ],
                },
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'edge_remove_function': {
      const { function_name } = args;
      
      try {
        const removed = await nodeJSHandler.removeFunction(function_name);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: removed,
                operation: 'remove_function',
                function: function_name,
                message: removed
                  ? `Function '${function_name}' removed successfully from Node.js serverless handler`
                  : `Function '${function_name}' not found in Node.js serverless handler`,
                remaining_functions: nodeJSHandler.listFunctions().map(f => f.name),
                                  note: removed
                  ? 'Function and associated files have been cleaned up from Node.js handler'
                  : 'No action taken - function was not deployed to Node.js handler',
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
                operation: 'remove_function',
              }, null, 2),
            },
          ],
        };
      }
    }
    
    default:
      throw new Error(`Unknown edge function tool: ${name}`);
  }
}