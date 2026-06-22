import { redirect } from "next/navigation";

export default function ClassicWizardRedirect() {
  redirect("/new-project/basics?reset=true");
}
