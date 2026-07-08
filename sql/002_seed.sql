-- Seed demo data for local development

-- demo business (fixed UUID for reproducibility)
insert into businesses (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Salon')
on conflict (id) do nothing;

-- demo services
insert into services (business_id, name, category, price)
values
  ('00000000-0000-0000-0000-000000000001', 'Signature Balayage', 'Hair', 3200),
  ('00000000-0000-0000-0000-000000000001', 'Precision Cut & Style', 'Hair', 1200),
  ('00000000-0000-0000-000000000001', 'Organic Color Melt', 'Hair', 2500),
  ('00000000-0000-0000-0000-000000000001', 'Keratin Silk Treatment', 'Hair', 1800)
on conflict do nothing;

-- demo daily operations (few rows)
insert into daily_operations (business_id, service_id, date, quantity, revenue)
values
  ('00000000-0000-0000-0000-000000000001', 1, '2025-01-15', 3, 9600),
  ('00000000-0000-0000-0000-000000000001', 2, '2025-01-16', 5, 6000),
  ('00000000-0000-0000-0000-000000000001', 1, '2025-02-05', 2, 6400),
  ('00000000-0000-0000-0000-000000000001', 3, '2025-03-12', 1, 2500)
on conflict do nothing;
