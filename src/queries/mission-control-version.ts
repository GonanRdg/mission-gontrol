import { queryOptions, useQuery } from "@tanstack/react-query";

declare const __MC_VERSION__: string;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const CURRENT_MC_VERSION: string =
  typeof __MC_VERSION__ !== "undefined" ? __MC_VERSION__ : "0.0.0";

type LatestRelease = {
  latestVersion: string | null;
  downloadUrl: string;
  isUpdateAvailable: boolean;
};

// FORK BUILD — no release feed.
//
// Upstream polls agentsystem.dev for the newest published release and offers a
// download when it outranks the running build. This fork is distributed
// independently and must not report another project's releases as its own
// updates, so the check is inert: no request is made, and every consumer sees
// "no update, nowhere to download". Releases for this fork are published on its
// own GitHub repo and installed manually.
//
// The shape is kept so callers compile unchanged and the upstream version of
// this file stays easy to merge.
async function fetchLatest(): Promise<LatestRelease> {
  return { latestVersion: null, downloadUrl: "", isUpdateAvailable: false };
}

export const latestMissionControlVersionQueryOptions = queryOptions({
  queryKey: ["mission-control", "latest-version"] as const,
  queryFn: fetchLatest,
  staleTime: MS_PER_HOUR,
  gcTime: MS_PER_DAY,
  retry: 1,
  refetchOnWindowFocus: false,
});

export const useLatestMissionControlVersion = () =>
  useQuery(latestMissionControlVersionQueryOptions);
