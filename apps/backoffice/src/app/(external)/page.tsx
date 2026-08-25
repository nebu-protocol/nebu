import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard/lpbot");
  return <>Coming Soon</>;
}
