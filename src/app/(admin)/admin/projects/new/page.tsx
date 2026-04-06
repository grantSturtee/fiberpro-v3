import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { NewProjectForm } from "./NewProjectForm";

export const metadata: Metadata = { title: "New Project" };

export default async function AdminNewProjectPage() {
  const supabase = await createClient();

  const { data: companiesData } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  const companies = (companiesData ?? []) as { id: string; name: string }[];

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/projects" className="hover:text-primary transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-ink">New Project</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">New Project</h1>
        <p className="mt-0.5 text-sm text-muted">Create a project on behalf of a client company.</p>
      </div>

      <SectionCard>
        <NewProjectForm companies={companies} />
      </SectionCard>
    </div>
  );
}
