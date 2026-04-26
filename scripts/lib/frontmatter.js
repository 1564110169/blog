export function splitFrontmatter(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);

  if (lines[0] !== '---') {
    return {
      hasFrontmatter: false,
      newline,
      data: {},
      body: content,
      frontmatterLines: [],
      bodyLines: lines
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex === -1) {
    return {
      hasFrontmatter: false,
      newline,
      data: {},
      body: content,
      frontmatterLines: [],
      bodyLines: lines
    };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const bodyLines = lines.slice(endIndex + 1);

  return {
    hasFrontmatter: true,
    newline,
    data: parseFrontmatterLines(frontmatterLines),
    body: bodyLines.join(newline),
    frontmatterLines,
    bodyLines
  };
}

export function parseFrontmatter(content) {
  return splitFrontmatter(content).data;
}

export function updateFrontmatterContent(content, updates) {
  const parsed = splitFrontmatter(content);
  const lines = [...parsed.frontmatterLines];

  if (!parsed.hasFrontmatter) {
    const createdLines = Object.entries(updates).map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
    return ['---', ...createdLines, '---', '', content].join(parsed.newline);
  }

  for (const [key, value] of Object.entries(updates)) {
    setFrontmatterValue(lines, key, value);
  }

  return ['---', ...lines, '---', ...parsed.bodyLines].join(parsed.newline);
}

function parseFrontmatterLines(lines) {
  const data = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (rawValue.trim() === '') {
      const items = [];
      let cursor = index + 1;

      while (cursor < lines.length && /^\s+-\s*/.test(lines[cursor])) {
        items.push(parseYamlScalar(lines[cursor].replace(/^\s+-\s*/, '')));
        cursor += 1;
      }

      data[key] = items;
      index = cursor - 1;
    } else {
      data[key] = parseYamlScalar(rawValue);
    }
  }

  return data;
}

function parseYamlScalar(value) {
  const trimmed = value.trim();

  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '[]') return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((item) => parseYamlScalar(item))
        .filter((item) => item !== '');
    }
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function setFrontmatterValue(lines, key, value) {
  const matcher = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  const existingIndex = lines.findIndex((line) => matcher.test(line));
  const nextLine = `${key}: ${formatYamlValue(value)}`;

  if (existingIndex >= 0) {
    const indent = lines[existingIndex].match(/^\s*/)?.[0] ?? '';
    const removeCount = findValueEnd(lines, existingIndex) - existingIndex;
    lines.splice(existingIndex, removeCount, `${indent}${nextLine}`);
    return;
  }

  const insertAt = findInsertIndex(lines, key);
  lines.splice(insertAt, 0, nextLine);
}

function findValueEnd(lines, startIndex) {
  let cursor = startIndex + 1;
  while (cursor < lines.length && /^\s+-\s*/.test(lines[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findInsertIndex(lines, key) {
  const order = ['title', 'date', 'updated', 'category', 'tags', 'description', 'cover', 'draft'];
  const keyOrder = order.indexOf(key);

  if (keyOrder === -1) return lines.length;

  let insertAt = 0;
  for (const candidate of order.slice(0, keyOrder)) {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${escapeRegExp(candidate)}\\s*:`).test(line));
    if (index >= 0) insertAt = Math.max(insertAt, findValueEnd(lines, index));
  }

  return insertAt;
}

export function formatYamlValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return formatYamlArray(value);
  return quoteYaml(value ?? '');
}

export function formatYamlArray(values) {
  if (!values.length) return '[]';
  return `[${values.map((value) => quoteYaml(value)).join(', ')}]`;
}

export function quoteYaml(value) {
  return `"${escapeYamlString(String(value))}"`;
}

export function escapeYamlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
