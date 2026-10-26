-- Report a single chat message (App Review, Guideline 1.2). The enum value has its own file because Postgres can't use
-- a new value in the transaction that adds it; 20261026000002_report_messages.sql uses it.

alter type public.report_context add value if not exists 'message';
