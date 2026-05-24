import { describe, expect, it } from "vitest";

import { MarkdownService } from "../../src/domain/index.js";

const gruberFixture = `# Markdown: Syntax

*   [Overview](#overview)
    *   [Philosophy](#philosophy)
    *   [Inline HTML](#html)

----

## Overview

Markdown is intended to be as easy-to-read and easy-to-write as is feasible.

Markdown supports two styles of headers, [Setext] [1] and [atx] [2].

Setext heading
==============

Closed heading
--------------

Optionally, you may "close" atx-style headers.

### Closed ATX heading ###

Markdown allows you to be lazy and only put the > before the first
line of a hard-wrapped paragraph:

> This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.

> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
id sem consectetuer libero luctus adipiscing.

> This is the first level of quoting.
>
> > This is nested blockquote.
>
> Back to the first level.

*   Lorem ipsum dolor sit amet, consectetuer adipiscing elit.
    Aliquam hendrerit mi posuere lectus.
*   A list item with a code block:

        <code goes here>

1.  This is a list item with two paragraphs.

    This is the second paragraph in the list item.

This is a normal paragraph:

    This is a code block.

\`\`\`applescript
tell application "Foo"
    beep
end tell
\`\`\`

This is [an example](http://example.com/ "Inline title") inline link.
This is [a reference link][ref].
This is [a spaced reference] [ref].
This is [a collapsed reference][].
This is <http://example.net/> and <hello@example.com>.

*single asterisks*

_single underscores_

**double asterisks**

__double underscores__

Use the \`printf()\` function and keep \`<pre>\` literal.

![Alt text][image]
![Collapsed image][]

\\*literal asterisks\\*

[1]: http://docutils.sourceforge.net/mirror/setext.html
[2]: http://www.aaronsw.com/2002/atx/
[ref]: <https://example.org/reference> "Reference title"
[a collapsed reference]: https://example.org/collapsed
[image]: https://example.org/image.png "Image caption"
[Collapsed image]: https://example.org/collapsed.png
`;

describe("MarkdownService Gruber syntax fixture", () => {
  it("renders the original Markdown syntax patterns as stable HTML", () => {
    const parsed = MarkdownService.parse(gruberFixture);

    expect(parsed.outline).toEqual(
      expect.arrayContaining([
        { id: "markdown-syntax", level: 1, text: "Markdown: Syntax", line: 1 },
        { id: "overview", level: 2, text: "Overview", line: 9 },
        { id: "setext-heading", level: 1, text: "Setext heading", line: 15 },
        { id: "closed-heading", level: 2, text: "Closed heading", line: 18 },
        { id: "closed-atx-heading", level: 3, text: "Closed ATX heading", line: 23 },
      ]),
    );

    expect(parsed.html).toContain("<hr />");
    expect(parsed.html).toContain('<a href="#overview" data-link-kind="internal">Overview</a>');
    expect(parsed.html).toContain(
      '<a href="http://docutils.sourceforge.net/mirror/setext.html" data-link-kind="external">Setext</a>',
    );
    expect(parsed.html).toContain(
      '<a href="https://example.org/reference" data-link-kind="external" title="Reference title">a reference link</a>',
    );
    expect(parsed.html).toContain(
      '<a href="https://example.org/reference" data-link-kind="external" title="Reference title">a spaced reference</a>',
    );
    expect(parsed.html).toContain(
      '<a href="https://example.org/collapsed" data-link-kind="external">a collapsed reference</a>',
    );
    expect(parsed.html).toContain(
      '<a href="http://example.net/" data-link-kind="external">http://example.net/</a>',
    );
    expect(parsed.html).toContain(
      '<a href="mailto:hello@example.com" data-link-kind="external">hello@example.com</a>',
    );
    expect(parsed.html).toContain("<blockquote>");
    expect(parsed.html).toContain("<blockquote><p>This is nested blockquote.</p></blockquote>");
    expect(parsed.html).toContain("<ul>");
    expect(parsed.html).toContain("<ol>");
    expect(parsed.html).toContain("<pre><code>&lt;code goes here&gt;</code></pre>");
    expect(parsed.html).toContain("<figcaption>applescript</figcaption>");
    expect(parsed.html).toContain("<em>single asterisks</em>");
    expect(parsed.html).toContain("<em>single underscores</em>");
    expect(parsed.html).toContain("<strong>double asterisks</strong>");
    expect(parsed.html).toContain("<strong>double underscores</strong>");
    expect(parsed.html).toContain("keep <code>&lt;pre&gt;</code> literal");
    expect(parsed.html).toContain('src="https://example.org/image.png"');
    expect(parsed.html).toContain("<figcaption>Image caption</figcaption>");
    expect(parsed.html).toContain('src="https://example.org/collapsed.png"');
    expect(parsed.html).toContain("*literal asterisks*");
    expect(parsed.html).not.toContain("[ref]:");
    expect(parsed.html).not.toContain("[image]:");

    expect(parsed.links).toEqual(
      expect.arrayContaining([
        { label: "Overview", target: "#overview", kind: "internal", line: 3 },
        {
          label: "Setext",
          target: "http://docutils.sourceforge.net/mirror/setext.html",
          kind: "external",
          line: 13,
        },
        {
          label: "a reference link",
          target: "https://example.org/reference",
          kind: "external",
          line: 62,
        },
        {
          label: "a spaced reference",
          target: "https://example.org/reference",
          kind: "external",
          line: 63,
        },
        {
          label: "a collapsed reference",
          target: "https://example.org/collapsed",
          kind: "external",
          line: 64,
        },
        { label: "http://example.net/", target: "http://example.net/", kind: "external", line: 65 },
        {
          label: "hello@example.com",
          target: "mailto:hello@example.com",
          kind: "external",
          line: 65,
        },
      ]),
    );
  });
});
