import { ContactDetail } from "@/components/admin/contacts/contact-detail";
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  return <ContactDetail id={(await params).id} />;
}
