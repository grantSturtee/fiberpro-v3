import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  SubmitProjectForm,
  type CompanyMember,
  type CompanyRole,
} from "./SubmitProjectForm";

export const metadata: Metadata = { title: "Submit Project" };

export default async function CompanySubmitPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const userId = userData.user.id;

  // Submitter profile — display label fallback chain
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, email")
    .eq("id", userId)
    .single();

  const submitterLabel =
    profile?.display_name?.trim() ||
    profile?.email?.trim() ||
    userData.user.email ||
    "You";

  // Submitter's company membership: role
  const { data: membershipRow } = await supabase
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .single();

  const membership = membershipRow as
    | { company_id: string; role: string }
    | null;

  let role: CompanyRole = "project_manager";
  let companyId: string | null = null;
  let allowedStates: string[] | null = null;
  let projectManagers: CompanyMember[] = [];

  if (membership) {
    companyId = membership.company_id;
    role = membership.role === "company_admin" ? "company_admin" : "project_manager";

    const serviceClient = createServiceClient();

    const [{ data: companyData }, { data: memberRows }] = await Promise.all([
      supabase
        .from("companies")
        .select("allowed_states")
        .eq("id", companyId)
        .single(),
      serviceClient
        .from("company_memberships")
        .select("user_id, role")
        .eq("company_id", companyId)
        .eq("role", "project_manager"),
    ]);

    allowedStates = (companyData?.allowed_states as string[] | null | undefined) ?? null;

    type RawMember = { user_id: string; role: string };
    const rawMembers = (memberRows ?? []) as RawMember[];
    const memberUserIds = Array.from(new Set(rawMembers.map((m) => m.user_id)));

    type ProfileRow = {
      id: string;
      display_name: string | null;
      email: string | null;
    };
    const profileMap = new Map<string, ProfileRow>();
    if (memberUserIds.length > 0) {
      const { data: profilesData } = await serviceClient
        .from("user_profiles")
        .select("id, display_name, email")
        .in("id", memberUserIds);
      for (const p of (profilesData ?? []) as ProfileRow[]) {
        profileMap.set(p.id, p);
      }
    }

    for (const m of rawMembers) {
      const p = profileMap.get(m.user_id);
      const displayName = p?.display_name?.trim() || null;
      const email = p?.email?.trim() || null;
      const label = displayName || email || "(unnamed user)";
      projectManagers.push({
        userId: m.user_id,
        displayName,
        email,
        label,
      });
    }

    projectManagers.sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5 mb-2">
          <Link href="/company" className="text-xs text-muted hover:text-dim transition-colors">
            Dashboard
          </Link>
          <span className="text-xs text-faint">/</span>
          <span className="text-xs text-muted">Submit Project</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Submit a New Project</h1>
        <p className="mt-1 text-sm text-muted">
          Complete all required fields. No draft saving — submit when ready.
        </p>
      </div>

      <SubmitProjectForm
        role={role}
        currentUserLabel={submitterLabel}
        projectManagers={projectManagers}
        allowedStates={allowedStates}
      />
    </div>
  );
}
