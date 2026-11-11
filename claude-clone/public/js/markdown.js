/* Alcove — a deliberately small markdown renderer.
   Everything is escaped first, then a handful of constructs are turned back into
   markup. Raw HTML from a message never reaches the DOM. */

import { escapeHtml } from "./ui.js";

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function inline(text) {
  let out = text;
  // Code spans first, so nothing inside them is transformed.
  const codes = [];
  out = out.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const clean = href.trim();
    if (!SAFE_LINK.test(clean)) return label;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });
  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
  return out;
}

function renderTable(rows) {
  const head = rows[0];
  const body = rows.slice(2);
  const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const html = [`<table><thead><tr>${cells(head).map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>`];
  for (const row of body) {
    html.push(`<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`);
  }
  html.push("</tbody></table>");
  return html.join("");
}

export function renderMarkdown(source) {
  const text = escapeHtml(String(source || "").replace(/\r\n/g, "\n"));
  const lines = text.split("\n");
  const html = [];
  let index = 0;
  let paragraph = [];
  let list = null;
  let quote = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote>${quote.map((line) => `<p>${inline(line)}</p>`).join("")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*```/.test(line)) {
      flushAll();
      const language = line.replace(/^\s*```/, "").trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(
        `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${code.join("\n")}</code></pre>`
      );
      continue;
    }

    if (!line.trim()) {
      flushAll();
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      flushAll();
      html.push("<hr />");
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ""));
      index += 1;
      continue;
    }
    if (quote.length) flushQuote();

    if (/^\s*\|.+\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) {
      flushAll();
      const rows = [];
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        rows.push(lines[index].trim());
        index += 1;
      }
      html.push(renderTable(rows));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
      index += 1;
      continue;
    }
    if (list) flushList();

    paragraph.push(line.trim());
    index += 1;
  }

  flushAll();
  return html.join("\n");
}
