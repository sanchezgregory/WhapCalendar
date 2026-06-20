import type { Prisma } from "@calcom/prisma/client";

import isPrismaObj from "./isPrismaObj";

const hasKeyInMetadata = <T extends string>(
  x: { metadata: unknown } | null,
  key: T
): x is { metadata: { [key in T]: Prisma.JsonValue } } =>
  isPrismaObj(x?.metadata) && !!x?.metadata && key in x.metadata;

export default hasKeyInMetadata;
