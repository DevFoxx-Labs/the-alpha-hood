import type { Metadata } from "next";
import { ContentView } from "@/components/content/content-view";
import { renderContentPage } from "@/lib/content/pages";

const page = renderContentPage("contact");

export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: page.path } };

/** CMS-04 company page (Consumer Protection (E-Commerce) Rules 2020: seller details and grievance contact). */
export default function Page() {
  return <ContentView page={page} />;
}
