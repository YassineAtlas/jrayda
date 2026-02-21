# Setup Supabase (GitHub Pages)

## 1) Configurer Supabase

1. Cree un projet Supabase.
2. Va dans `SQL Editor` et execute `supabase/schema.sql`.
3. Dans `Authentication > Providers`, laisse `Email` actif.
4. Dans `Authentication > URL Configuration`, ajoute:
   - `Site URL`: l'URL de ton site GitHub Pages
   - `Redirect URLs`: l'URL exacte de `famille.html` (exemple `https://ton-user.github.io/ton-repo/famille.html`)

## 2) Autoriser les emails de la famille

Ajoute les adresses autorisees dans `family_emails`:

```sql
insert into public.family_emails (email)
values
  ('prenom1@mail.com'),
  ('prenom2@mail.com');
```

## 3) Relier le front au projet

Edite `supabase-config.js`:

```js
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";
```

Tu trouves ces valeurs dans `Project Settings > API`.

## 4) Deploy

Commit/push puis laisse GitHub Pages redeployer.

## 5) Utilisation

1. Ouvre `famille.html`.
2. Entre l'email famille.
3. Clique le lien recu par mail.
4. Ajoute/modifie/supprime tes semis.

Regles appliquees:
- Public: voit seulement les fiches plantes (`index.html`/`plant.html`).
- Famille connectee: voit tous les semis.
- Chaque membre: modifie/supprime seulement ses propres semis.
