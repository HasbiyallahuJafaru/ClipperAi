import { NewProject } from "../../new-project";

export default function NewProjectPage() {
  return (
    <section className="pt-10">
      <h1 className="font-display text-3xl tracking-tight">New project</h1>
      <div className="mt-8">
        <NewProject />
      </div>
    </section>
  );
}
