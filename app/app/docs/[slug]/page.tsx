import { notFound } from "next/navigation";
import { DocsShell } from "@/components/DocsShell";
import { docs } from "@/lib/site";

export function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = docs[slug];
  if (!story) notFound();
  return <DocsShell story={story} />;
}
