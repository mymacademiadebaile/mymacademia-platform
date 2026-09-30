import type { MetadataRoute } from "next";
import { fetchPublicDanceStyles, fetchPublicProfessors } from "@/lib/public-site/queries";
import { absoluteUrl } from "@/lib/public-site/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [styles, professors] = await Promise.all([fetchPublicDanceStyles(), fetchPublicProfessors()]);
  const realProfessors = professors.filter((professor) => !professor.isPlaceholder);

  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/clases"), changeFrequency: "monthly", priority: 0.9 },
    ...styles.map((style) => ({
      url: absoluteUrl(`/clases/${style.seoSlug}`),
      changeFrequency: "monthly" as const,
      priority: 0.8
    })),
    { url: absoluteUrl("/horarios"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/contacto"), changeFrequency: "yearly", priority: 0.6 },
    // Professor pages join the sitemap only once real profiles exist.
    ...(realProfessors.length
      ? [
          { url: absoluteUrl("/profesores"), changeFrequency: "monthly" as const, priority: 0.6 },
          ...realProfessors.map((professor) => ({
            url: absoluteUrl(`/profesores/${professor.slug}`),
            changeFrequency: "monthly" as const,
            priority: 0.5
          }))
        ]
      : [])
  ];
}
