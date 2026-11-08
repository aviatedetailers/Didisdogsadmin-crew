# Didi's Dogs Admin

Inventory and crew hours for Didi's Dogs by Romanian.

- `admin/` – owner: Inventory, Buy Soon, Hours, Workers
- `crew/` – workers: sign up, log hours
- `setup.sql` – paste once into Supabase SQL Editor and Run
- `config.js` – Supabase project URL + publishable (anon) key

The first account created becomes the owner. Everyone after that is approved by the owner on the Workers tab.

Database changes after the first setup live in `migrations/` (run in order).
