import { Checkout } from "./checkout";

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const { plan } = await searchParams;
  return <Checkout planId={typeof plan === "string" ? plan : ""} />;
}
