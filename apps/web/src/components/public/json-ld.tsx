/** Renders a pre-serialized (and escaped) JSON-LD document. See lib/public-site/json-ld.ts. */
export function JsonLd({ data }: { data: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />;
}
