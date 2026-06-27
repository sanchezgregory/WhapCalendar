"use client";

import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { ShellMainAppDir } from "app/(use-page-wrapper)/(main-nav)/ShellMainAppDir";
import type { ReactElement } from "react";
import { useState } from "react";

import EventTypes, { EventTypesCTA, SearchContext } from "~/event-types/views/event-types-listing-view";

type GetUserEventGroupsResponse = Parameters<typeof EventTypesCTA>[0]["userEventGroupsData"];

const CTAWithContext = ({
  userEventGroupsData,
  isWhapMediator,
}: {
  userEventGroupsData: GetUserEventGroupsResponse;
  isWhapMediator: boolean;
}): ReactElement => {
  return <EventTypesCTA userEventGroupsData={userEventGroupsData} isWhapMediator={isWhapMediator} />;
};

export function EventTypesWrapper({
  userEventGroupsData,
  user,
  isWhapMediator,
}: {
  userEventGroupsData: GetUserEventGroupsResponse;
  user: {
    id: number;
    completedOnboarding?: boolean;
  } | null;
  isWhapMediator: boolean;
}): ReactElement {
  const { t } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  return (
    <SearchContext.Provider value={{ searchTerm, setSearchTerm, debouncedSearchTerm }}>
      <ShellMainAppDir
        heading={t("event_types_page_title")}
        subtitle={t("event_types_page_subtitle")}
        CTA={<CTAWithContext userEventGroupsData={userEventGroupsData} isWhapMediator={isWhapMediator} />}>
        <EventTypes userEventGroupsData={userEventGroupsData} user={user} />
      </ShellMainAppDir>
    </SearchContext.Provider>
  );
}
