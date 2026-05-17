---
name: supabase-postgres-best-practices
description: Apply Supabase and PostgreSQL best practices to all database operations, edge functions, and queries. Use this skill when writing or reviewing database code, migrations, RLS policies, and edge function queries.
---

# Supabase & PostgreSQL Best Practices

Apply these practices to ALL database-related code in this project.

## Edge Functions

### Query Patterns
- Always use `.maybeSingle()` instead of `.single()` when the row might not exist
- Always check for errors: `const { data, error } = await supabase.from(...)` 
- Use `.select()` with specific columns, not `*` (except when you need all)
- Add `.limit()` to prevent unbounded queries
- Use `.eq("user_id", userId)` on EVERY query for multi-tenant safety
- Use `count: "exact"` with `head: true` when you only need the count

### Error Handling
```typescript
// GOOD
const { data, error } = await supabase.from("leads").select("id, name").eq("id", leadId).maybeSingle();
if (error) throw error;
if (!data) return notFound();

// BAD
const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();
```

### Inserts
- Always specify all required columns
- Use `.insert({...}).select()` when you need the inserted row back
- Validate data before inserting (never trust external input)
- Use upsert with `onConflict` when appropriate

### Updates
- Always filter with `.eq()` — never update without a WHERE clause
- Include `updated_at: new Date().toISOString()` on every update
- Use `.update({...}).eq("id", id)` pattern

## Database Design

### Tables
- Every table has: `id` (uuid, PK), `created_at` (timestamptz), `updated_at` (timestamptz)
- Use `user_id` (uuid, FK to auth.users) for multi-tenant isolation
- Use `deleted_at` (timestamptz, nullable) for soft deletes — never hard delete
- Use enums or check constraints for status fields

### Indexes
- Index every column used in WHERE clauses
- Composite index for multi-column filters: `(user_id, status)`, `(lead_id, agent_slug)`
- Partial indexes for common filters: `WHERE deleted_at IS NULL`

### RLS (Row Level Security)
- Enable RLS on EVERY table
- Default deny: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
- Policy pattern: `USING (user_id = auth.uid())`
- Service role bypasses RLS — use only in edge functions

## Migrations

### Naming
- Format: `YYYYMMDDHHMMSS_description.sql`
- Descriptive: `20260516_add_agent_conversations_status_index.sql`

### Safety
- Always use `IF NOT EXISTS` for CREATE TABLE/INDEX
- Always use `IF EXISTS` for DROP
- Never drop columns in production without a migration plan
- Add columns as nullable first, backfill, then add NOT NULL if needed

### Performance
- Add `CONCURRENTLY` to index creation in production
- Use `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` (instant in PG12+)
- Avoid locking operations on large tables

## Edge Function Patterns

### Authentication
```typescript
// Service role for edge functions (bypasses RLS)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
```

### Response Format
```typescript
// Standard success
return new Response(JSON.stringify({ ok: true, data }), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// Standard error
return new Response(JSON.stringify({ ok: false, error: msg }), {
  status: 500,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

### CORS
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always handle OPTIONS
if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
```

## Common Pitfalls to Avoid
- ❌ Using `.single()` on queries that might return 0 rows (crashes)
- ❌ Forgetting `user_id` filter (data leak between users)
- ❌ Not handling null/undefined from `.maybeSingle()` 
- ❌ Hardcoding secrets in code (use env vars)
- ❌ Missing CORS headers (frontend can't call)
- ❌ Not awaiting async operations (silent failures)
- ❌ Using `SELECT *` in hot paths (wastes bandwidth)
- ❌ Missing error handling on `.functions.invoke()` calls
