'use client';

import { useState } from 'react';
import { PORTAL_TRAVEL_URLS } from '@/lib/points/partnerLinks';
import type { PortalId } from '@/lib/points/types';

const ISSUER_LABELS: Record<string, string> = {
  chase: 'Chase', amex: 'American Express', c1: 'Capital One', bilt: 'Bilt', citi: 'Citi',
};

// Official issuer/portal hostnames — source_url must resolve to one of
// these or we swap it for the issuer's own login/portal link instead of
// sending users to an unverified third-party page.
const ISSUER_OFFICIAL_HOSTS: Record<string, string[]> = {
  chase: ['chase.com'],
  amex: ['americanexpress.com'],
  c1: ['capitalone.com', 'capitalonetravel.com'],
  bilt: ['biltrewards.com'],
  citi: ['citi.com', 'thankyou.com'],
};

function resolveCollectionUrl(sourceUrl: string | null, issuer: string): string | null {
  const loginUrl = PORTAL_TRAVEL_URLS[issuer as PortalId] ?? null;
  if (!sourceUrl) return loginUrl;

  const officialHosts = ISSUER_OFFICIAL_HOSTS[issuer] ?? [];
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
    const isOfficial = officialHosts.some((h) => host === h || host.endsWith(`.${h}`));
    return isOfficial ? sourceUrl : loginUrl;
  } catch {
    return loginUrl;
  }
}

export function CollectionBanner({ collectionName, issuer, perkSummary, sourceUrl, limitedTimeOffer }: { collectionName: string; issuer: string; perkSummary: string; sourceUrl: string | null; limitedTimeOffer?: boolean }) {
  const [open, setOpen]     = useState(false);
  const [pinned, setPinned] = useState(false);

  function close() { setOpen(false); setPinned(false); }
  function toggle() { if (pinned) { close(); } else { setPinned(true); setOpen(true); } }

  const issuerLabel = ISSUER_LABELS[issuer] ?? issuer;
  const linkUrl = resolveCollectionUrl(sourceUrl, issuer);

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 pl-3 pr-4 py-2 rounded-t-xl bg-linear-to-r from-cv-navy-900 via-cv-navy-900 to-cv-blue-900 border-b-2 border-cv-amber-400">
      <span className="flex items-center justify-center w-5 h-5 rounded shrink-0 bg-cv-amber-400 text-cv-navy-900 text-[11px] font-extrabold leading-none">★</span>

      <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-white whitespace-nowrap">
        {collectionName} · {issuerLabel}
      </span>

      {limitedTimeOffer && (
        <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-1.5 py-0.5 rounded bg-cv-amber-400 text-cv-amber-900 dark:bg-cv-amber-400 dark:text-cv-amber-900 whitespace-nowrap">
          Limited time
        </span>
      )}

      <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-cv-navy-400 shrink-0" />

      <span
        className="relative flex items-center shrink-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!pinned) setOpen(false); }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label="View collection perk details"
          className="flex items-center justify-center min-h-11 min-w-11 -my-3.5 shrink-0"
        >
          <span className="flex items-center justify-center w-4 h-4 rounded-full border border-white/70 text-[10px] leading-none text-white">i</span>
        </button>

        {open && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 pl-1.5 z-50">
            <div className="w-72 rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg px-3 py-2 text-xs font-normal leading-relaxed whitespace-normal">
              {perkSummary}
            </div>
          </div>
        )}
      </span>

      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto shrink-0 flex items-center min-h-11 text-[10px] font-bold font-mono tracking-widest uppercase text-cv-sky-300 hover:text-cv-sky-400"
        >
          View collection →
        </a>
      )}
    </div>
  );
}
