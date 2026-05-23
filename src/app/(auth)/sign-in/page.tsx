import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center">
        <Logo variant="banner" />
        <p className="mt-1 text-sm text-muted">Operations Platform</p>
      </div>

      {/* Card */}
      <div
        className="bg-card rounded-2xl px-8 py-8"
        style={{ boxShadow: "0 4px 32px rgba(43,52,55,0.09)" }}
      >
        <h1 className="text-base font-semibold text-ink mb-6">Sign in to your account</h1>
        <SignInForm />
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Access is invite-only.{" "}
        <span className="text-dim">Contact your administrator.</span>
      </p>
    </div>
  );
}
