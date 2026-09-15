import { NewProject } from "@/app/new-project";
import { PageHeader } from "@/app/ui";

export default function NewProjectPage() {
  return (
    <section>
      <PageHeader title="New project">
        Paste links or upload videos. Each one becomes its own project with clips, captions and posts.
      </PageHeader>
      <div className="mt-8 max-w-3xl">
        <NewProject />
      </div>
    </section>
  );
}
