"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type TeamActionState = {
  error: string | null;
  success?: boolean;
};

// ── Auth helper ───────────────────────────────────────────────────────────────
// Returns the caller's company_id if they are a company_admin, else null.

async function getCallerCompanyAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .single();
  if (!data || data.role !== "company_admin") return null;
  return data.company_id;
}

// Valid roles in the company hierarchy
const VALID_COMPANY_ROLES = ["company_admin", "project_manager"] as const;
type CompanyRole = (typeof VALID_COMPANY_ROLES)[number];

function isValidCompanyRole(role: string): role is CompanyRole {
  return (VALID_COMPANY_ROLES as readonly string[]).includes(role);
}

// ── Add team member ───────────────────────────────────────────────────────────
// company_admin creates or links a user for their company.
// Case 1: new email → create auth user + profile + membership
// Case 2: existing email → skip creation, link existing user to company

export async function inviteTeamMember(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const companyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!companyId) return { error: "Company admin access required." };

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const displayName = (formData.get("display_name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim();
  const password = ((formData.get("password") as string) ?? "").trim();

  if (!email) return { error: "Email is required." };
  if (!displayName) return { error: "Display name is required." };
  if (!isValidCompanyRole(role)) {
    return { error: "Invalid role." };
  }

  const serviceClient = createServiceClient();

  // ── Check if user already exists ──────────────────────────────────────────
  const { data: existingProfile } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let targetUserId: string;

  if (existingProfile) {
    targetUserId = existingProfile.id;
    await serviceClient
      .from("user_profiles")
      .update({ display_name: displayName, role })
      .eq("id", targetUserId);
  } else {
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters (required for new users)." };
    }

    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { display_name: displayName },
    });

    if (createError || !newUser.user) {
      console.error("inviteTeamMember create user error:", createError);
      return { error: "Failed to create user." };
    }

    targetUserId = newUser.user.id;

    const { error: profileError } = await serviceClient
      .from("user_profiles")
      .upsert({ id: targetUserId, role, display_name: displayName, email }, { onConflict: "id" });

    if (profileError) {
      console.error("inviteTeamMember profile error:", profileError);
      return { error: "User created but profile setup failed." };
    }
  }

  // ── Create company membership ─────────────────────────────────────────────
  const { error: memberError } = await serviceClient
    .from("company_memberships")
    .insert({
      company_id: companyId,
      user_id: targetUserId,
      role,
    });

  if (memberError) {
    if (memberError.code === "23505") {
      return { error: "User is already a member of this company." };
    }
    console.error("inviteTeamMember membership error:", memberError);
    return { error: "Failed to add user to company." };
  }

  revalidatePath("/company/team");
  return { error: null, success: true };
}

// ── Remove team member ────────────────────────────────────────────────────────

export async function removeTeamMember(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const callerCompanyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!callerCompanyId) return { error: "Company admin access required." };

  const membershipId = (formData.get("membership_id") as string)?.trim();
  if (!membershipId) return { error: "Membership ID missing." };

  const serviceClient = createServiceClient();

  const { data: membership } = await serviceClient
    .from("company_memberships")
    .select("id, role, company_id, user_id")
    .eq("id", membershipId)
    .single();

  if (!membership) return { error: "Membership not found." };
  if (membership.company_id !== callerCompanyId) return { error: "Access denied." };
  if (membership.user_id === user.id) return { error: "You cannot remove yourself." };

  // Last company_admin guard
  if (membership.role === "company_admin") {
    const { count } = await serviceClient
      .from("company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("company_id", callerCompanyId)
      .eq("role", "company_admin");
    if ((count ?? 0) <= 1) {
      return { error: "Cannot remove the last Company Admin. Promote another user first." };
    }
  }

  const { error } = await serviceClient
    .from("company_memberships")
    .delete()
    .eq("id", membershipId);

  if (error) {
    console.error("removeTeamMember error:", error);
    return { error: "Failed to remove team member." };
  }

  revalidatePath("/company/team");
  return { error: null, success: true };
}

// ── Update team member role ───────────────────────────────────────────────────

