alter table public.arpe_quotes
  add constraint arpe_quotes_id_business_unique unique (id, business_id);

alter table public.arpe_quote_costs
  add constraint arpe_quote_costs_quote_business_fk
  foreign key (quote_id, business_id) references public.arpe_quotes (id, business_id)
  on delete cascade;

alter table public.arpe_quote_cost_items
  add constraint arpe_quote_cost_items_quote_business_fk
  foreign key (quote_id, business_id) references public.arpe_quotes (id, business_id)
  on delete cascade;
