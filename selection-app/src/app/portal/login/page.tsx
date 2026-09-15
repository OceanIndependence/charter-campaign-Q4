import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/portal/LoginForm";
import { stagingGateApplies } from "@/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Charter Portal",
  robots: { index: false, follow: false },
};

/** The staging access key, for the stub and solo providers. With Microsoft sign-in there is no key to enter. */
export default function PortalLoginPage() {
  if (!stagingGateApplies()) redirect("/portal/sign-in");
  return <LoginForm />;
}
