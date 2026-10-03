alter table public.arpe_businesses
  add column default_deposit_type text not null default 'percentage'
    check (default_deposit_type in ('percentage', 'fixed')),
  add column default_deposit_value numeric(12,2) not null default 50
    check (default_deposit_value >= 0 and default_deposit_value < 10000000000),
  add column default_document_format text not null default 'a4'
    check (default_document_format in ('a4', 'thermal80', 'thermal58')),
  add column show_slogan_on_documents boolean not null default true,
  add column show_description_on_documents boolean not null default true,
  add column show_whatsapp_on_documents boolean not null default true,
  add column show_email_on_documents boolean not null default true,
  add column show_address_on_documents boolean not null default true,
  add column document_footer_message text not null
    default 'Gracias por confiar en nosotros para este momento especial.'
    check (char_length(document_footer_message) <= 300);

alter table public.arpe_businesses
  add constraint arpe_businesses_default_deposit_percentage_check
    check (default_deposit_type <> 'percentage' or default_deposit_value <= 100);

grant update (
  default_deposit_type,
  default_deposit_value,
  default_document_format,
  show_slogan_on_documents,
  show_description_on_documents,
  show_whatsapp_on_documents,
  show_email_on_documents,
  show_address_on_documents,
  document_footer_message
) on public.arpe_businesses to authenticated;

update storage.buckets
set file_size_limit = 5242880
where id = 'arpe-business-logos';
