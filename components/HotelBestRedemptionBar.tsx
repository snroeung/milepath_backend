'use client';

import type { PointsResult } from '@/lib/points/types';
import { PORTAL_ABBR, PORTAL_NAMES } from '@/lib/points/types';
import { getBestOption } from '@/lib/points/rankOptions';

interface HotelBestRedemptionBarProps {
  result: PointsResult | null;
  onCompareClick: () => void;
  compareLabel: string;
  primaryCta?: { label: string; href?: string };
}

const UpArrowIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} fill="none" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

/**
 * Compact winning-redemption footer for the hotel detail modal's room cards,
 * where there is no room for the full comparison table. List cards use
 * ResultSummaryHeader + RedemptionTable instead.
 */
export function HotelBestRedemptionBar({ result, onCompareClick, compareLabel, primaryCta }: HotelBestRedemptionBarProps) {
  const best = getBestOption(result);
  if (!best) return null;

  const name = best.kind === 'portal' ? best.group.portalName : best.transfer.partnerProgram;
  const pointsNeeded = best.kind === 'portal'
    ? best.group.results[0].pointsNeeded
    : best.transfer.estimatedPointsNeeded;
  const cpp = best.kind === 'portal' ? best.group.results[0].centsPerPoint : best.transfer.transferCpp;
  const abbr = best.kind === 'portal' ? (PORTAL_ABBR[best.group.portalId] ?? 'pts') : 'pts';
  const isBestValue = (cpp ?? 0) > 1.0;
  const transferTag = best.kind === 'transfer'
    ? `⇄ Transfer via ${PORTAL_NAMES[best.transfer.sourcePortalId]}`
    : null;

  return (
    <div className="bg-cv-navy-950 px-4 pt-3.5 pb-4 mt-auto">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[8.5px] font-bold font-mono tracking-widest text-cv-navy-400 uppercase truncate pr-2">
          {name}
        </p>
        {transferTag ? (
          <span className="text-[8.5px] font-extrabold font-mono text-cv-sky-300 uppercase shrink-0">
            {transferTag}
          </span>
        ) : isBestValue && (
          <span className="text-[8.5px] font-extrabold font-mono text-cv-green-500 uppercase shrink-0 flex items-center gap-0.5">
            <UpArrowIcon />
            Above face
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        {pointsNeeded !== null ? (
          <>
            <span className="font-mono text-lg font-extrabold text-cv-lime-400 leading-none">
              {pointsNeeded.toLocaleString()}
            </span>
            <span className="text-xs text-cv-navy-300">{abbr}{cpp !== null && ` · ${cpp}¢/pt`}</span>
          </>
        ) : (
          <span className="text-xs text-cv-navy-300 italic">check program for pricing</span>
        )}
      </div>
      {primaryCta && (
        primaryCta.href ? (
          <a
            href={primaryCta.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-full bg-cv-lime-500 hover:bg-cv-lime-400 text-cv-navy-950 font-extrabold text-xs min-h-11 rounded-lg transition-colors"
          >
            {primaryCta.label}
          </a>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="flex items-center justify-center w-full bg-cv-lime-500 text-cv-navy-950 font-extrabold text-xs min-h-11 rounded-lg opacity-50 cursor-not-allowed"
            >
              {primaryCta.label}
            </span>
            <p className="text-[9px] text-cv-navy-300 mt-1 text-center">
              Not linked yet — visit {name} directly to book
            </p>
          </>
        )
      )}
      <button
        onClick={onCompareClick}
        className="w-full mt-1.5 bg-transparent text-white border border-white/20 hover:border-white/40 font-bold text-xs min-h-11 rounded-lg transition-colors flex items-center justify-center gap-1.5"
      >
        {compareLabel}
        <ChevronIcon />
      </button>
    </div>
  );
}
