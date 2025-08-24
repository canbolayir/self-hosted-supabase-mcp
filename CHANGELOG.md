# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-01-XX

### Initial Release

Built a comprehensive MCP server for self-hosted Supabase instances. Started as a personal project because existing solutions were too limited for my needs.

#### Features Added
- **42 comprehensive tools** covering all major Supabase functionality
- **Authentication system** - Complete user management (signup, login, sessions)
- **Database operations** - Full CRUD with smart query building
- **Storage management** - File operations, bucket management
- **Edge Functions** - Local Node.js serverless handler + deployment
- **Realtime capabilities** - Subscriptions, channels, broadcasting
- **Security & RLS** - Row Level Security policy management  
- **Schema exploration** - Tables, columns, relationships
- **Advanced SQL** - Raw queries with multiple fallback strategies
- **Enhanced error handling** - Helpful troubleshooting guidance
- **TypeScript support** - Fully typed for better DX

#### Technical Highlights
- Built-in Node.js serverless handler for edge function testing
- Smart fallback mechanisms for SQL operations
- Client-side query processing when direct SQL fails
- Comprehensive error categorization and troubleshooting
- Support for both anonymous and service role keys

#### Tools Included
- **Connection (1):** connection_test  
- **Auth (4):** signup, login, get_user, logout
- **Database (6):** select, insert, update, delete, upsert, count
- **Schema (3):** get_tables, get_columns, get_relations
- **Storage (6):** list/create/delete buckets, upload/download/delete files, get URLs
- **Edge Functions (4):** list, deploy, invoke, remove
- **Realtime (3):** subscribe, channel_create, broadcast
- **SQL (6):** execute, call_rpc, aggregate, execute_raw, aggregate_enhanced, analyze_table
- **Security (6):** RLS enable/disable, policy create/list/drop, test_policy

### Known Limitations
- Some SQL features require service role key permissions
- Edge function deployment works best with simple function patterns
- Auth signup requires SMTP configuration or disabled email confirmation
- Built primarily for self-hosted instances (cloud Supabase might work but not tested extensively)

---

*This is the first release after building it for personal use. Planning to iterate based on feedback and real-world usage.*
