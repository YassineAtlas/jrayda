# Setup Supabase (GitHub Pages)

## 1) Configurer Supabase

1. Cree un projet Supabase.
2. Va dans `SQL Editor` et execute `supabase/schema.sql`.
   - Si ton projet etait deja configure avant, re-execute ce fichier (il contient aussi:
     - migration `event_date` pour le suivi
     - regles SQL anti-dates futures sur semis/suivi)
3. Dans `Authentication > Providers > Email`, active:
   - `Enable Email Signup`
   - `Enable Email Confirmations`
   - `Enable Email/Password Sign In`
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
2. Premiere fois: utilise `Recevoir un lien par email`.
3. Une fois connecte, clique `Changer le mot de passe`, enregistre ton mot de passe, puis reviens aux semis.
4. Ensuite, connecte-toi avec `email + mot de passe` (sans lien email).
5. Quand tu crees un semis:
   - choisis une plante existante (liste issue de `seeds.json`)
   - la semaine actuelle est calculee automatiquement depuis la date de semis (non modifiable a la creation)
6. Ouvre un semis via `Ouvrir le semis` pour ajouter des photos/commentaires avec 3 modes:
   - date actuelle
   - date choisie
   - semaine choisie
7. Dans `plant.html`, onglet `Semis` affiche les semis de la plante courante et propose `Ajouter un semis de cette plante`.

Regles appliquees:
- Public: voit seulement les fiches plantes (`index.html`/`plant.html`).
- Famille connectee: voit tous les semis.
- Chaque membre: modifie/supprime seulement ses propres semis.
- Seul le createur d'un semis peut ajouter/supprimer ses updates de suivi (photos/commentaires).
