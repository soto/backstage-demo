/**
 * Parses Livebook .livemd files into structured HTML.
 *
 * Livebook format:
 *   # Title            -> Document title
 *   ## Section         -> Section headers
 *   Regular markdown   -> Prose blocks
 *   ```elixir          -> Elixir code cells
 *   <!-- livebook:{"autosave":true} --> -> Livebook metadata (hidden)
 *   ```                -> End of code block
 *
 * Special Livebook sections:
 *   ## Setup            -> Setup cell (dependency installs, etc.)
 *   ```elixir           -> Elixir code in a cell
 */
export interface ParsedLivebook {
  title: string;
  html: string;
  rawMarkdown: string;
}

export function parseLivemd(content: string): ParsedLivebook {
  const lines = content.split('\n');
  let title = 'Untitled Livebook';
  const htmlParts: string[] = [];
  let i = 0;

  // Extract title from first H1
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      i++;
      break;
    }
    // Skip livebook metadata comments
    if (line.trim().startsWith('<!-- livebook:')) {
      i++;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    break;
  }

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBuffer: string[] = [];
  let proseBuffer: string[] = [];
  let isSetupSection = false;

  const flushProse = () => {
    if (proseBuffer.length > 0) {
      const text = proseBuffer.join('\n').trim();
      if (text) {
        htmlParts.push(markdownToHtml(text));
      }
      proseBuffer = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      const code = escapeHtml(codeBuffer.join('\n'));
      const cellClass = isSetupSection
        ? 'livebook-elixir-cell livebook-setup-cell'
        : 'livebook-elixir-cell';
      const label =
        codeBlockLang === 'elixir' || codeBlockLang === 'erlang'
          ? codeBlockLang.charAt(0).toUpperCase() + codeBlockLang.slice(1)
          : codeBlockLang || 'Code';

      if (codeBlockLang === 'elixir' || codeBlockLang === 'erlang') {
        htmlParts.push(
          `<div class="${cellClass}">` +
            `<span class="livebook-cell-label">${label}</span>` +
            `<pre><code class="language-${codeBlockLang}">${code}</code></pre>` +
            `</div>`,
        );
      } else if (codeBlockLang === 'output') {
        htmlParts.push(`<div class="livebook-output">${code}</div>`);
      } else {
        htmlParts.push(
          `<pre><code class="language-${codeBlockLang || 'text'}">${code}</code></pre>`,
        );
      }
      codeBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Skip livebook metadata comments
    if (line.trim().startsWith('<!-- livebook:')) {
      flushProse();
      i++;
      continue;
    }

    // Code fence start
    if (!inCodeBlock && line.trimStart().startsWith('```')) {
      flushProse();
      inCodeBlock = true;
      codeBlockLang = line.trimStart().slice(3).trim();
      codeBuffer = [];
      i++;
      continue;
    }

    // Code fence end
    if (inCodeBlock && line.trimStart() === '```') {
      flushCode();
      inCodeBlock = false;
      codeBlockLang = '';
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      i++;
      continue;
    }

    // Section headers - detect setup sections
    if (line.startsWith('## ')) {
      flushProse();
      const sectionTitle = line.slice(3).trim();
      isSetupSection = sectionTitle.toLowerCase().includes('setup');
      htmlParts.push(`<h2>${escapeHtml(sectionTitle)}</h2>`);
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      flushProse();
      htmlParts.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`);
      i++;
      continue;
    }

    proseBuffer.push(line);
    i++;
  }

  // Flush any remaining content
  flushProse();
  if (inCodeBlock) {
    flushCode();
  }

  return {
    title,
    html: htmlParts.join('\n'),
    rawMarkdown: content,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Minimal markdown-to-HTML for prose blocks.
 * Handles bold, italic, inline code, links, lists, blockquotes, images, and tables.
 */
function markdownToHtml(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let inBlockquote = false;
  let blockquoteBuffer: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableAligns: string[] = [];

  const flushBlockquote = () => {
    if (blockquoteBuffer.length > 0) {
      result.push(
        `<blockquote><p>${inlineMarkdown(blockquoteBuffer.join(' '))}</p></blockquote>`,
      );
      blockquoteBuffer = [];
      inBlockquote = false;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      let html = '<table><thead><tr>';
      const headers = tableRows[0];
      headers.forEach((h, idx) => {
        const align = tableAligns[idx] ? ` style="text-align:${tableAligns[idx]}"` : '';
        html += `<th${align}>${inlineMarkdown(h.trim())}</th>`;
      });
      html += '</tr></thead><tbody>';
      for (let r = 1; r < tableRows.length; r++) {
        html += '<tr>';
        tableRows[r].forEach((cell, idx) => {
          const align = tableAligns[idx] ? ` style="text-align:${tableAligns[idx]}"` : '';
          html += `<td${align}>${inlineMarkdown(cell.trim())}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table>';
      result.push(html);
      tableRows = [];
      tableAligns = [];
      inTable = false;
    }
  };

  const flushList = () => {
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushBlockquote();
      flushList();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      // Check if this is a separator row
      if (cells.every(c => /^[-:]+$/.test(c))) {
        tableAligns = cells.map(c => {
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return '';
        });
        inTable = true;
        continue;
      }

      if (!inTable && tableRows.length === 0) {
        tableRows.push(cells);
        continue;
      }

      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Blockquotes
    if (trimmed.startsWith('> ')) {
      flushList();
      inBlockquote = true;
      blockquoteBuffer.push(trimmed.slice(2));
      continue;
    } else {
      flushBlockquote();
    }

    // Unordered list items
    if (/^[-*+] /.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        flushList();
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*+] /, ''))}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = trimmed.match(/^(\d+)\. (.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    flushList();

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push('<hr />');
      continue;
    }

    // Empty line
    if (trimmed === '') {
      continue;
    }

    // Paragraph
    result.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  flushBlockquote();
  flushTable();
  flushList();

  return result.join('\n');
}

function inlineMarkdown(text: string): string {
  let result = escapeHtml(text);
  // Images: ![alt](src)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img alt="$1" src="$2" />',
  );
  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');
  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return result;
}

/**
 * Extract the title from a .livemd file without parsing the full content.
 */
export function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim();
    }
    // Skip comments and blanks
    if (line.trim().startsWith('<!--') || line.trim() === '') continue;
    break;
  }
  return 'Untitled';
}
