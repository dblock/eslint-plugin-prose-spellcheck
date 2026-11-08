import { Text } from "cspell-lib";
import { proseGroups } from "./prose.js";

export function createSpellchecker(dictionary) {
  return {
    meta: {
      type: "problem",
      languages: ["markdown/*"],
      docs: {
        description: "Report unknown words in Markdown prose.",
        url: "https://github.com/dblock/eslint-plugin-prose-spellcheck#usage",
      },
      schema: [],
      messages: { unknownWord: 'Unknown word: "{{word}}".' },
    },
    create(context) {
      const source = context.sourceCode;
      return {
        root(node) {
          for (const group of proseGroups(node, source.text)) {
            for (const candidate of Text.extractPossibleWordsFromTextOffset({ text: group.text, offset: 0 })) {
              const trimmed = candidate.text.match(/[\p{L}\p{M}\p{N}_](?:[\s\S]*[\p{L}\p{M}\p{N}_])?/u);
              if (!trimmed) continue;
              const whole = { text: trimmed[0], offset: candidate.offset + trimmed.index };
              if (dictionary.has(whole.text)) continue;
              for (const word of Text.extractWordsFromCodeTextOffset(whole)) {
                if (dictionary.has(word.text)) continue;
                const start = group.spans[word.offset][0];
                const end = group.spans[word.offset + word.text.length - 1][1];
                context.report({
                  node: group.nodes[word.offset],
                  loc: { start: source.getLocFromIndex(start), end: source.getLocFromIndex(end) },
                  messageId: "unknownWord",
                  data: { word: word.text },
                });
              }
            }
          }
        },
      };
    },
  };
}
