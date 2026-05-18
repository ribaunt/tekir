import { headers } from "next/headers";
import { cheynConfig, verifyCheynCallback } from "@/lib/cheyn";
import { MoneroCallbackClient } from "./monero-callback-client";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MoneroCallbackPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") || "https";
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "tekir.co";
  const query = new URLSearchParams();

  Object.entries(params ?? {}).forEach(([key, value]) => {
    const param = firstParam(value);
    if (param !== undefined) query.set(key, param);
  });

  const callbackUrl = `${proto}://${host}/plus/callback/monero?${query.toString()}`;
  const verified = verifyCheynCallback(callbackUrl, cheynConfig.webhookSecret);
  const checkoutId = query.get("checkoutId");

  return <MoneroCallbackClient checkoutId={checkoutId} verified={verified} />;
}
