import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import { decodeString } from "micromark-util-decode-string";

const gfmOptions = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] };
const decodedTokens = /\\[\s\S]|&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});|\0|[\s\S]/gu;
const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/gu;
const nonProse = new Set(["code", "inlineCode", "html", "definition", "yaml", "toml", "json", "math", "inlineMath"]);
const blocks = new Set(["paragraph", "heading", "tableCell"]);

function mappedText(node, source, base) {
  const start = base + node.position.start.offset;
  const raw = source.slice(start, base + node.position.end.offset);
  let decoded = "";
  const spans = [];
  for (const match of raw.matchAll(decodedTokens)) {
    const value = match[0] === "\0" ? "\uFFFD" : decodeString(match[0]);
    for (let index = 0; index < value.length; index++) {
      spans.push(value === match[0]
        ? [start + match.index + index, start + match.index + index + 1]
        : [start + match.index, start + match.index + match[0].length]);
    }
    decoded += value;
  }
  const rawLines = [...decoded.matchAll(linePattern)].filter((match) => match[0]);
  const valueLines = [...node.value.matchAll(linePattern)].filter((match) => match[0]);
  const mapped = [];
  if (rawLines.length !== valueLines.length) throw new Error("Cannot map Markdown text to its original source.");
  for (const [index, valueLine] of valueLines.entries()) {
    const rawLine = rawLines[index];
    // Continuation lines can contain list/quote prefixes outside the text value.
    const column = rawLine[0].lastIndexOf(valueLine[0]);
    if (column < 0) throw new Error("Cannot map Markdown text to its original source.");
    mapped.push(...spans.slice(rawLine.index + column, rawLine.index + column + valueLine[0].length));
  }
  return { text: node.value, spans: mapped };
}

function labelEnd(source, start, end) {
  let depth = 1;
  for (let index = start; index < end; index++) {
    const char = source[index];
    if (char === "\\") {
      index++;
    } else if (char === "`") {
      const run = source.slice(index).match(/^`+/u)[0];
      let close = source.indexOf(run, index + run.length);
      while (close >= 0 && (source[close - 1] === "`" || source[close + run.length] === "`")) {
        close = source.indexOf(run, close + run.length);
      }
      if (close >= 0 && close < end) index = close + run.length - 1;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      if (--depth === 0) return index;
      if (source[index + 1] === "(") {
        let parentheses = 1;
        for (index += 2; index < end && parentheses; index++) {
          if (source[index] === "\\") index++;
          else if (source[index] === "(") parentheses++;
          else if (source[index] === ")") parentheses--;
        }
        index--;
      }
    }
  }
  throw new Error("Cannot locate the Markdown image description.");
}

export function proseGroups(root, source) {
  const groups = [];
  const eligible = Array(source.length).fill(" ");
  const definitions = [];
  function collectDefinitions(node) {
    if (node.type === "definition") definitions.push(node);
    for (const child of node.children ?? []) collectDefinitions(child);
  }
  collectDefinitions(root);
  const references = definitions.length
    ? `\n\n${toMarkdown({ type: "root", children: definitions })}` : "";
  let commonMarkImages;
  function collectImageDescriptions(node) {
    if (node.type === "image" || node.type === "imageReference") {
      commonMarkImages.set(node.position.start.offset, node.alt);
    }
    for (const child of node.children ?? []) collectImageDescriptions(child);
  }

  function addText(group, node, base, owner) {
    const mapped = mappedText(node, source, base);
    group.text += mapped.text;
    group.spans.push(...mapped.spans);
    group.nodes.push(...Array(mapped.text.length).fill(owner ?? node));
    const start = base + node.position.start.offset;
    const end = base + node.position.end.offset;
    for (let index = start; index < end; index++) eligible[index] = source[index];
  }

  function inline(group, node, base, owner, imageGfm) {
    if (node.type === "text") {
      addText(group, node, base, owner);
    } else if (node.type === "image" || node.type === "imageReference") {
      group.text += " ";
      group.spans.push(undefined);
      group.nodes.push(undefined);
      const start = base + node.position.start.offset + 2;
      const end = labelEnd(source, start, base + node.position.end.offset);
      const imageStart = start - 2;
      if (!commonMarkImages) {
        commonMarkImages = new Map();
        collectImageDescriptions(fromMarkdown(source));
      }
      const dialect = imageGfm ?? (commonMarkImages.get(imageStart) !== node.alt);
      // The unfinished original opener keeps labels inline without flattening their children.
      // Native alt text identifies the dialect; serialized definitions retain reference context.
      walk(fromMarkdown(source.slice(imageStart, end) + references, dialect ? gfmOptions : undefined),
        imageStart, owner ?? node, dialect);
    } else if (nonProse.has(node.type) || node.type === "break") {
      group.text += " ";
      group.spans.push(undefined);
      group.nodes.push(undefined);
    } else {
      for (const child of node.children ?? []) inline(group, child, base, owner, imageGfm);
    }
  }

  function walk(node, base = 0, owner, imageGfm) {
    if (nonProse.has(node.type)) return;
    if (blocks.has(node.type)) {
      const group = { text: "", spans: [], nodes: [] };
      groups.push(group);
      for (const child of node.children) inline(group, child, base, owner, imageGfm);
    } else {
      for (const child of node.children ?? []) walk(child, base, owner, imageGfm);
    }
  }

  walk(root);
  const liquid = [...eligible.join("").matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/gu)]
    .map((match) => [match.index, match.index + match[0].length]);
  for (const group of groups) {
    group.text = group.text.split("").map((char, index) => {
      const span = group.spans[index];
      return span && liquid.some(([start, end]) => span[0] < end && span[1] > start) ? " " : char;
    }).join("");
    group.text = group.text.replace(
      /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]+|\b(?:mailto:)?[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu,
      (match) => " ".repeat(match.length),
    );
  }
  return groups;
}
