"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import AddToHomescreen from "@components/AddToHomescreen";
import { Button } from "@coss/ui/components/button";
import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { getServerSideProps } from "@server/lib/auth/login/getServerSideProps";
import Link from "next/link";

const WHAP_LOGIN_URL = process.env.NEXT_PUBLIC_WHAP_LOGIN_URL || "http://localhost:8001/login";

function BackgroundGrid() {
  const rows = 9;
  const cols = 18;
  const size = 60;
  const gap = 8;
  const radius = 8;
  const width = cols * size + (cols - 1) * gap;
  const height = rows * size + (rows - 1) * gap;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <svg
        aria-hidden="true"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className="[--grid-fill:#f7f7f7] [--grid-stroke:rgba(34,42,53,0.08)] dark:[--grid-fill:#1f1f1f] dark:[--grid-stroke:rgba(255,255,255,0.08)]">
        <defs>
          <radialGradient id="gridFade" cx="50%" cy="50%" rx="70%" ry="70%">
            <stop offset="20%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="gridMask">
            <rect width={width} height={height} fill="url(#gridFade)" />
          </mask>
          <filter id="gridShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(34,42,53,0.05)" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(19,19,22,0.03)" />
          </filter>
        </defs>
        <g mask="url(#gridMask)">
          {Array.from({ length: rows * cols }).map((_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * (size + gap);
            const y = row * (size + gap);
            return (
              <rect
                key={`${row}-${col}`}
                x={x}
                y={y}
                width={size}
                height={size}
                rx={radius}
                fill="var(--grid-fill)"
                stroke="var(--grid-stroke)"
                strokeWidth="1"
                filter="url(#gridShadow)"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
export type PageProps = inferSSRProps<typeof getServerSideProps>;
export default function Login() {
  const { t } = useLocale();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-default/80 px-4 py-10">
      <BackgroundGrid />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* Main Card */}
        <div className="w-full rounded-xl border border-subtle bg-default p-10 shadow-sm">
          {/* Logo */}
          <div className="mb-2 text-center">
            <img className="mx-auto mb-3 size-12" src="/whap-icon.svg" alt="Whap" />
            <h1 className="font-cal text-xl font-bold text-emphasis">{t("whap_calendar_title")}</h1>
          </div>

          <p className="mb-8 text-center text-sm text-subtle" data-testid="login-subtitle">
            {t("whap_calendar_sign_in")}
          </p>

          <Button
            className="w-full"
            render={<Link href={WHAP_LOGIN_URL} target="_self" data-testid="go-to-whap-login" />}>
            {t("go_to_whap_login")}
          </Button>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-xs text-subtle">{t("whap_powered_by_caldiy")}</p>
        </div>
      </div>

      <AddToHomescreen />
    </div>
  );
}
