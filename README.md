# Supabase MCP Server

> A comprehensive Model Context Protocol server for self-hosted Supabase instances

I built this MCP server for my own needs when working with self-hosted Supabase instances and Claude. Figured it might be useful for others, so here it is! 🚀

This server provides **42 tools** covering everything from database operations to edge functions - basically everything you can do in the Supabase dashboard, but through Claude.

## What's This About?

When you're running your own Supabase instance and want Claude to help you manage it, the existing tools are pretty limited. So I built this comprehensive MCP server that gives Claude full access to:

- 🔐 **Authentication** - User signup, login, session management
- 📊 **Database** - Full CRUD operations with smart query building
- 🔄 **Realtime** - Subscribe to changes, create channels, broadcast messages  
- 📁 **Storage** - File upload, download, bucket management
- 🛡️ **Security** - Row Level Security (RLS) policies and permissions
- ⚡ **Edge Functions** - Deploy, invoke, and manage serverless functions
- 🗂️ **Schema** - Explore tables, columns, and relationships
- 🔍 **SQL** - Raw SQL execution with smart fallbacks

## Features

- **Complete Dashboard Parity** - Pretty much everything you can do in Supabase Studio
- **Smart Error Handling** - Helpful troubleshooting tips when things go wrong
- **Multiple Fallbacks** - If one approach fails, it tries others automatically
- **Built-in Edge Functions** - Local Node.js serverless handler for testing
- **Enhanced SQL** - Client-side aggregation when raw SQL isn't available
- **TypeScript** - Fully typed for better development experience

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Configure Claude Desktop

Copy `mcp.json.example` to your Claude Desktop config and update it:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["/path/to/self-hosted-supabase-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "http://localhost:54321",
        "SUPABASE_ANON_KEY": "your_anon_key_here",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key_here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

And you're good to go! Claude will now have access to all 42 Supabase tools.

## Available Tools

### Connection & Auth (5 tools)
- `connection_test` - Test your Supabase connection
- `auth_signup` - Register new users
- `auth_login` - Authenticate users
- `auth_get_user` - Get current user info
- `auth_logout` - Sign out users

### Database Operations (6 tools)
- `db_select` - Query data with filters and sorting
- `db_insert` - Insert new records
- `db_update` - Update existing records
- `db_delete` - Delete records
- `db_upsert` - Insert or update (with conflict handling)
- `db_count` - Count records with filters

### Schema Exploration (3 tools)
- `schema_get_tables` - List all tables
- `schema_get_columns` - Get column information
- `schema_get_relations` - Explore foreign key relationships

### Storage Management (6 tools)
- `storage_list_buckets` - List storage buckets
- `storage_create_bucket` - Create new buckets
- `storage_delete_bucket` - Remove buckets
- `storage_list_files` - Browse files
- `storage_upload_file` - Upload files (base64)
- `storage_download_file` - Download files
- `storage_delete_file` - Remove files
- `storage_get_public_url` - Get public file URLs

### Edge Functions (4 tools)
- `edge_list_functions` - List deployed functions
- `edge_deploy_function` - Deploy new functions
- `edge_invoke_function` - Execute functions
- `edge_remove_function` - Clean up functions

### Realtime (3 tools)
- `realtime_subscribe` - Listen to database changes
- `realtime_channel_create` - Set up broadcast channels
- `realtime_broadcast` - Send messages to channels

### SQL & Advanced Queries (6 tools)
- `sql_execute` - Run SQL queries with smart parsing
- `sql_call_rpc` - Execute stored procedures
- `sql_aggregate` - COUNT, SUM, AVG, MIN, MAX operations
- `sql_execute_raw` - Raw SQL with multiple fallback methods
- `sql_aggregate_enhanced` - Advanced aggregation with client-side processing
- `sql_analyze_table` - Get detailed table statistics

### Security & RLS (6 tools)
- `security_check_rls_status` - Check Row Level Security status
- `security_enable_rls` - Enable RLS on tables
- `security_disable_rls` - Disable RLS
- `security_create_policy` - Create RLS policies
- `security_list_policies` - List existing policies
- `security_drop_policy` - Remove policies
- `security_test_policy` - Test policy effectiveness

## What Makes This Different?

Most MCP servers for databases are pretty basic. This one is different because:

1. **It actually works with self-hosted Supabase** - Many tools assume cloud Supabase
2. **Comprehensive coverage** - 42 tools covering every major Supabase feature  
3. **Smart fallbacks** - If the direct approach fails, it tries other methods
4. **Built-in edge functions** - Local Node.js serverless handler for testing
5. **Real troubleshooting help** - When something breaks, it tells you how to fix it

## Configuration Options

You can customize the server through environment variables:

- `SUPABASE_URL` - Your Supabase instance URL
- `SUPABASE_ANON_KEY` - Anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)
- `MCP_SERVER_NAME` - Custom server name (default: "supabase-mcp-server")
- `MCP_SERVER_VERSION` - Custom version (default: "1.0.0")

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode (watch for changes)
npm run dev

# Clean build artifacts
npm run clean
```

## Troubleshooting

### Connection Issues
- Make sure your Supabase instance is running
- Check if the URL and keys are correct
- Verify network connectivity to your Supabase instance

### Authentication Problems
- Email confirmation might be enabled but SMTP not configured
- Try disabling email confirmation in Supabase Dashboard
- Check if the user already exists

### SQL/Database Issues
- Some advanced SQL features require service role key
- RLS policies might be blocking access
- Use `db_select` instead of raw SQL for better compatibility

## Contributing

Found a bug or want to add a feature? Feel free to open an issue or PR! This started as a personal project, but I'm happy to collaborate.

## License

MIT - Use it however you want!

## Why I Built This

I was getting frustrated with the limited Supabase integrations available for Claude, especially for self-hosted instances. Wanted something comprehensive that could handle everything I throw at it. Hope it helps you too!

---

