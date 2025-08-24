import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function getAuthTools(): Tool[] {
  return [
    {
      name: 'auth_login',
      description: 'Login user with email and password',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'User email address',
          },
          password: {
            type: 'string',
            description: 'User password',
          },
        },
        required: ['email', 'password'],
      },
    },
    {
      name: 'auth_signup',
      description: 'Register a new user with email and password',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'User email address',
          },
          password: {
            type: 'string',
            description: 'User password',
          },
          options: {
            type: 'object',
            description: 'Additional signup options (metadata etc.)',
            additionalProperties: true,
          },
        },
        required: ['email', 'password'],
      },
    },
    {
      name: 'auth_get_user',
      description: 'Get current authenticated user information',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'auth_logout',
      description: 'Logout current user',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

export async function handleAuthTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getClient();

  switch (name) {
        case 'auth_signup': {
      const { email, password, options } = args;
      
      try {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options,
        });

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'signup',
                  troubleshooting: {
                    email_confirmation_issues: [
                      'SMTP not configured in Supabase project',
                      'Email confirmation disabled in auth settings',
                      'Invalid email address format',
                    ],
                    solutions: [
                      'Check Supabase Dashboard > Authentication > Settings > SMTP Settings',
                      'Disable email confirmation for testing: "Enable email confirmations" = OFF',
                      'Use a valid, reachable email address',
                      'Check spam folder for confirmation emails',
                    ],
                    quick_test_setup: 'Disable "Enable email confirmations" in Supabase Auth settings for immediate testing',
                  },
                  auth_settings_path: 'Supabase Dashboard > Authentication > Settings > Email Auth',
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
                user: data.user ? {
                  id: data.user.id,
                  email: data.user.email,
                  created_at: data.user.created_at,
                  email_confirmed_at: data.user.email_confirmed_at,
                } : null,
                session: data.session ? {
                  access_token: 'present',
                  expires_at: data.session.expires_at,
                } : null,
                message: data.user?.email_confirmed_at ? 'User registered and confirmed' : 'User registered, check email for confirmation',
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
                operation: 'signup',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'auth_login': {
      const { email, password } = args;
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                operation: 'login',
                troubleshooting: {
                  common_issues: [
                    'User not registered in auth.users table',
                    'Email confirmation required but not completed',
                    'Password incorrect',
                    'User account disabled or locked',
                  ],
                  test_with_existing_user: 'Try with a user account you know exists in Supabase Auth',
                  create_test_user: 'Use auth_signup to create a test user first',
                  check_auth_settings: 'Verify auth settings in Supabase Dashboard > Authentication > Settings',
                },
                suggested_test_flow: [
                  '1. Create test user with auth_signup',
                  '2. Check email for confirmation (if required)',
                  '3. Try login with confirmed credentials',
                ],
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
              user: {
                id: data.user?.id,
                email: data.user?.email,
                created_at: data.user?.created_at,
              },
              session: {
                access_token: data.session?.access_token ? 'present' : 'missing',
                expires_at: data.session?.expires_at,
              },
            }, null, 2),
          },
        ],
      };
    }

    case 'auth_get_user': {
      try {
        const { data: { user }, error } = await client.auth.getUser();
        
        if (error || !user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  authenticated: false,
                  user: null,
                  error: error?.message || 'No authenticated user found',
                  operation: 'get_user',
                  troubleshooting: {
                    common_reasons: [
                      'User not logged in - no active session',
                      'Session expired or invalid',
                      'JWT token missing or corrupted',
                    ],
                    solutions: [
                      'Login first using auth_login tool',
                      'Check if login was successful',
                      'Verify session hasn\'t expired',
                    ],
                    test_flow: [
                      '1. Use auth_login to authenticate',
                      '2. Immediately try auth_get_user',
                      '3. Check session status',
                    ],
                  },
                  note: 'This tool requires an active authenticated session',
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
                authenticated: true,
                user: {
                  id: user.id,
                  email: user.email,
                  created_at: user.created_at,
                  email_confirmed_at: user.email_confirmed_at,
                  last_sign_in_at: user.last_sign_in_at,
                },
                session_info: {
                  user_id: user.id,
                  aud: user.aud,
                  role: user.role,
                },
                operation: 'get_user',
                note: 'User successfully retrieved from active session',
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
                authenticated: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'get_user',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'auth_logout': {
      try {
        const { error } = await client.auth.signOut();

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'logout',
                  troubleshooting: {
                    common_issues: [
                      'Already logged out - no active session',
                      'Network connectivity issues',
                      'Session invalidation problems',
                    ],
                    note: 'Logout may still succeed even if error occurs',
                  },
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
                operation: 'logout',
                message: 'Logged out successfully',
                note: 'Session has been terminated',
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
                operation: 'logout',
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown auth tool: ${name}`);
  }
}