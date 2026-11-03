import { Children, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import mermaid from "mermaid";
import { ImageOff, Download, AlertCircle } from "lucide-react";
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  suppressErrorRendering: true,
});
let diagramId = 0;
function Diagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    mermaid
      .render("diagram-" + ++diagramId, code)
      .then(({ svg }) => {
        if (live && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (live) setError("图表语法有误，已保留源代码");
      });
    return () => {
      live = false;
    };
  }, [code]);
  return (
    <div data-no-anchor className="diagram">
      {error ? (
        <>
          <small>
            <AlertCircle size={14} />
            {error}
          </small>
          <pre>{code}</pre>
        </>
      ) : (
        <div ref={ref} />
      )}
    </div>
  );
}
function LocalImage({
  docId,
  src,
  alt,
}: {
  docId: string;
  src: string;
  alt: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const remote = /^https?:\/\//i.test(src);
  const load = () => {
    setError("");
    window.reader
      .image(docId, src, remote)
      .then(setUrl)
      .catch((e) => setError(String(e.message)));
  };
  useEffect(() => {
    setUrl("");
    setError("");
    if (!remote) load();
  }, [src, docId]);
  return (
    <span data-no-anchor className="document-image">
      {url ? (
        <img src={url} alt={alt} />
      ) : (
        <span className="image-placeholder">
          <ImageOff size={20} />
          <span>{error || alt || "图片"}</span>
          {remote && (
            <button onClick={load}>
              <Download size={14} />
              加载远程图片
            </button>
          )}
        </span>
      )}
    </span>
  );
}
export const Markdown = memo(function Markdown({
  source,
  docId,
  onLink,
}: {
  source: string;
  docId: string;
  onLink: (href: string) => void;
}) {
  const components = useMemo(
    () => ({
      img: ({ src, alt }: any) => (
        <LocalImage docId={docId} src={src || ""} alt={alt || ""} />
      ),
      a: ({ href, children }: any) => (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onLink(href || "");
          }}
        >
          {children}
        </a>
      ),
      pre: ({ children }: any) => {
        const child = Children.toArray(children)[0] as any;
        if (child?.props?.className?.split(" ").includes("language-mermaid"))
          return <Diagram code={String(child.props.children)} />;
        return <pre>{children}</pre>;
      },
    }),
    [docId, onLink],
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }], rehypeHighlight]}
      components={components}
      skipHtml
    >
      {source}
    </ReactMarkdown>
  );
});
