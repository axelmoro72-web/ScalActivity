-- Inscription ouverte, mais réservée aux adresses professionnelles.
--
-- La vérification du formulaire ne suffit pas : l'API d'inscription de
-- Supabase est joignable directement avec la clé anon, publique par
-- nature. Ce trigger est la seule garantie côté serveur.
--
-- Les comptes créés avant cette migration ne sont pas touchés, et les
-- invitations (admin.inviteUserByEmail) passent par le même chemin :
-- elles devront elles aussi viser une adresse @scalian.com.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) not like '%@scalian.com' then
    raise exception 'domaine_non_autorise'
      using hint = 'Seules les adresses @scalian.com peuvent créer un compte.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_domain on auth.users;

create trigger on_auth_user_email_domain
  before insert on auth.users
  for each row execute function public.enforce_email_domain();
