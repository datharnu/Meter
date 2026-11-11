import Link from "next/link";
import { docGroups, docLinks, type Story } from "@/lib/site";

function sectionId(heading: string, id?: string) {
  if (id) return id;
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function accountLinks(text: string) {
  const parts = text.split(/([a-z0-9]+\.mtrfc658fd1\.testnet)/g);
  return parts.map((part, index) =>
    part.endsWith(".mtrfc658fd1.testnet") ? (
      <a key={`${part}-${index}`} className="mono" href={`https://testnet.nearblocks.io/address/${part}`}>{part}</a>
    ) : (
      <span key={`${index}-${part.slice(0, 12)}`}>{part}</span>
    ),
  );
}

export function DocArticle({ story, overview = false }: { story: Story; overview?: boolean }) {
  return (
    <>
      <header className="doc-mast">
        <p className="craft-eyebrow">{story.eyebrow}</p>
        <h1>{story.title}</h1>
        <p>{story.lede}</p>
      </header>
      {overview ? <DocIndex /> : null}
      {story.blocks.map((block, index) => (
        <DocBlock key={block.id ?? block.heading} block={block} index={index} />
      ))}
    </>
  );
}

function DocIndex() {
  return (
    <div className="doc-index">
      {docGroups.map((group) => {
        const items = docLinks.filter((item) => item.group === group);
        return (
          <section key={group} className="doc-group" data-group={group}>
            <h2>{group}</h2>
            <ul>
              {items.map((item, index) => (
                <li key={item.href}>
                  <Link href={item.href}>
                    <span className="mono">0{index + 1}</span>
                    <b>{item.title}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DocBlock({ block, index }: { block: Story["blocks"][number]; index: number }) {
  const id = sectionId(block.heading, block.id);
  const labeled = block.body.every((line) => /^(Establishes|Does not establish|Informs):/.test(line));
  const addresses = block.heading === "Addresses";
  const command = block.body.find((line) => line.includes("node chain/verify.mjs"));
  const claim = block.heading.startsWith("Not ");

  if (labeled) {
    return (
      <section id={id} className="doc-evidence" data-doc-section={id}>
        <h2>{block.heading}</h2>
        <dl>
          {block.body.map((line) => {
            const match = line.match(/^(Establishes|Does not establish|Informs):\s*([\s\S]*)$/);
            if (!match) return null;
            return (
              <div key={match[1]}>
                <dt>{match[1]}</dt>
                <dd>{accountLinks(match[2])}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    );
  }

  if (addresses) {
    return (
      <section id={id} className="doc-addresses" data-doc-section={id}>
        <h2>{block.heading}</h2>
        <ol>
          {block.body.map((line, row) => (
            <li key={line}>
              <span className="mono">0{row + 1}</span>
              <span>{accountLinks(line)}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (command) {
    return (
      <section id={id} className="doc-command" data-doc-section={id}>
        <h2>{block.heading}</h2>
        <pre className="mono"><code>node chain/verify.mjs</code></pre>
        {block.body.map((line) => <p key={line}>{accountLinks(line)}</p>)}
      </section>
    );
  }

  if (claim) {
    return (
      <section id={id} className="doc-claim" data-doc-section={id}>
        <h2>{block.heading}</h2>
        <div>
          {block.body.map((line) => <p key={line}>{accountLinks(line)}</p>)}
        </div>
      </section>
    );
  }

  if (index % 2 === 1) {
    return (
      <section id={id} className="doc-split" data-doc-section={id}>
        <h2>{block.heading}</h2>
        <div>
          {block.body.map((line) => <p key={line}>{accountLinks(line)}</p>)}
        </div>
      </section>
    );
  }

  return (
    <section id={id} className="doc-rows" data-doc-section={id}>
      <h2>{block.heading}</h2>
      <ol>
        {block.body.map((line, row) => (
          <li key={line}>
            <span className="mono">0{row + 1}</span>
            <p>{accountLinks(line)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
