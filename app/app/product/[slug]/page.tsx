import { notFound } from "next/navigation";
import { StoryPage } from "@/components/StoryPage";
import { productPages } from "@/lib/site";

export function generateStaticParams() {
  return Object.keys(productPages).map((slug) => ({ slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = productPages[slug];
  if (!story) notFound();
  return <StoryPage story={story} />;
}
