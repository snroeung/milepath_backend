'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { CollectionBanner } from '@/components/CollectionBanner';
import { TransferBonusBanner } from '@/components/TransferBonusBanner';
import { usePointsCalc } from '@/hooks/usePointsCalc';
import { useLiveTransferBonus } from '@/lib/points/transferBonus';

function nightsBetween(checkIn: string, checkOut: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / msPerDay);
}

function ratingLabel(score: number): string | null {
  if (score >= 9.0) return 'Exceptional';
  if (score >= 8.5) return 'Excellent';
  if (score >= 7.5) return 'Very Good';
  if (score >= 6.5) return 'Good';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HotelCard({ searchResult, onOpenDetail }: { searchResult: any; defaultCollapsed?: boolean; onOpenDetail?: (sr: any) => void }) {
  const { isDark } = useTheme();

  const acc         = searchResult.accommodation;
  const checkIn     = searchResult.check_in_date as string;
  const checkOut    = searchResult.check_out_date as string;
  const nights      = nightsBetween(checkIn, checkOut);
  const totalAmount = parseFloat(searchResult.cheapest_rate_total_amount ?? '0');
  const currency    = searchResult.cheapest_rate_currency ?? 'USD';
  const perNight    = nights > 0 ? totalAmount / nights : totalAmount;

  const name        = acc.name ?? 'Hotel';
  const stars       = acc.rating as number | null;
  const reviewScore = acc.review_score as number | null;
  const reviewCount = acc.review_count as number | null;
  const lineOne     = acc.location?.address?.line_one ?? '';
  const city        = acc.location?.address?.city_name ?? '';
  const country     = acc.location?.address?.country_code ?? '';
  const streetPart  = lineOne && !acc.name?.toLowerCase().includes(lineOne.toLowerCase()) ? lineOne : '';
  const location    = [streetPart, city, country].filter(Boolean).join(', ');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amenities   = (acc.amenities ?? []).slice(0, 6) as any[];
  const firstPhoto  = (acc.photos?.[0]?.url ?? null) as string | null;

  const scoreLabel = reviewScore !== null && reviewScore !== undefined ? ratingLabel(reviewScore) : null;
  const nightLabel = `${nights} night${nights !== 1 ? 's' : ''}`;

  const cardBg      = isDark ? 'bg-gph-dark-card border-gph-dark-line' : 'bg-white border-gray-200';
  const textPrimary = isDark ? 'text-gph-dark-ink'   : 'text-gray-900';
  const textMuted   = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const pillBg      = isDark ? 'bg-gph-dark-linesoft text-gph-dark-muted' : 'bg-gray-100 text-gray-600';
  const dividerCls  = isDark ? 'border-gph-dark-line' : 'border-gray-200';

  const collection = searchResult.collection as { collection_name: string; issuer: string; perk_summary: string; source_url: string | null; limited_time_offer?: boolean } | undefined;

  const ptsResult = usePointsCalc(totalAmount, 'hotel', undefined, undefined, name);
  const tripDates = [checkIn, checkOut];
  const bonus = useLiveTransferBonus(ptsResult, tripDates);
  const hasTopBanner = !!collection || !!bonus;
  const scopeNote = `applies to all ${nightLabel}`;

  const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });

  return (
    <article data-testid="hotel-card" className={`rounded-xl border ${cardBg}`}>
      {collection && (
        <CollectionBanner
          collectionName={collection.collection_name}
          issuer={collection.issuer}
          perkSummary={collection.perk_summary}
          sourceUrl={collection.source_url}
          limitedTimeOffer={collection.limited_time_offer}
        />
      )}
      {/* 1. Transfer-bonus notice */}
      <TransferBonusBanner result={ptsResult} tripDates={tripDates} rounded={!collection} scopeNote={scopeNote} />

      {/* 2. Property block — last section, so it owns the card's bottom corners.
             The redemption comparison lives in the detail modal's room cards:
             pricing is per room, so a card-level winner would be guesswork. */}
      <div className={`flex flex-col md:flex-row md:h-44 overflow-hidden rounded-b-xl ${hasTopBanner ? '' : 'rounded-t-xl'}`}>
        <div
          className={`relative w-full aspect-square md:aspect-auto md:w-44 md:h-full shrink-0 ${onOpenDetail ? 'cursor-pointer' : ''}`}
          onClick={() => onOpenDetail?.(searchResult)}
          role={onOpenDetail ? 'button' : undefined}
          tabIndex={onOpenDetail ? 0 : undefined}
          onKeyDown={onOpenDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') onOpenDetail(searchResult); } : undefined}
          aria-label={onOpenDetail ? `View details for ${name}` : undefined}
        >
          {firstPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet
            <img
              src={firstPhoto}
              alt={name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-4xl ${isDark ? 'bg-gph-dark-linesoft' : 'bg-gray-100'}`}>
              🏨
            </div>
          )}
        </div>

        {/* Info — border-t separates it from the photo when stacked on mobile */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden border-t md:border-t-0 ${dividerCls}`}>
          <div className="flex-1 p-5 overflow-hidden">
            {/* Cash price — the room-level redemption comparison prices against it */}
            <div className="float-right ml-4 text-right">
              <p className={`text-[10px] font-bold font-mono tracking-widest uppercase mb-1 ${textMuted}`}>
                From
              </p>
              <p className={`text-2xl font-extrabold tracking-tight leading-none ${textPrimary}`}>
                {fmtMoney(totalAmount)}
              </p>
              <p className={`text-xs mt-0.5 ${textMuted}`}>{fmtMoney(perNight)}/night</p>
            </div>

            {/* Stars + review count */}
            <div className="flex items-center gap-2 mb-1.5">
              {stars !== null && stars !== undefined && (
                <div className="flex gap-0.5" role="img" aria-label={`${stars} star hotel`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} aria-hidden="true" className={`text-xs ${i < stars ? 'text-cv-amber-400' : isDark ? 'text-gph-dark-line' : 'text-gray-200'}`}>★</span>
                  ))}
                </div>
              )}
              {reviewCount !== null && reviewCount !== undefined && (
                <span className={`text-[10px] font-bold font-mono tracking-widest uppercase ${textMuted}`}>
                  {reviewCount.toLocaleString()} reviews
                </span>
              )}
            </div>

            {/* Hotel name */}
            <h3
              className={`text-xl font-extrabold leading-tight tracking-tight mb-1 truncate ${textPrimary} ${onOpenDetail ? 'cursor-pointer hover:underline underline-offset-2' : ''}`}
              onClick={() => onOpenDetail?.(searchResult)}
            >
              {name}
            </h3>

            {location && (
              <p className={`text-sm mb-2.5 truncate ${textMuted}`}>
                {location} · {nightLabel}
              </p>
            )}

            {/* Review score + label */}
            {reviewScore !== null && reviewScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold font-mono ${textPrimary}`}>
                  {reviewScore.toFixed(1)}
                  <span className={`font-normal ${textMuted}`}>/10</span>
                </span>
                {scoreLabel && (
                  <span className={`text-sm font-bold ${isDark ? 'text-cv-green-400' : 'text-cv-green-800'}`}>{scoreLabel}</span>
                )}
              </div>
            )}

            {/* Amenity pills */}
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {amenities.map((a: any, i: number) => (
                  <span key={i} className={`text-[10px] font-bold font-mono tracking-wide px-2.5 py-1 rounded ${pillBg}`}>
                    {a.description ?? a.type}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </article>
  );
}
