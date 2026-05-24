import { describe, expect, it } from "vitest";

import { renderPrettyMarkdown } from "../../src/presentation/prettyMarkdown.js";

describe("renderPrettyMarkdown", () => {
  it("renders inactive lazy blockquotes as one coherent block", () => {
    const html = renderPrettyMarkdown(
      `> This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
>
> Donec sit amet nisl. Aliquam semper ipsum sit amet velit.
id sem consectetuer libero luctus adipiscing.`,
      -1,
    );

    expect(html).toContain('class="pretty-quote-block prose"');
    expect(html).toContain(
      "<p>This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.</p>",
    );
    expect(html).toContain(
      "<p>Donec sit amet nisl. Aliquam semper ipsum sit amet velit. id sem consectetuer libero luctus adipiscing.</p>",
    );
    expect(html).not.toContain('class="pretty-line"');
  });

  it("keeps active quote lines as raw source", () => {
    const html = renderPrettyMarkdown(
      `> Quoted first line
lazy continuation`,
      1,
    );

    expect(html).toContain('data-active="true"');
    expect(html).toContain("lazy continuation");
    expect(html).not.toContain('class="pretty-quote-block prose"');
  });

  it("renders inactive list code blocks through the block renderer", () => {
    const html = renderPrettyMarkdown(
      `*   A list item with a code block:

        <code goes here>`,
      -1,
    );

    expect(html).toContain('class="pretty-list-block prose"');
    expect(html).toContain("<ul><li><p>A list item with a code block:</p>");
    expect(html).toContain("<pre><code>&lt;code goes here&gt;</code></pre>");
    expect(html).not.toContain("<code goes here>");
  });

  it("uses compact read-mode spacers for inactive blank source lines", () => {
    const html = renderPrettyMarkdown(
      `### Customer value or benefits

- Simplifies onboarding.
- Reduces frustration.`,
      -1,
    );

    expect(html).toContain('class="pretty-blank-line"');
    expect(html).toContain('class="pretty-list-block prose"');
    expect(html).not.toContain('<div class="pretty-line" data-active="false"> </div>');
  });

  it("marks inactive heading lines for read-mode vertical rhythm", () => {
    const html = renderPrettyMarkdown(
      `## Status

Accepted

## What we want to solve`,
      -1,
    );

    expect(html).toContain('class="pretty-line pretty-heading-line pretty-heading-line-2"');
    expect(html).toContain(">Status</span>");
    expect(html).toContain(">What we want to solve</span>");
  });

  it("marks consecutive headings for tighter heading stacks", () => {
    const html = renderPrettyMarkdown(
      `## How we solve it

### Analysis

#### Assumptions`,
      -1,
    );

    expect(html).toContain(
      'class="pretty-line pretty-heading-line pretty-heading-line-3 pretty-heading-line-after-heading"',
    );
    expect(html).toContain(
      'class="pretty-line pretty-heading-line pretty-heading-line-4 pretty-heading-line-after-heading"',
    );
  });

  it("renders inactive images, tables, and fenced code as rich blocks", () => {
    const html = renderPrettyMarkdown(
      `![Alt](image.png "Caption")

| Name | Role |
| --- | --- |
| Ada | Writer |

\`\`\`ts
const value = "<safe>";
\`\`\``,
      -1,
    );

    expect(html).toContain('class="pretty-image-block prose"');
    expect(html).toContain('src="image.png"');
    expect(html).toContain('class="pretty-table-block prose"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="pretty-code-block prose"');
    expect(html).toContain("<figcaption>ts</figcaption>");
  });

  it("renders the active fenced code block as source lines", () => {
    const html = renderPrettyMarkdown(
      `\`\`\`ts
const value = true;
\`\`\``,
      1,
    );

    expect(html).toContain('data-active="true"');
    expect(html).toContain("```ts");
    expect(html).toContain("const value = true;");
    expect(html).not.toContain('class="pretty-code-block prose"');
  });

  it("hides inactive frontmatter and footnote definitions", () => {
    const html = renderPrettyMarkdown(
      `---
title: Hidden
---

Text.[^a]

[^a]: Footnote text`,
      -1,
    );

    expect(html).not.toContain("title: Hidden");
    expect(html).not.toContain("Footnote text");
    expect(html).toContain("Text.");
  });
});
