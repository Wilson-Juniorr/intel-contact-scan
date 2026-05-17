---
name: webapp-testing
description: Test web applications end-to-end. Use this skill before and after any code change to verify the application works correctly. Validates edge functions, API calls, database queries, and frontend behavior.
---

# Webapp Testing Skill

Execute comprehensive testing of the web application before and after every task.

## When to Use
- BEFORE starting any code change (baseline)
- AFTER completing any code change (validation)
- When the user asks to test or verify functionality

## Testing Checklist

### 1. Edge Functions (Supabase)
For each edge function modified:
- Verify TypeScript syntax is valid (no compile errors)
- Check all imports resolve correctly
- Verify environment variables are referenced (not hardcoded)
- Trace the full request flow: webhook → route-message → junior-sdr
- Verify error handling exists for every async operation
- Check that all database queries have proper filters (user_id, lead_id)

### 2. Flow Simulation (Mental Walkthrough)
Simulate every user scenario step by step:
- What happens when message arrives at webhook?
- What happens at each decision point?
- What response does the user get?
- What gets saved to the database?
- What notifications are sent?

### 3. Database Consistency
- Verify all referenced tables exist
- Verify all referenced columns exist
- Check that inserts match table schema
- Verify indexes exist for frequently queried columns

### 4. Frontend Components
- Check that components render without errors
- Verify API calls use correct endpoints
- Check loading/error states are handled
- Verify user feedback (toasts, notifications) works

### 5. Integration Points
- Webhook → route-message: verify payload format matches
- route-message → junior-sdr: verify all required fields are passed
- junior-sdr → send-whatsapp: verify message format
- send-whatsapp → UAZAPI: verify API contract

## How to Test

### Syntax Validation
```bash
# Check TypeScript/Deno syntax for edge functions
deno check supabase/functions/<function-name>/index.ts
```

### Flow Trace
For any inbound message, trace through:
1. `whatsapp-webhook/index.ts` — receives, saves, classifies, routes
2. `route-message/index.ts` — guards, gates, invokes SDR
3. `junior-sdr/index.ts` — state machine, LLM, critic, sends
4. `send-whatsapp/index.ts` — compliance, formats, delivers

### Regression Check
After any change, verify these scenarios still work:
- [ ] New lead with interest → Junior responds consultively
- [ ] Second message → Junior continues (not blocked)
- [ ] Lead returns after timeout → Conversation reactivated
- [ ] Personal contact → Not responded
- [ ] Outside hours → Message queued
- [ ] Opt-out detected → All automation stops

## Output Format
Report results as:
```
✅ [test name] — passed
❌ [test name] — FAILED: [reason]
⚠️ [test name] — WARNING: [concern]
```
