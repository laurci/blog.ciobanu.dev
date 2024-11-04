import {unified} from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeFormat from "rehype-format";
import rehypeStringify from "rehype-stringify";
import rehypeHighlight from "rehype-highlight";

export default async function markdownToHtml(markdown: string) {
    const result = await unified()
        .use(remarkParse)
        .use(remarkRehype)
        .use(rehypeFormat)
        .use(rehypeHighlight, {
            languages: {
                's': require("highlight.js/lib/languages/x86asm"),
            }
        })
        .use(rehypeStringify)
        .process(markdown);

    return result.toString();
}