export async function updateTeamMemberRole(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const callerCompanyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!callerCompanyId) return { error: "Company admin access required." };

  const membershipId = (formData.get("membership_id") as string)?.trim();
  const newRole = (formData.get("role") as string)?.trim();

  if (!membershipId) return { error: "Membership ID missing." };
  if (!isValidCompanyRole(newRole)) return { error: "Invalid role." };

  const serviceClient = createServiceClient();

  const { data: membership } = await serviceClient
    .from("company_memberships")
    .select("id, role, company_id, user_id")
    .eq("id", membershipId)
    .single();

  if (!membership) return { error: "Membership not found." };
  if (membership.company_id !== callerCompanyId) return { error: "Access denied." };

  // Last company_admin guard when demoting
  if (membership.role === "company_admin" && newRole !== "company_admin") {
    const { count } = await serviceClient
      .from("company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("company_id", callerCompanyId)
      .eq("role", "company_admin");
    if ((count ?? 0) <= 1) {
      return { error: "Cannot demote the last Company Admin." };
    }
  }

  const { error: updateError } = await serviceClient
    .from("company_memberships")
    .update({ role: newRole })
    .eq("id", membershipId);

  if (updateError) {
    console.error("updateTeamMemberRole error:", updateError);
    return { error: "Failed to update role." };
  }

  await Promise.all([
    serviceClient.from("user_profiles").update({ role: newRole }).eq("id", membership.user_id),
    serviceClient.auth.admin.updateUserById(membership.user_id, {
      app_metadata: { role: newRole },
    }),
  ]);

  revalidatePath("/company/team");
  return { error: null, success: true };
}

// ── Assign project to PM ──────────────────────────────────────────────────────

export async function assignProjectManager(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const callerCompanyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!callerCompanyId) return { error: "Company admin access required." };

  const projectId = (formData.get("project_id") as string)?.trim();
  const targetUserId = (formData.get("user_id") as string)?.trim();

  if (!projectId || !targetUserId) return { error: "Missing project or user ID." };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", callerCompanyId)
    .single();
  if (!project) return { error: "Project not found or access denied." };

  const serviceClient = createServiceClient();

  const { data: memberRow } = await serviceClient
    .from("company_memberships")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("company_id", callerCompanyId)
    .single();
  if (!memberRow || memberRow.role !== "project_manager") {
    return { error: "User is not a Project Manager in your company." };
  }

  const { error: insertError } = await serviceClient
    .from("project_manager_assignments")
    .insert({ project_id: projectId, user_id: targetUserId, assigned_by: user.id });

  if (insertError && insertError.code !== "23505") {
    console.error("assignProjectManager error:", insertError);
    return { error: "Failed to assign Project Manager." };
  }

  revalidatePath("/company/team");
  return { error: null, success: true };
}

// ── Remove project assignment from PM ────────────────────────────────────────

export async function removeProjectManagerAssignment(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const callerCompanyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!callerCompanyId) return { error: "Company admin access required." };

  const assignmentId = (formData.get("assignment_id") as string)?.trim();
  if (!assignmentId) return { error: "Assignment ID missing." };

  const serviceClient = createServiceClient();

  const { data: assignment } = await serviceClient
    .from("project_manager_assignments")
    .select("id, project_id")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return { error: "Assignment not found." };

  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", assignment.project_id)
    .eq("company_id", callerCompanyId)
    .single();
  if (!proj) return { error: "Access denied." };

  const { error } = await serviceClient
    .from("project_manager_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    console.error("removeProjectManagerAssignment error:", error);
    return { error: "Failed to remove assignment." };
  }

  revalidatePath("/company/team");
  return { error: null, success: true };
}

// ── Update team member details (display name) ────────────────────────────────

export async function updateTeamMemberDetails(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const callerCompanyId = await getCallerCompanyAdmin(supabase, user.id);
  if (!callerCompanyId) return { error: "Company admin access required." };

  const membershipId = (formData.get("membership_id") as string)?.trim();
  const displayName = (formData.get("display_name") as string)?.trim();

  if (!membershipId) return { error: "Membership ID missing." };
  if (!displayName) return { error: "Display name is required." };

  const serviceClient = createServiceClient();

  const { data: membership } = await serviceClient
    .from("company_memberships")
    .select("user_id, company_id")
    .eq("id", membershipId)
    .single();

  if (!membership) return { error: "Membership not found." };
  if (membership.company_id !== callerCompanyId) return { error: "Access denied." };

  const { error } = await serviceClient
    .from("user_profiles")
    .update({ display_name: displayName })
    .eq("id", membership.user_id);

  if (error) {
    console.error("updateTeamMemberDetails error:", error);
    return { error: "Failed to update." };
  }

  revalidatePath("/company/team");
  return { error: null, success: true };
}
