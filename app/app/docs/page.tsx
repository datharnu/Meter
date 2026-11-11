import { DocsShell } from "@/components/DocsShell";
import { docsOverview } from "@/lib/site";

export default function DocsPage() {
  return <DocsShell story={docsOverview} />;
}
