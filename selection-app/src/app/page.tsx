import { redirect } from "next/navigation";

/** The site root is the Charter Portal; client pages live under /selection/<slug>. */
export default function Home() {
  redirect("/portal");
}
