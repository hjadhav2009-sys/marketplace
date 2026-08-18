import ProfessionalProblemsPage from "./ProfessionalProblemsPage";

export default async function WorkProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    source?: string;
    stage?: string;
    success?: string;
    error?: string;
  }>;
}) {
  return <ProfessionalProblemsPage searchParams={searchParams} />;
}
