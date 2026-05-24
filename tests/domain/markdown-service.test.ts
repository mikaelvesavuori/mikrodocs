import { describe, expect, it } from "vitest";

import { MarkdownService } from "../../src/domain/index.js";

describe("MarkdownService", () => {
  it("derives title, outline, links, and stats from Markdown", () => {
    const parsed = MarkdownService.parse(`# MikroDocs

Short intro with [site](https://example.com) and [[Notes]].

## Section

- One
- Two
`);

    expect(MarkdownService.deriveTitle("# MikroDocs\n\nBody")).toBe("MikroDocs");
    expect(parsed.outline).toEqual([
      { id: "mikrodocs", level: 1, text: "MikroDocs", line: 1 },
      { id: "section", level: 2, text: "Section", line: 5 },
    ]);
    expect(parsed.links).toEqual([
      { label: "site", target: "https://example.com", kind: "external", line: 3 },
      { label: "Notes", target: "Notes", kind: "document", line: 3 },
    ]);
    expect(parsed.stats.words).toBeGreaterThan(5);
  });

  it("renders tables, images, and inline formatting", () => {
    const html = MarkdownService.renderHtml(`| Name | Role |
| --- | --- |
| Ada | Writer |

![Desk](desk.png "A caption"){wide}
![Minion](https://octodex.github.com/images/minion.png)

- [x] Done
1. First
---

**Bold** and *quiet*`);

    expect(html).toContain("<table>");
    expect(html).toContain('class="md-figure md-figure-wide"');
    expect(html).toContain('src="https://octodex.github.com/images/minion.png"');
    expect(html).toContain('class="task-list-item"');
    expect(html).toContain("<ol>");
    expect(html).toContain("<hr />");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>quiet</em>");
  });

  it("renders reference-style images and hides their definitions", () => {
    const html = MarkdownService.renderHtml(`![Alt text][id]

[id]: https://example.com/image.png "A caption"`);

    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).toContain("<figcaption>A caption</figcaption>");
    expect(html).not.toContain("[id]:");
  });

  it("renders fenced code blocks with optional language labels", () => {
    const html = MarkdownService.renderHtml(`Before

\`\`\`ts
const value = "<safe>";
\`\`\`

After`);

    expect(html).toContain('class="md-code-block"');
    expect(html).toContain("<figcaption>ts</figcaption>");
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const value = &quot;&lt;safe&gt;&quot;");
  });

  it("renders original Markdown heading and code variants", () => {
    const html = MarkdownService.renderHtml(`Setext heading
==============

## Closed heading ##

Paragraph with hard break  
next line.

    <div>Indented code</div>`);

    expect(html).toContain('<h1 id="setext-heading">Setext heading</h1>');
    expect(html).toContain('<h2 id="closed-heading">Closed heading</h2>');
    expect(html).toContain("hard break<br />next line");
    expect(html).toContain("&lt;div&gt;Indented code&lt;/div&gt;");
  });

  it("renders plus lists and reference-style links", () => {
    const parsed = MarkdownService.parse(`+ Red
+ Green

This is [an example][id].

[Inline](http://example.net/ "Inline title")

[id]: http://example.com/ "Example title"`);

    expect(parsed.html).toContain("<ul>");
    expect(parsed.html).toContain("<li>Red</li>");
    expect(parsed.html).toContain('href="http://example.com/"');
    expect(parsed.html).toContain('title="Example title"');
    expect(parsed.html).toContain('href="http://example.net/"');
    expect(parsed.html).toContain('title="Inline title"');
    expect(parsed.links).toContainEqual({
      label: "an example",
      target: "http://example.com/",
      kind: "external",
      line: 4,
    });
  });

  it("renders consecutive quote lines as grouped paragraphs", () => {
    const html = MarkdownService.renderHtml(`> First line
> second line
>
> Second paragraph`);

    expect(html).toContain("<blockquote>");
    expect(html).toContain("<p>First line second line</p>");
    expect(html).toContain("<p>Second paragraph</p>");
  });

  it("renders lazy and nested blockquotes with Markdown inside", () => {
    const html = MarkdownService.renderHtml(`> ## Quoted
lazy continuation.
>
> > Nested quote
>
> - Quoted item`);

    expect(html).toContain("<blockquote>");
    expect(html).toContain('<h2 id="quoted">Quoted</h2>');
    expect(html).toContain("<p>lazy continuation.</p>");
    expect(html).toContain("<blockquote><p>Nested quote</p></blockquote>");
    expect(html).toContain("<ul><li>Quoted item</li></ul>");
  });

  it("renders hard-wrapped and nested list items", () => {
    const html = MarkdownService.renderHtml(`* Lorem ipsum dolor sit amet.
Aliquam hendrerit mi posuere lectus.
* Parent item
  - Child item

1. First paragraph

    Second paragraph
2. Next`);

    expect(html).toContain(
      "<li>Lorem ipsum dolor sit amet. Aliquam hendrerit mi posuere lectus.</li>",
    );
    expect(html).toContain("<li><p>Parent item</p>\n<ul><li>Child item</li></ul></li>");
    expect(html).toContain('<ol><li value="1"><p>First paragraph</p>');
    expect(html).toContain('<p>Second paragraph</p></li><li value="2">Next</li></ol>');
  });

  it("preserves explicit ordered list numbers", () => {
    const html = MarkdownService.renderHtml(`1. Bird
1. McHale
1. Parish

or even:

3. Bird
1. McHale
8. Parish`);

    expect(html).toContain(
      '<ol><li value="1">Bird</li><li value="1">McHale</li><li value="1">Parish</li></ol>',
    );
    expect(html).toContain(
      '<ol><li value="3">Bird</li><li value="1">McHale</li><li value="8">Parish</li></ol>',
    );
  });

  it("renders list item code blocks without leaking raw HTML", () => {
    const html = MarkdownService.renderHtml(`*   A list item with a code block:

        <code goes here>`);

    expect(html).toContain("<ul><li><p>A list item with a code block:</p>");
    expect(html).toContain("<pre><code>&lt;code goes here&gt;</code></pre>");
    expect(html).not.toContain("<code goes here>");
  });

  it("renders automatic links, escapes, and safe raw HTML", () => {
    const html = MarkdownService.renderHtml(
      String.raw`Visit <http://example.com> or <hello@example.com>.
\*literal asterisks\* and Line <br /> break.
<script>alert("x")</script>`,
    );

    expect(html).toContain(
      '<a href="http://example.com" data-link-kind="external">http://example.com</a>',
    );
    expect(html).toContain(
      '<a href="mailto:hello@example.com" data-link-kind="external">hello@example.com</a>',
    );
    expect(html).toContain("*literal asterisks*");
    expect(html).toContain("Line <br /> break.");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps HTML tags literal inside inline code", () => {
    const html = MarkdownService.renderHtml(
      "Markdown wraps code blocks in both `<pre>` and `<code>` tags.",
    );

    expect(html).toContain("both <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags.");
    expect(html).not.toContain("<code><pre></code>");
  });

  it("renders Markdown table alignment markers", () => {
    const html = MarkdownService.renderHtml(`| Name | Score | Notes |
| :--- | ---: | :---: |
| Ada | 10 | Good |`);

    expect(html).toContain("<table>");
    expect(html).toContain('<th class="md-align-right">Score</th>');
    expect(html).toContain('<td class="md-align-center">Good</td>');
  });

  it("renders underscore emphasis without touching word underscores", () => {
    const html = MarkdownService.renderHtml("__Bold__ and _quiet_ plus snake_case_token");

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>quiet</em>");
    expect(html).toContain("snake_case_token");
  });

  it("renders frontmatter, duplicate headings, toc, strikethrough, math, and footnotes", () => {
    const markdown = `---
title: Hidden
---

[[toc]]

## Repeat
Text with ~~removed~~ and $x + y$.[^a]

## Repeat

[^a]: Footnote text`;
    const outline = MarkdownService.getOutline(markdown);
    const html = MarkdownService.renderHtml(markdown);

    expect(outline.map((item) => item.id)).toEqual(["repeat", "repeat-2"]);
    expect(html).not.toContain("title: Hidden");
    expect(html).toContain('class="md-toc"');
    expect(html).toContain('href="#repeat-2"');
    expect(html).toContain("<del>removed</del>");
    expect(html).toContain('<span class="md-math">x + y</span>');
    expect(html).toContain('id="fn-a"');
    expect(html).toContain("Footnote text");
  });

  it("renders callouts, math blocks, and mermaid fences", () => {
    const html = MarkdownService.renderHtml(`> [!WARNING] Check this
> Carefully.

$$
x = y
$$

\`\`\`mermaid
graph TD
  A-->B
\`\`\``);

    expect(html).toContain('class="md-callout md-callout-warning"');
    expect(html).toContain("<strong>Warning</strong>");
    expect(html).toContain('class="md-math-block"');
    expect(html).toContain('class="md-diagram md-diagram-mermaid"');
  });

  it("escapes raw HTML in rendered Markdown", () => {
    const html = MarkdownService.renderHtml(`# <script>alert("x")</script>`);

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders inactive lines without Markdown syntax and active lines as source", () => {
    expect(MarkdownService.renderPrettyLineHtml("## Heading")).toContain("pretty-heading-2");
    expect(MarkdownService.renderPrettyLineHtml("## Heading")).toContain(">Heading</span>");
    expect(MarkdownService.renderPrettyLineHtml("## Heading", true)).toContain("## Heading");
    expect(
      MarkdownService.renderPrettyLineHtml("**Bold** and [link](https://example.com)"),
    ).toContain("<strong>Bold</strong>");
    expect(MarkdownService.renderPrettyLineHtml("- Item")).toContain("pretty-list-marker");
  });

  it("finds line-aware results in Markdown source", () => {
    const results = MarkdownService.searchLines(
      "# Intro\n\nA **quiet** note\n\nAnother note",
      "quiet",
    );

    expect(results).toEqual([{ line: 3, text: "A quiet note", matchStart: 2, matchEnd: 7 }]);
  });

  it("prepends export titles without duplicating an existing matching h1", () => {
    expect(MarkdownService.withTitle("Body", "Title")).toBe("# Title\n\nBody");
    expect(MarkdownService.withTitle("# Title\n\nBody", "Title")).toBe("# Title\n\nBody");
    expect(MarkdownService.withTitle("# Title ###\n\nBody", "Title")).toBe("# Title ###\n\nBody");
    expect(MarkdownService.withTitle("Title\n=====\n\nBody", "Title")).toBe("Title\n=====\n\nBody");
    expect(MarkdownService.withTitle("Title\n-----\n\nBody", "Title")).toBe(
      "# Title\n\nTitle\n-----\n\nBody",
    );
  });

  it("handles large mixed documents without dropping structure", () => {
    const sections = Array.from(
      { length: 350 },
      (_, index) => `## Section ${index + 1}

Paragraph ${index + 1} with **bold**, _italic_, [link](https://example.com/${index}), and [[Doc ${index}]].

| Item | Value |
| --- | --- |
| Row ${index + 1} | ${index + 1} |

- [ ] Task ${index + 1}
> Quote ${index + 1}`,
    );
    const markdown = `# Large Document\n\n${sections.join("\n\n")}`;
    const parsed = MarkdownService.parse(markdown);

    expect(parsed.stats.words).toBeGreaterThan(3000);
    expect(parsed.outline).toHaveLength(351);
    expect(parsed.links.length).toBeGreaterThanOrEqual(700);
    expect(parsed.html).toContain("<table>");
    expect(parsed.html).toContain("Section 350");
  });
});
