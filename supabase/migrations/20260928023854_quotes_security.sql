-- The sequence is only touched by the private numbering trigger, never by the Data API.
create policy arpe_quote_sequences_no_direct_access on public.arpe_quote_sequences
for all to authenticated using (false) with check (false);
