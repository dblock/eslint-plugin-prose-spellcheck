export default {
  meta: { name: "project-documentation" },
  rules: {
    "single-line-paragraphs": {
      meta: {
        type: "layout",
        languages: ["markdown/*"],
        schema: [],
        messages: { wrapped: "Keep each Markdown paragraph on one source line." },
      },
      create(context) {
        return {
          paragraph(node) {
            if (node.position.start.line !== node.position.end.line) {
              context.report({ node, messageId: "wrapped" });
            }
          },
        };
      },
    },
  },
};
