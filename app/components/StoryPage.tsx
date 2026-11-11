import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import type { Story } from "@/lib/site";

export function StoryBody({ story }: { story: Story }) {
  return (
    <>
      <p className="eyebrow"><i data-hue="teal" />{story.eyebrow}</p>
      <h1>{story.title}</h1>
      <p className="market-lead">{story.lede}</p>
      {story.blocks.map((block) => (
        <section key={block.heading} className="story-block" id={block.id}>
          <h2>{block.heading}</h2>
          {block.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
      <div className="story-next">
        <Link className="btn" href="/sign-in">Open the desk</Link>
            <Link className="ghost" href="/book">See the proof</Link>
      </div>
    </>
  );
}

export function StoryPage({ story }: { story: Story }) {
  return (
    <div className="market">
      <SiteNav />
      <main id="content" className="market-main story">
        <StoryBody story={story} />
      </main>
    </div>
  );
}
