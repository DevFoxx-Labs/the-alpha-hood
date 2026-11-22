import { connection } from "next/server";
import { Suspense } from "react";

async function Connection() {
  await connection();
  return null;
}

/**
 * Next 16 Cache Components: `generateMetadata` that reads `params` is URL (runtime) data and can't sit in
 * <Suspense>. This marker (docs: migrating-to-cache-components → generateMetadata) tells Next the page is
 * intentionally partly dynamic, so the shell still prerenders and the metadata streams. Renders nothing.
 */
export function DynamicMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}
