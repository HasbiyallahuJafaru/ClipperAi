import { OAuthReturn } from "./return";

export default async function OAuthReturnPage({ searchParams }: PageProps<"/oauth/return">) {
  const { code, state, error } = await searchParams;
  return <OAuthReturn code={typeof code === "string" ? code : ""} state={typeof state === "string" ? state : ""}
                      declined={typeof error === "string" ? error : ""} />;
}
