import { AcademySpace } from "@/components/public/academy-space";
import { DanceStyles } from "@/components/public/dance-styles";
import { FaqSection } from "@/components/public/faq-section";
import { Hero } from "@/components/public/hero";
import { JsonLd } from "@/components/public/json-ld";
import { LocationSection } from "@/components/public/location-section";
import { Manifesto } from "@/components/public/manifesto";
import { ProfessorShowcase } from "@/components/public/professor-showcase";
import { ScheduleSection } from "@/components/public/schedule-section";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { faqJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import {
  fetchPrimaryBranch,
  fetchPublicDanceStyles,
  fetchPublicFaq,
  fetchPublicProfessors,
  fetchPublicSchedule,
  fetchSiteImages,
  fetchUpcomingClasses
} from "@/lib/public-site/queries";

// "Próximas clases" depends on the current time: regenerate every 10 minutes.
export default async function HomePage() {
  const [branch, styles, professors, schedule, upcoming, faq, images] = await Promise.all([
    fetchPrimaryBranch(),
    fetchPublicDanceStyles(),
    fetchPublicProfessors(),
    fetchPublicSchedule(),
    fetchUpcomingClasses(3),
    fetchPublicFaq(),
    fetchSiteImages()
  ]);

  return (
    <>
      <Hero image={images.hero} branch={branch} styles={styles} />
      <Manifesto image={images.manifesto} branch={branch} styles={styles} />
      {styles.length ? <DanceStyles styles={styles} professors={professors} /> : null}
      {professors.length ? <ProfessorShowcase professors={professors} styles={styles} /> : null}
      <ScheduleSection entries={schedule.entries} upcoming={upcoming} isPlaceholder={schedule.isPlaceholder} />
      <AcademySpace branch={branch} images={[images.spaceBarre, images.spaceGroup, images.spaceClass]} />
      <LocationSection branch={branch} />
      <FaqSection items={faq} />
      <FinalCta image={images.finalCta} />
      <JsonLd data={jsonLdGraph([faqJsonLd(faq)])} />
    </>
  );
}
