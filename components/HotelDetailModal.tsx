'use client';

import { useEffect, useRef, useState } from 'react';
import { AddToTripButton } from '@/components/AddToTripButton';
import { HotelBestRedemptionBar } from '@/components/HotelBestRedemptionBar';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useSelectedCards } from '@/contexts/SelectedCardsContext';
import { calcPoints } from '@/lib/points/calcPoints';
import type { PointsResult } from '@/lib/points/types';
import { RedemptionTable } from '@/components/RedemptionTable';
import { trpc } from '@/lib/trpc-client';

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function ratingLabel(score: number): string | null {
  if (score >= 9.0) return 'Exceptional';
  if (score >= 8.5) return 'Excellent';
  if (score >= 7.5) return 'Very Good';
  if (score >= 6.5) return 'Good';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cheapestRoomRate(room: any): any | null {
  const rates = room.rates as { total_amount: string }[];
  if (!rates?.length) return null;
  return rates.reduce((min, r) =>
    parseFloat(r.total_amount) < parseFloat(min.total_amount) ? r : min,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bedLabel(beds: any[] | undefined): string {
  if (!beds?.length) return '';
  return beds.map((b) => `${b.count} ${b.type}`).join(' · ');
}

const BOARD_LABELS: Record<string, string> = {
  room_only: 'Room only',
  breakfast: 'Breakfast incl.',
  half_board: 'Half board',
  full_board: 'Full board',
  all_inclusive: 'All-inclusive',
};

// Popup overlay — z-[60] sits above the hotel modal (z-50).
// Uses capture-phase Escape so it doesn't bubble to the parent modal's handler.
function RoomComparePopup({
  room, nights, currency, pointsResult, isDark, onClose,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  nights: number;
  currency: string;
  pointsResult: PointsResult;
  isDark: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const rate     = cheapestRoomRate(room);
  const price    = rate ? parseFloat(rate.total_amount) : 0;
  const perNight = nights > 0 && price > 0 ? price / nights : price;
  const beds     = bedLabel(room.beds);

  const cardBg  = isDark ? 'bg-gph-dark-card'     : 'bg-white';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  const textPrimary = isDark ? 'text-gph-dark-ink'  : 'text-gray-900';
  const textMuted   = isDark ? 'text-gph-dark-muted': 'text-gray-500';

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`w-full max-w-2xl max-h-[85vh] rounded-xl shadow-xl border flex flex-col ${cardBg} ${borderCls}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className={`px-6 pt-5 pb-4 border-b shrink-0 ${cardBg} ${borderCls}`}>
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <p className={`text-[9.5px] font-bold font-mono tracking-widest uppercase mb-1 ${textMuted}`}>
                Points vs Cash · {pointsResult.portalGroups.length} Portals
              </p>
              <h3 className={`text-lg font-extrabold leading-tight tracking-tight ${textPrimary}`}>
                {room.name}
              </h3>
              <p className={`text-sm mt-1 ${textMuted}`}>
                {beds && <>{beds} · </>}
                <span className={`font-bold font-mono ${textPrimary}`}>
                  {price.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })}
                </span>
                {' '}cash · {perNight.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })}/night · {nights} nights
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close comparison"
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border transition-colors ${borderCls} ${isDark ? 'bg-gph-dark-linesoft hover:bg-gph-dark-line' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} fill="none" className={textPrimary}>
                <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* scrollable ranked comparison */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <RedemptionTable
            result={pointsResult}
            scopeLabel={`${nights} night${nights !== 1 ? 's' : ''}`}
            scopeAdj="stay"
            scopeNote={`applies to all ${nights} night${nights !== 1 ? 's' : ''}`}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AmenityIcon({ type, color }: { type: string; color: string }) {
  const s = {
    width: 17, height: 17,
    stroke: color, strokeWidth: 1.6,
    fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const t = type.toLowerCase();
  if (t.includes('wifi') || t.includes('internet'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill={color}/></svg>;
  if (t.includes('pool') || t.includes('swim'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M3 18c2 0 2-1.4 4-1.4S9 18 11 18s2-1.4 4-1.4S17 18 19 18M3 13.5c2 0 2-1.4 4-1.4S9 13.5 11 13.5s2-1.4 4-1.4 2 1.4 4 1.4M9 11V6a2 2 0 0 1 4 0"/></svg>;
  if (t.includes('gym') || t.includes('fitness'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M5 9v6M8 7v10M16 7v10M19 9v6M8 12h8"/></svg>;
  if (t.includes('restaurant') || t.includes('dining'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.6 1-2.2 3-2.2 6 0 2 2.2 2 2.2 2v10"/></svg>;
  if (t.includes('bar') || t.includes('lounge'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M5 4h14l-7 8zM12 12v6M8 21h8"/></svg>;
  if (t.includes('parking'))
    return <svg viewBox="0 0 24 24" style={s}><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/></svg>;
  if (t.includes('air') || t.includes('ac') || t.includes('climate'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/></svg>;
  if (t.includes('pet') || t.includes('dog') || t.includes('cat'))
    return <svg viewBox="0 0 24 24" style={s}><circle cx="7" cy="9" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="17" cy="9" r="1.6"/><path d="M12 12c-2.4 0-4 1.8-4 3.6 0 1.4 1 2.4 2.4 2.4.8 0 1-.4 1.6-.4s.8.4 1.6.4c1.4 0 2.4-1 2.4-2.4 0-1.8-1.6-3.6-4-3.6Z"/></svg>;
  if (t.includes('laundry') || t.includes('washer'))
    return <svg viewBox="0 0 24 24" style={s}><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6h.01M11 6h.01"/></svg>;
  if (t.includes('breakfast') || t.includes('coffee') || t.includes('room_service'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M4 8h13v5a5 5 0 0 1-10 0V8ZM17 9h2a2 2 0 0 1 0 4h-2M6 3v2M10 3v2M14 3v2"/></svg>;
  if (t.includes('concierge') || t.includes('front_desk') || t.includes('reception'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M5 17a7 7 0 0 1 14 0zM12 4.5V7M4 20.5h16"/></svg>;
  if (t.includes('business') || t.includes('meeting') || t.includes('conference'))
    return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>;
  if (t.includes('spa') || t.includes('sauna'))
    return <svg viewBox="0 0 24 24" style={s}><path d="M3 14c0 4.97 4.03 8 9 8s9-3.03 9-8V9H3v5zM8 5c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2"/></svg>;
  return <svg viewBox="0 0 24 24" style={s}><path d="m5 12 5 5 9-11"/></svg>;
}

function HotelMiniMap({ lat, lng, isDark }: { lat: number; lng: number; isDark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_API_KEY!;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
        center: [lng, lat],
        zoom: 14,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        if (cancelled) return;
        const el = document.createElement('div');
        el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="#2563eb" stroke="white" stroke-width="2"/>
          <circle cx="14" cy="14" r="5" fill="white"/>
        </svg>`;
        new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, isDark]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// Per-room card with its own points panel
function RoomCard({
  room,
  fallbackPhoto,
  nights,
  currency,
  guestCount,
  selectedCards,
  portalPrices,
  hotelChain,
  isDark,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  fallbackPhoto: string | null;
  nights: number;
  currency: string;
  guestCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedCards: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalPrices: any;
  hotelChain?: string;
  isDark: boolean;
}) {
  const [showPopup, setShowPopup] = useState(false);

  const { data: transferPartners } = useQuery({
    queryKey: ['portalData.transferPartners'],
    queryFn:  () => trpc.portalData.listTransferPartners.query(),
  });

  // Falls back to the 5-min app default in app/providers.tsx.
  const { data: pointsValuations } = useQuery({
    queryKey: ['portalData.pointsValuations'],
    queryFn:  () => trpc.portalData.listPointsValuations.query(),
  });

  const rate            = cheapestRoomRate(room);
  const pricePerRoom    = rate ? parseFloat(rate.total_amount) : 0;
  const photo           = (room.photos?.[0]?.url ?? fallbackPhoto) as string | null;
  const beds            = bedLabel(room.beds);
  const board           = rate ? (BOARD_LABELS[rate.board_type] ?? '') : '';
  const refundable      = (rate?.cancellation_timeline?.length ?? 0) > 0;
  const quantityLeft    = (rate?.quantity_available ?? null) as number | null;
  const maxQty          = quantityLeft !== null ? Math.min(quantityLeft, 9) : 9;
  const defaultQty      = Math.min(Math.max(1, Math.ceil(guestCount / 2)), maxQty);
  const [roomQty, setRoomQty] = useState(defaultQty);

  const totalPrice      = pricePerRoom * roomQty;

  const pointsResult = totalPrice > 0
    ? calcPoints(totalPrice, 'hotel', selectedCards.length > 0 ? selectedCards : undefined, undefined, portalPrices, hotelChain, transferPartners, pointsValuations)
    : null;

  const cardBg      = isDark ? 'bg-gph-dark-bg border-gph-dark-line' : 'bg-gray-50 border-gray-200';
  const textPrimary = isDark ? 'text-gph-dark-ink'                   : 'text-gray-900';
  const textMuted   = isDark ? 'text-gph-dark-muted'                 : 'text-gray-500';
  const divider     = isDark ? 'border-gph-dark-line'                : 'border-gray-200';

  return (
    <>
      <div
        className={`shrink-0 w-72 rounded-xl border overflow-hidden flex flex-col ${cardBg}`}
        style={{ scrollSnapAlign: 'start' }}
      >
        {/* Room photo */}
        <div className="relative h-40 shrink-0">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet
            <img src={photo} alt={room.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-3xl ${isDark ? 'bg-gph-dark-linesoft' : 'bg-gray-200'}`}>
              🛏
            </div>
          )}
          {refundable && (
            <span className="absolute top-2.5 left-2.5 text-[9px] font-extrabold font-mono tracking-widest uppercase px-2 py-1 rounded-md bg-cv-green-700 text-white">
              Free cancel
            </span>
          )}
          {board && (
            <span className="absolute top-2.5 right-2.5 text-[9px] font-bold font-mono tracking-widest uppercase px-2 py-1 rounded-md text-white"
              style={{ background: 'rgba(12,12,13,0.6)', backdropFilter: 'blur(6px)' }}>
              {board}
            </span>
          )}
        </div>

        {/* Room info */}
        <div className="px-4 pt-3.5 pb-2 flex flex-col gap-1">
          <p className={`text-sm font-extrabold leading-tight ${textPrimary}`}>{room.name}</p>
          {beds && <p className={`text-[11px] font-mono ${textMuted}`}>{beds}</p>}

          {pricePerRoom > 0 && (
            <>
              {/* Quantity stepper */}
              <div className={`flex items-center justify-between mt-2 pt-2.5 border-t ${divider}`}>
                <span className={`text-[9px] font-bold font-mono tracking-widest uppercase ${textMuted}`}>Rooms</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRoomQty(q => Math.max(1, q - 1))}
                    disabled={roomQty <= 1}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-base font-bold transition-colors disabled:opacity-30 ${isDark ? 'bg-gph-dark-linesoft text-gph-dark-ink hover:bg-gph-dark-line' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    aria-label="Fewer rooms"
                  >−</button>
                  <span className={`w-4 text-center text-sm font-extrabold font-mono ${textPrimary}`}>{roomQty}</span>
                  <button
                    onClick={() => setRoomQty(q => Math.min(maxQty, q + 1))}
                    disabled={roomQty >= maxQty}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-base font-bold transition-colors disabled:opacity-30 ${isDark ? 'bg-gph-dark-linesoft text-gph-dark-ink hover:bg-gph-dark-line' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    aria-label="More rooms"
                  >+</button>
                </div>
              </div>

              {/* Price — portal cash ranges only (est. portal markups).
                  Label above value (not side-by-side) so neither clips when
                  text is resized to 200% per WCAG 1.4.4/1.4.10. The dash is
                  aria-hidden with a visually-hidden "to" alongside it so a
                  screen reader announces an unambiguous range instead of
                  reading the en dash as a word or number. */}
              {pointsResult && (() => {
                const fmt = (v: number) =>
                  v.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
                const renderRange = (min: number, max: number, valueCls: string) =>
                  min === max ? (
                    <p className={valueCls}>{fmt(min)}</p>
                  ) : (
                    <p className={valueCls}>
                      {fmt(min)}
                      <span aria-hidden="true"> – </span>
                      <span className="sr-only"> to </span>
                      {fmt(max)}
                    </p>
                  );
                const portalTotals  = pointsResult.portalGroups.map(g => g.priceUsd);
                const nightsDivisor = roomQty * nights || 1;
                const portalNightly = portalTotals.map(v => v / nightsDivisor);
                return (
                  <div data-testid="room-price-range" className={`flex flex-col gap-2 pt-2 border-t ${divider}`}>
                    <div>
                      <p className={`text-[10px] font-semibold font-mono tracking-widest uppercase ${textMuted}`}>
                        Portal cash · per room / night
                      </p>
                      {renderRange(
                        Math.min(...portalNightly),
                        Math.max(...portalNightly),
                        `text-sm font-bold font-mono tracking-tight mt-0.5 ${textPrimary}`,
                      )}
                    </div>
                    <div>
                      <p className={`text-[10px] font-semibold font-mono tracking-widest uppercase ${textMuted}`}>
                        Portal cash · total
                      </p>
                      {renderRange(
                        Math.min(...portalTotals),
                        Math.max(...portalTotals),
                        `text-xl font-extrabold font-mono tracking-tight mt-0.5 ${textPrimary}`,
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Best portal panel */}
        <HotelBestRedemptionBar
          result={pointsResult}
          primaryCta={{ label: 'Reserve →' }}
          compareLabel={`Compare ${pointsResult?.portalGroups.length ?? 0} portals`}
          onCompareClick={() => setShowPopup(true)}
        />
      </div>

      {showPopup && pointsResult && (
        <RoomComparePopup
          room={room}
          nights={nights}
          currency={currency}
          pointsResult={pointsResult}
          isDark={isDark}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HotelDetailModal({ searchResult, onClose }: { searchResult: any; onClose: () => void }) {
  const { isDark } = useTheme();
  const { selectedCards } = useSelectedCards();
  const [photoIdx, setPhotoIdx] = useState(0);
  const roomsRailRef = useRef<HTMLDivElement>(null);
  const scrollRooms  = (dir: number) =>
    roomsRailRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acc         = searchResult.accommodation as any;
  const checkIn     = searchResult.check_in_date as string;
  const checkOut    = searchResult.check_out_date as string;
  const nights      = nightsBetween(checkIn, checkOut);
  const totalAmount = parseFloat(searchResult.cheapest_rate_total_amount ?? '0');
  const currency    = searchResult.cheapest_rate_currency ?? 'USD';
  const perNight    = nights > 0 ? totalAmount / nights : totalAmount;

  const name        = (acc.name ?? 'Hotel') as string;
  const stars       = acc.rating as number | null;
  const reviewScore = acc.review_score as number | null;
  const reviewCount = acc.review_count as number | null;
  const coords      = acc.location?.geographic_coordinates as { latitude: number; longitude: number } | null;
  const lineOne     = (acc.location?.address?.line_one ?? '') as string;
  const city        = (acc.location?.address?.city_name ?? '') as string;
  const country     = (acc.location?.address?.country_code ?? '') as string;
  const streetPart  = lineOne && !name.toLowerCase().includes(lineOne.toLowerCase()) ? lineOne : '';
  const location    = [streetPart, city, country].filter(Boolean).join(', ');
  const photos      = (acc.photos ?? []) as { url: string }[];
  const amenities   = (acc.amenities ?? []) as { type: string; description: string }[];
  const scoreLabel  = reviewScore !== null ? ratingLabel(reviewScore) : null;
  const firstPhoto  = photos[0]?.url ?? null;

  const searchResultId = searchResult.id as string;
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['accommodationDetails', acc.id, searchResultId],
    queryFn: () => trpc.stays.accommodationDetails.query({
      accommodationId: acc.id as string,
      searchResultId,
    }),
    enabled: !!acc.id && !!searchResultId,
    staleTime: 15 * 60 * 1000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validRooms = (details?.rooms ?? []).filter((room: any) => {
    const rate = cheapestRoomRate(room);
    return rate !== null && parseFloat(rate.total_amount) > 0;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const n = photos.length;
  const go = (d: number) => setPhotoIdx(i => (i + d + n) % n);

  const cardBg      = isDark ? 'bg-gph-dark-card'      : 'bg-white';
  const borderCls   = isDark ? 'border-gph-dark-line'  : 'border-gray-200';
  const textPrimary = isDark ? 'text-gph-dark-ink'     : 'text-gray-900';
  const textMuted   = isDark ? 'text-gph-dark-muted'   : 'text-gray-500';
  const sectionLbl  = `text-[9.5px] font-bold font-mono tracking-widest uppercase mb-3 ${textMuted}`;
  const pageBg      = isDark ? 'bg-gph-dark-bg'        : 'bg-gray-50';
  const iconColor   = isDark ? '#4A9ED6'               : '#1F6FBF';
  const amenityBg   = isDark ? 'bg-gph-dark-linesoft border-gph-dark-line' : 'bg-gray-50 border-gray-100';
  const skeletonCls = isDark ? 'bg-gph-dark-linesoft'  : 'bg-gray-200';
  const overlayStyle = {
    background: isDark ? 'rgba(5,7,12,0.75)' : 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
  };
  const glassStyle = { background: 'rgba(12,12,13,0.55)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={overlayStyle}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex min-h-full items-start justify-center p-0 md:p-10">
        <div
          className={`relative w-full max-w-4xl ${cardBg} md:rounded-2xl overflow-hidden shadow-2xl border ${borderCls}`}
          onMouseDown={(e) => e.stopPropagation()}
        >

          {/* ── Photo Carousel ── */}
          <div className="relative">
            {photos.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet */}
                <img
                  src={photos[photoIdx].url}
                  alt={`${name} photo ${photoIdx + 1}`}
                  className="w-full object-cover"
                  style={{ height: 340 }}
                />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg,rgba(8,10,14,.4) 0%,rgba(8,10,14,0) 28%,rgba(8,10,14,0) 62%,rgba(8,10,14,.55) 100%)' }} />
              </>
            ) : (
              <div className={`w-full flex items-center justify-center text-6xl ${isDark ? 'bg-gph-dark-linesoft' : 'bg-gray-100'}`} style={{ height: 340 }}>
                🏨
              </div>
            )}

            {/* top-left badges */}
            <div className="absolute top-4 left-4 flex gap-2 z-10">
              {city && (
                <span className="px-3 py-1.5 rounded-md text-[10px] font-bold font-mono tracking-widest text-white" style={glassStyle}>
                  {city.toUpperCase()}
                </span>
              )}
            </div>

            {/* top-right controls */}
            <div className="absolute top-4 right-4 flex gap-2 z-10">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={glassStyle}>
                <AddToTripButton
                  type="hotel"
                  itemId={acc.id as string}
                  title={name}
                  data={searchResult}
                />
              </div>
              <button onClick={onClose} aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-90" style={glassStyle}>
                <svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2} fill="none">
                  <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/>
                </svg>
              </button>
            </div>

            {n > 1 && (
              <>
                <button onClick={() => go(-1)} aria-label="Previous photo"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10 transition-opacity hover:opacity-90" style={glassStyle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2} fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button onClick={() => go(1)} aria-label="Next photo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10 transition-opacity hover:opacity-90" style={glassStyle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2} fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>

                {/* counter */}
                <div className="absolute left-4 bottom-21 z-10 text-white text-[11px] font-bold font-mono tracking-widest px-2.5 py-1.5 rounded-md"
                  style={{ background: 'rgba(12,12,13,0.6)', backdropFilter: 'blur(6px)' }}>
                  {String(photoIdx + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                </div>

                {/* dots */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-20.5 flex gap-1.5 z-10">
                  {photos.slice(0, 8).map((_, i) => (
                    <button key={i} onClick={() => setPhotoIdx(i)} aria-label={`Photo ${i + 1}`}
                      className="rounded-full border-none cursor-pointer transition-all"
                      style={{ width: i === photoIdx ? 20 : 6, height: 6, background: i === photoIdx ? '#4A9ED6' : 'rgba(255,255,255,0.55)' }} />
                  ))}
                </div>

                {/* thumbnail strip */}
                <div className="absolute bottom-0 left-0 right-0 flex gap-2 px-4 py-3 overflow-x-auto z-10"
                  style={{ background: 'rgba(8,10,14,0.55)', backdropFilter: 'blur(8px)' }}>
                  {photos.map((p, i) => (
                    <button key={i} onClick={() => setPhotoIdx(i)} className="shrink-0 rounded-md overflow-hidden cursor-pointer transition-all"
                      style={{ border: i === photoIdx ? '2px solid #4A9ED6' : '2px solid transparent', lineHeight: 0, background: 'transparent', padding: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet */}
                      <img src={p.url} alt="" className="object-cover rounded" style={{ width: 60, height: 42, opacity: i === photoIdx ? 1 : 0.6, display: 'block' }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Title Row ── */}
          <div className={`flex justify-between items-start gap-6 px-6 md:px-8 py-5 border-b ${borderCls}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                {stars !== null && stars !== undefined && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className={`text-xs ${i < stars ? 'text-cv-amber-400' : isDark ? 'text-gph-dark-line' : 'text-gray-200'}`}>★</span>
                    ))}
                  </div>
                )}
                {reviewCount !== null && reviewCount !== undefined && (
                  <span className={`text-[10px] font-bold font-mono tracking-widest uppercase ${textMuted}`}>
                    {reviewCount.toLocaleString()} reviews
                  </span>
                )}
              </div>
              <h2 className={`text-2xl font-extrabold leading-tight tracking-tight mb-1 ${textPrimary}`}>{name}</h2>
              {location && (
                <p className={`text-sm flex items-center gap-1.5 mb-2 ${textMuted}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {location} · {nights} night{nights !== 1 ? 's' : ''}
                </p>
              )}
              {reviewScore !== null && reviewScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold font-mono px-2 py-1 rounded-md text-white bg-cv-navy-950">
                    {reviewScore.toFixed(1)}
                  </span>
                  {scoreLabel && <span className="text-sm font-bold text-cv-green-500">{scoreLabel}</span>}
                  {reviewCount && <span className={`text-sm ${textMuted}`}>· {reviewCount.toLocaleString()} verified reviews</span>}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={`text-[9.5px] font-bold font-mono tracking-widest uppercase mb-1 ${textMuted}`}>FROM</p>
              <p className={`text-3xl font-extrabold tracking-tight leading-none ${textPrimary}`}>
                {totalAmount.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })}
              </p>
              <p className={`text-sm mt-1 ${textMuted}`}>
                {perNight.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })}/night
              </p>
            </div>
          </div>

          {/* ── Two-column body: About + Amenities | Map ── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">

            {/* Left: About + Amenities */}
            <div className={`p-6 md:p-8 border-b md:border-b-0 md:border-r ${borderCls}`}>
              {detailsLoading && (
                <div className="mb-6">
                  <div className={`h-2.5 w-28 rounded mb-4 ${skeletonCls}`} />
                  <div className={`h-2.5 rounded mb-2 ${skeletonCls}`} />
                  <div className={`h-2.5 rounded mb-2 w-5/6 ${skeletonCls}`} />
                  <div className={`h-2.5 rounded w-4/6 ${skeletonCls}`} />
                </div>
              )}
              {details?.description && (
                <div className="mb-6">
                  <p className={sectionLbl}>About this hotel</p>
                  <p className={`text-sm leading-relaxed ${textPrimary}`}>{details.description}</p>
                </div>
              )}
              {amenities.length > 0 && (
                <div>
                  <p className={sectionLbl}>Amenities</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {amenities.map((a, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${amenityBg}`}>
                          <AmenityIcon type={a.type} color={iconColor} />
                        </span>
                        <span className={`text-sm font-semibold ${textPrimary}`}>{a.description ?? a.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Map only */}
            {coords && (
              <div className="p-6">
                <p className={sectionLbl}>Location</p>
                <div className={`relative rounded-xl overflow-hidden border ${borderCls}`} style={{ height: 220 }}>
                  <HotelMiniMap lat={coords.latitude} lng={coords.longitude} isDark={isDark} />
                </div>
              </div>
            )}
          </div>

          {/* ── Rooms carousel ── */}
          {(detailsLoading || validRooms.length > 0) && (
            <div className={`px-6 md:px-8 py-6 border-t ${borderCls}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`text-[9.5px] font-bold font-mono tracking-widest uppercase ${textMuted}`}>
                    Choose your room
                  </p>
                  <p className={`text-lg font-extrabold tracking-tight mt-0.5 ${textPrimary}`}>
                    {details?.rooms ? `${validRooms.length} room type${validRooms.length !== 1 ? 's' : ''}` : 'Room types'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => scrollRooms(-1)}
                    aria-label="Previous rooms"
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${borderCls} ${isDark ? 'bg-gph-dark-linesoft hover:bg-gph-dark-line' : 'bg-white hover:bg-gray-100'}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} fill="none" className={textPrimary}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => scrollRooms(1)}
                    aria-label="More rooms"
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${borderCls} ${isDark ? 'bg-gph-dark-linesoft hover:bg-gph-dark-line' : 'bg-white hover:bg-gray-100'}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} fill="none" className={textPrimary}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div ref={roomsRailRef} className="flex gap-3.5 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
                {detailsLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={`shrink-0 w-72 rounded-xl border overflow-hidden ${isDark ? 'bg-gph-dark-bg border-gph-dark-line' : 'bg-gray-50 border-gray-200'}`} style={{ scrollSnapAlign: 'start' }}>
                        <div className={`h-40 ${skeletonCls}`} />
                        <div className="p-3.5 space-y-2">
                          <div className={`h-3 rounded w-4/5 ${skeletonCls}`} />
                          <div className={`h-2.5 rounded w-1/2 ${skeletonCls}`} />
                        </div>
                      </div>
                    ))
                  : validRooms.map((room, i) => (
                      <RoomCard
                        key={i}
                        room={room}
                        fallbackPhoto={firstPhoto}
                        nights={nights}
                        currency={currency}
                        guestCount={(searchResult.guests as { type: string }[])?.length ?? 2}
                        selectedCards={selectedCards}
                        portalPrices={searchResult.portalPrices}
                        hotelChain={name}
                        isDark={isDark}
                      />
                    ))
                }
              </div>
            </div>
          )}

          {/* ── Reviews ── */}
          {(detailsLoading || (details?.reviews && details.reviews.length > 0)) && (
            <div className={`px-6 md:px-8 py-6 border-t ${borderCls} ${pageBg}`}>
              <div className="flex items-end justify-between mb-4">
                <div className="flex items-center gap-4">
                  {reviewScore !== null && reviewScore !== undefined && (
                    <div>
                      <div className={`text-4xl font-extrabold font-mono tracking-tight leading-none ${textPrimary}`}>
                        {reviewScore.toFixed(1)}
                      </div>
                      {scoreLabel && <div className="text-xs font-bold text-cv-green-500 mt-1">{scoreLabel}</div>}
                      {reviewCount && (
                        <div className={`text-[10px] font-bold font-mono tracking-widest mt-0.5 ${textMuted}`}>
                          {reviewCount.toLocaleString()} REVIEWS
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-[10px] font-bold font-mono tracking-widest uppercase flex items-center gap-1.5 ${textMuted}`}>
                  SCROLL
                  <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </p>
              </div>
              <div className="flex gap-3.5 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
                {detailsLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={`shrink-0 w-72 rounded-xl p-4 border ${cardBg} ${borderCls}`} style={{ scrollSnapAlign: 'start' }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-8 h-8 rounded-full ${skeletonCls}`} />
                          <div className="flex-1 space-y-1.5">
                            <div className={`h-3 rounded w-24 ${skeletonCls}`} />
                            <div className={`h-2.5 rounded w-16 ${skeletonCls}`} />
                          </div>
                        </div>
                        <div className={`h-2.5 rounded mb-2 ${skeletonCls}`} />
                        <div className={`h-2.5 rounded mb-2 w-5/6 ${skeletonCls}`} />
                        <div className={`h-2.5 rounded w-4/6 ${skeletonCls}`} />
                      </div>
                    ))
                  : details?.reviews.map((r, i) => {
                      const initials = r.reviewer_name.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
                      const dateStr = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                      return (
                        <div key={i} className={`shrink-0 w-72 rounded-xl p-4 border flex flex-col ${cardBg} ${borderCls}`} style={{ scrollSnapAlign: 'start' }}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0"
                                style={{ background: 'linear-gradient(135deg, #1B3A5C, #1F6FBF)' }}>
                                {initials}
                              </div>
                              <div>
                                <div className={`text-sm font-bold leading-none ${textPrimary}`}>{r.reviewer_name}</div>
                                <div className={`text-[10px] font-mono mt-0.5 ${textMuted}`}>{dateStr}</div>
                              </div>
                            </div>
                            <span className="text-xs font-extrabold font-mono px-2 py-1 rounded text-white bg-cv-navy-950">
                              {r.score.toFixed(1)}
                            </span>
                          </div>
                          <p className={`text-sm leading-relaxed flex-1 max-h-30 overflow-y-auto ${textMuted}`}>{r.text}</p>
                          <div className="flex items-center gap-1.5 mt-3 text-[10px] font-bold font-mono tracking-widest uppercase text-cv-green-500">
                            <svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} fill="none">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                            </svg>
                            Verified Stay
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
