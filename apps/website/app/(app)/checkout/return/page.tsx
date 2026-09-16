import { Return } from "./return";

export default async function ReturnPage({ searchParams }: PageProps<"/checkout/return">) {
  const { reference } = await searchParams;
  return <Return reference={typeof reference === "string" ? reference : ""} />;
}
