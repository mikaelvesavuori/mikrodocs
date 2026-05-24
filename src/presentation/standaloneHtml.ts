import { MarkdownService } from "../index.js";
import { escapeText } from "./formatters.js";

export function createStandaloneHtml(title: string, markdown: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeText(title)}</title>
<style>
body{max-width:760px;margin:48px auto;padding:0 20px;font-family:system-ui,sans-serif;line-height:1.7;color:#171717;background:#fff}
h1,h2,h3,h4,h5,h6{font-weight:400;line-height:1.14;margin-top:1.9em}h1{font-size:2.65em}h2{font-size:1.95em}h3{font-size:1.48em}h4{font-size:1.2em}.md-table-wrap{margin:1.3em 0;overflow-x:auto;border:1px solid #ddd;border-radius:8px}table{width:100%;min-width:100%;border-collapse:separate;border-spacing:0}td,th{border:0;border-bottom:1px solid #ddd;padding:10px 12px;text-align:left;vertical-align:top}.md-align-center{text-align:center}.md-align-right{text-align:right}th{background:#f3f0e8;font-weight:400}td+td,th+th{border-left:1px solid #ddd}tbody tr:last-child td{border-bottom:0}.md-code-block{margin:1.35em 0;border:1px solid #ddd;border-radius:8px;background:#f3f0e8;overflow:hidden}.md-code-block figcaption{padding:7px 12px;border-bottom:1px solid #ddd;color:#666;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78em}pre{overflow:auto;margin:0;padding:14px;background:transparent}pre code{display:block;padding:0;background:transparent;line-height:1.58;white-space:pre}blockquote{border-left:3px solid #777;margin:1.35em 0;padding:.15em 0 .15em 1.15em;color:#555}blockquote p+p{margin-top:1em}img{max-width:100%;border-radius:6px}figcaption{color:#666;font-size:.9em}hr{border:0;border-top:1px solid #ddd}.task-list-item{list-style:none}.task-list-item input{margin-left:-1.35em}
</style>
</head>
<body>
${MarkdownService.renderHtml(markdown)}
</body>
</html>`;
}
