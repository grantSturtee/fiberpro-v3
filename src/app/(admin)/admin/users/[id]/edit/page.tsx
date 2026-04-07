import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { UserEditForm } from "@/components/admin/UserEditForm";

export const metadata: Metadata = { title: "Edit User" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function AdminUserEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const backHref = returnTo || "/admin/users";

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("user_profiles")
    .select("id, display_name, email, role")
    .eq("id", id)
    .single();

  if (!user) notFound();

  const isCompanyUser = ["company_admin", "project_manager"].includes(user.role as string);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          {isCompanyUser ? (
            <Link href="/admin/companies" className="hover:text-primary transition-colors">Companies</Link>
          ) : (
            <Link href="/admin/users" className="hover:text-primary transition-colors">Users</Link>
          )}
          <span>/</span>
          <span className="text-ink">Edit User</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit User</h1>
        <p className="mt-0.5 text-sm text-muted">{user.display_name}</p>
      </div>

      <SectionCard>
        <UserEditForm
          user={user as { id: string; display_name: string; email: string | null; role: string }}
          returnTo={backHref}
        />
      </SectionCard>
    </div>
  );
}
