import type { Metadata } from "next";
import { AdminForgotPassword } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <AdminForgotPassword />;
}
