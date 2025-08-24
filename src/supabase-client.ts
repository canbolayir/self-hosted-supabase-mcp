import { createClient, SupabaseClient as SupabaseJS, User, Session } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export class SupabaseClient {
  private client: SupabaseJS;
  private adminClient: SupabaseJS;
  private config: SupabaseConfig;
  private currentUser: User | null = null;
  private currentSession: Session | null = null;

  constructor() {
    this.config = this.loadConfig();
    
    // Regular client for user operations
    this.client = createClient(this.config.url, this.config.anonKey);
    
    // Admin client for service operations
    this.adminClient = createClient(this.config.url, this.config.serviceRoleKey);
    
    // Listen for auth changes
    this.client.auth.onAuthStateChange((event, session) => {
      this.currentSession = session;
      this.currentUser = session?.user || null;
    });
  }

  private loadConfig(): SupabaseConfig {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    return { url, anonKey, serviceRoleKey };
  }

  // Get the regular client (for user operations)
  getClient(): SupabaseJS {
    return this.client;
  }

  // Get the admin client (for service operations)
  getAdminClient(): SupabaseJS {
    return this.adminClient;
  }

  // Get config for direct API calls
  getConfig(): SupabaseConfig {
    return this.config;
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Get current session
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  // Test connection
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      // Test with a simple health check endpoint
      const response = await fetch(`${this.config.url}/rest/v1/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.serviceRoleKey}`,
          'apikey': this.config.serviceRoleKey,
        },
      });

      if (response.ok) {
        return { connected: true, message: 'Connection successful' };
      } else {
        return { connected: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return { 
        connected: false, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Get connection status
  getConnectionStatus(): {
    url: string;
    authenticated: boolean;
    user: string | null;
  } {
    return {
      url: this.config.url,
      authenticated: this.isAuthenticated(),
      user: this.currentUser?.email || null,
    };
  }
}