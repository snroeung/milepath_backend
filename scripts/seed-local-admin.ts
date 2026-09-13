import "dotenv/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Run after every `supabase start` / `supabase db reset` — auth.users is
// wiped on reset, so this needs reseeding each time.
const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@covelo.local";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "local-admin-password";

async function findUserByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function main() {
  const supabase = getSupabaseAdmin();

  let user = await findUserByEmail(supabase, email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created local admin user ${email} (${user.id})`);
  } else {
    console.log(`Found existing local admin user ${email} (${user.id})`);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { role: "admin" },
  });
  if (updateError) throw updateError;

  console.log(`Set app_metadata.role = "admin" for ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
