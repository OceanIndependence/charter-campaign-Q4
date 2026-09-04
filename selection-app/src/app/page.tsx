import { redirect } from "next/navigation";
import { demoConfig } from "@/lib/demo-config";

export default function Home() {
  redirect(`/selection/${demoConfig.slug}`);
}
