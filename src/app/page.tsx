import { redirect } from "next/navigation";

// Root redirect.
// TODO: Once auth middleware is fully wired, redirect based on session role:
//   admin/designer → /admin
//   company_admin/project_manager → /company
export default function RootPage() {
  redirect("/sign-in");
}
