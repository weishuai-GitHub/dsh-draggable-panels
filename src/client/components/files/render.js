import { Marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";

// Keep our language registry isolated from other consumers of highlight.js.
const highlighter = hljs.newInstance();
highlighter.registerLanguage("javascript", javascript);
highlighter.registerLanguage("json", json);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

/** Classify file names, case-insensitively. Paths may use either separator. */
export function fileLanguage(path) {
  const name = String(path ?? "")
    .split(/[\\/]/)
    .pop()
    .toLowerCase();
  if (/\.(md|markdown|mdown|mkd)$/.test(name)) return "markdown";
  if (/\.(js|mjs|cjs|jsx)$/.test(name)) return "javascript";
  if (/\.(json|jsonc|jsonl)$/.test(name)) return "json";
  return "text";
}

function codeLanguage(language) {
  const name = String(language ?? "")
    .trim()
    .toLowerCase();
  if (name === "js" || name === "javascript") return "javascript";
  if (name === "json") return "json";
  return null;
}

/** Return an HTML fragment, never a wrapper; unknown languages are escaped. */
export function highlightCode(text, language) {
  const source = String(text ?? "");
  const supported = codeLanguage(language);
  if (!supported) return escapeHtml(source);
  try {
    return highlighter.highlight(source, {
      language: supported,
      ignoreIllegals: true,
    }).value;
  } catch {
    return escapeHtml(source);
  }
}

/** Return highlighted HTML without parsing/reformatting (big integers stay exact). */
export function formatJson(text) {
  return highlightCode(text, "json");
}

function allowedLink(href) {
  // Reject controls rather than relying on browsers' URL normalization.
  return (
    !/[\u0000-\u0020\u007f]/.test(href) &&
    /^(?:https?:\/\/|mailto:|#)/i.test(href)
  );
}

const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    text(token) {
      // Marked marks inline text inside raw <script>/<style>/<pre> as escaped.
      // That flag is not trustworthy when raw HTML itself has been disabled.
      if (token.escaped) return escapeHtml(token.text);
      return false;
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!allowedLink(href)) return label;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(href)}"${titleAttribute} rel="noopener noreferrer">${label}</a>`;
    },
    image({ text }) {
      // No img, srcset, or other request-bearing element is emitted.
      return escapeHtml(text);
    },
    code({ text, lang }) {
      const language = codeLanguage((lang ?? "").split(/\s/)[0]);
      const attribute = language ? ` class="language-${language}"` : "";
      return `<pre><code${attribute}>${highlightCode(text, language)}</code></pre>\n`;
    },
  },
});

/** Render GFM to safe HTML: no raw HTML, external images, or unsafe links. */
export function renderMarkdown(text) {
  return markdown.parse(String(text ?? ""));
}
