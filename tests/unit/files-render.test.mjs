import test from "node:test";
import assert from "node:assert/strict";
import {
  fileLanguage,
  renderMarkdown,
  highlightCode,
  formatJson,
} from "../../src/client/components/files/render.js";

function visibleCode(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, "&");
}

test("file languages are determined by the file extension", () => {
  for (const path of ["README.md", "/root/README.MARKDOWN", "a.mdown"])
    assert.equal(fileLanguage(path), "markdown");
  for (const path of ["a.js", "a.mjs", "a.cjs", "C:\\src\\A.JSX"])
    assert.equal(fileLanguage(path), "javascript");
  for (const path of ["a.json", "a.JSONC", "a.jsonl"])
    assert.equal(fileLanguage(path), "json");
  for (const path of ["a.txt", "a.ts", "a.js.txt", "/a.md/file", "", null])
    assert.equal(fileLanguage(path), "text");
});

test("GFM renders tables, lists, quotes, strikethrough and fenced code", () => {
  const html = renderMarkdown(
    "# Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- item\n- [x] done\n\n> quote\n\n~~removed~~\n\n```js\nconst answer = 42;\n```",
  );
  for (const pattern of [
    /<h1>Heading<\/h1>/,
    /<table>/,
    /<th>A<\/th>/,
    /<ul>/,
    /<li>item<\/li>/,
    /<input[^>]+disabled/,
    /<blockquote>/,
    /<del>removed<\/del>/,
    /class="language-javascript"/,
    /hljs-keyword/,
  ])
    assert.match(html, pattern);
});

test("raw HTML is inert, including text in raw HTML blocks", () => {
  for (const source of [
    "<script>alert(1)</script>",
    '<img src="https://evil.invalid/pixel" onerror="alert(1)">',
    '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    "<style>body { background: url(https://evil.invalid) }</style>",
    "before <script><img src=x onerror=alert(1)></script> after",
    "before <pre><img src=x onerror=alert(1)></pre> after",
    "<!-- comment --><math><mtext>bad</mtext></math>",
  ]) {
    const html = renderMarkdown(source);
    assert.doesNotMatch(
      html,
      /<(?:script|img|svg|iframe|style|pre|math|!--)\b/i,
    );
    assert.match(html, /&lt;/);
  }
});

test("links only allow HTTP, HTTPS, mailto and anchors", () => {
  for (const href of [
    "https://example.com/page",
    "http://example.com",
    "HTTPS://example.com",
    "mailto:user@example.com",
    "#section",
  ])
    assert.match(renderMarkdown(`[good](${href})`), /<a href=/);
  for (const href of [
    "javascript:alert%281%29",
    "JaVaScRiPt:alert%281%29",
    "jav&#x61;script:alert%281%29",
    "javascript&#58;alert%281%29",
    "java&#x09;script:alert%281%29",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox%281%29",
    "file:///etc/passwd",
    "//example.com",
    "/relative",
    "./relative",
  ]) {
    const html = renderMarkdown(`[**label**](${href})`);
    assert.doesNotMatch(html, /<a\b/);
    assert.match(html, /label/);
  }
  assert.doesNotMatch(
    renderMarkdown("[x][ref]\n\n[ref]: javascript:alert%281%29"),
    /<a\b/,
  );
  assert.match(renderMarkdown("<https://example.com>"), /<a href=/);
});

test("link attributes cannot inject markup", () => {
  const html = renderMarkdown(
    '[safe](https://example.com/\"x "title \\" onmouseover=\"bad")',
  );
  assert.doesNotMatch(html, /<a[^>]*\sonmouseover="/);
  const entities = renderMarkdown(
    "[safe](https://example.com/&quot;onmouseover=&quot;x)",
  );
  assert.match(entities, /&amp;quot;/);
  assert.doesNotMatch(entities, /\sonmouseover="/);
});

test("images become escaped alt text and never request resources", () => {
  const html = renderMarkdown(
    "![pixel](https://evil.invalid/pixel)\n\n![<img src=x onerror=alert(1)>](data:image/svg+xml,bad)\n\n![reference][image]\n\n[image]: https://evil.invalid/other",
  );
  assert.doesNotMatch(html, /<(?:img|source|iframe)\b|<[^>]*\ssrc(?:set)?=/i);
  assert.doesNotMatch(html, /https:\/\/evil/);
  assert.match(html, /pixel/);
  assert.match(html, /reference/);
  assert.match(html, /&lt;img/);
});

test("highlighting escapes code and only supports JavaScript and JSON", () => {
  for (const language of [
    "javascript",
    "js",
    "json",
    "python",
    "xml",
    'x\" onclick=\"bad',
    null,
  ]) {
    const source = "<img src=x onerror=\"alert(1)\"> & 'text'";
    const html = highlightCode(source, language);
    assert.doesNotMatch(html, /<img|onclick=/);
    assert.equal(visibleCode(html), source);
  }
  assert.match(highlightCode("const n = 1", "javascript"), /hljs-keyword/);
  assert.match(highlightCode('{"n": 1}', "json"), /hljs-attr/);
  assert.equal(highlightCode("<script>&", "python"), "&lt;script&gt;&amp;");
  const unknown = renderMarkdown("```xml\n<img src=x onerror=alert(1)>\n```");
  assert.match(unknown, /<pre><code>&lt;img/);
  assert.doesNotMatch(unknown, /<img|language-xml/);
});

test("JSON highlighting preserves big integers, whitespace and invalid input exactly", () => {
  for (const source of [
    '{ "id": 90071992547409931234567890, "n": 1.2300e+40 }\n',
    '{"unfinished": 90071992547409931234567890,',
    '{"html":"<script>alert(1)</script>"}',
    "",
  ]) {
    assert.equal(visibleCode(formatJson(source)), source);
    assert.equal(formatJson(source), highlightCode(source, "json"));
  }
});
