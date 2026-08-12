# Code Review Rules

## JavaScript & React
- Use functional components with hooks
- Use modern ES6+ syntax and clean module imports
- Ensure accessible UI and dark theme Tailwind styling

## Supabase & PostgreSQL
- Use SECURITY DEFINER RPCs with explicit `SET search_path = public, pg_temp`
- Enforce strict Row Level Security (RLS) policies on public tables
- Maintain atomic transaction ledger for financial operations
