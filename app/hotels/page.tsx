'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AppShell, MAIN_SCROLL_ID } from '@/components/AppShell';
import { type GuestsValue } from '@/components/GuestsDropdown';
import { HotelCard } from '@/components/HotelCard';
import { HotelDetailModal } from '@/components/HotelDetailModal';
import { GeoMap, type GeoPin } from '@/components/GeoMap';
import { HotelSearchForm } from '@/components/search/HotelSearchForm';
import { type SelectedPlace } from '@/components/LocationSearch';
import { Pagination } from '@/components/Pagination';
import { FeaturedPagination, FEATURED_PER_PAGE } from '@/components/FeaturedPagination';
import { trpc } from '@/lib/trpc-client';
import { useTheme } from '@/contexts/ThemeContext';
import { usePerPage } from '@/hooks/usePerPage';
import { clampPage, paginate, pageRange } from '@/lib/pagination';
import { AffiliateAdSpot } from '@/components/offers/AffiliateAdSpot';


const STAR_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Any',  value: null },
  { label: '3★+',  value: 3 },
  { label: '4★+',  value: 4 },
  { label: '5★',   value: 5 },
];

interface HotelFiltersProps {
  isDark: boolean;
  minStars: number | null;
  onStarsChange: (v: number | null) => void;
  availableAmenities: { type: string; description: string; count: number }[];
  requiredAmenities: Set<string>;
  onToggleAmenity: (type: string) => void;
  filterCount: number;
  onClearAll: () => void;
}

function HotelFiltersContent({
  isDark, minStars, onStarsChange,
  availableAmenities, requiredAmenities, onToggleAmenity,
  filterCount, onClearAll,
}: HotelFiltersProps) {
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const inkCls   = isDark ? 'text-gph-dark-ink'   : 'text-gray-900';
  const rowOnCls = isDark
    ? 'border-gph-dark-action bg-gph-dark-linesoft text-gph-dark-ink'
    : 'border-gray-900 bg-gray-100 text-gray-900';
  const rowIdleCls = isDark
    ? 'border-gph-dark-line text-gph-dark-muted hover:border-gph-dark-action hover:text-gph-dark-ink'
    : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        {filterCount > 0 && (
          <button
            onClick={onClearAll}
            className={`text-[10px] font-bold font-mono uppercase tracking-widest ${mutedCls} hover:text-red-500 transition-colors`}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Stars */}
      <div>
        <div className={`text-[10px] font-bold font-mono uppercase tracking-widest mb-2 ${mutedCls}`}>Star rating</div>
        <div className="flex flex-col gap-1.5">
          {STAR_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => onStarsChange(opt.value)}
              className={`flex items-center px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                opt.value === minStars ? rowOnCls : rowIdleCls
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Amenities */}
      {availableAmenities.length > 0 && (
        <div>
          <div className={`text-[10px] font-bold font-mono uppercase tracking-widest mb-2 ${mutedCls}`}>Amenities</div>
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {availableAmenities.map(({ type, description, count }) => {
              const on = requiredAmenities.has(type);
              return (
                <button
                  key={type}
                  onClick={() => onToggleAmenity(type)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${on ? rowOnCls : rowIdleCls}`}
                >
                  <span className="truncate text-left">{description}</span>
                  <span className={`text-[10px] font-mono font-bold ml-2 shrink-0 ${inkCls}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HotelFiltersDropdown(props: HotelFiltersProps) {
  const { isDark, filterCount } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const cardCls = isDark ? 'bg-gph-dark-card border-gph-dark-line' : 'bg-white border-gray-200';

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          open || filterCount > 0
            ? isDark ? 'border-gph-dark-action bg-gph-dark-linesoft text-gph-dark-ink' : 'border-gray-900 bg-gray-100 text-gray-900'
            : isDark ? 'border-gph-dark-line text-gph-dark-muted hover:border-gph-dark-action hover:text-gph-dark-ink' : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900'
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
        </svg>
        Filter
        {filterCount > 0 && (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${isDark ? 'bg-gph-dark-action text-gph-dark-bg' : 'bg-gray-900 text-white'}`}>
            {filterCount}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border shadow-xl p-4 ${cardCls}`}>
          <HotelFiltersContent {...props} />
        </div>
      )}
    </div>
  );
}
const DEFAULT_CHILD_AGE = 8;

function buildGuests(guests: GuestsValue) {
  const adults   = Array.from({ length: guests.adults },   () => ({ type: 'adult' as const }));
  const children = Array.from({ length: guests.children }, () => ({ type: 'child' as const, age: DEFAULT_CHILD_AGE }));
  return [...adults, ...children];
}

interface HotelPinData {
  name: string;
  photo: string | null;
  address: string;
  priceLabel: string;
  stars: number | null;
  reviewScore: number | null;
  reviewCount: number | null;
  scoreLabel: string | null;
}

function ratingLabel(score: number): string | null {
  if (score >= 9.0) return 'Exceptional';
  if (score >= 8.5) return 'Excellent';
  if (score >= 7.5) return 'Very Good';
  if (score >= 6.5) return 'Good';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accommodationsToPins(accommodations: any[]): GeoPin[] {
  return accommodations
    .filter((sr) => sr.accommodation?.location?.geographic_coordinates)
    .map((sr) => {
      const acc = sr.accommodation;
      const totalAmount = parseFloat(sr.cheapest_rate_total_amount ?? '0');
      const currency = sr.cheapest_rate_currency ?? 'USD';
      const lineOne = acc.location?.address?.line_one ?? '';
      const city = acc.location?.address?.city_name ?? '';
      const country = acc.location?.address?.country_code ?? '';
      const streetPart = lineOne && !acc.name?.toLowerCase().includes(lineOne.toLowerCase()) ? lineOne : '';
      const address = [streetPart, city, country].filter(Boolean).join(', ');
      const reviewScore = (acc.review_score ?? null) as number | null;

      const data: HotelPinData = {
        name: acc.name ?? 'Hotel',
        photo: acc.photos?.[0]?.url ?? null,
        address,
        priceLabel: totalAmount.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }),
        stars: (acc.rating ?? null) as number | null,
        reviewScore,
        reviewCount: (acc.review_count ?? null) as number | null,
        scoreLabel: reviewScore !== null && reviewScore !== undefined ? ratingLabel(reviewScore) : null,
      };

      return {
        id: sr.id,
        lat: acc.location.geographic_coordinates.latitude,
        lng: acc.location.geographic_coordinates.longitude,
        label: acc.name ?? 'Hotel',
        data,
      };
    });
}

function EmptyState({ message }: { message: string }) {
  const { isDark } = useTheme();
  return (
    <div className={`flex items-center justify-center rounded-xl border border-dashed py-16 ${isDark ? 'border-gph-dark-line' : 'border-gray-200'}`}>
      <p className={`text-sm ${isDark ? 'text-gph-dark-muted' : 'text-gray-400'}`}>{message}</p>
    </div>
  );
}

function HotelsPageInner() {
  const searchParams  = useSearchParams();
  const paramDest     = searchParams.get('destination') ?? '';
  const paramLat      = parseFloat(searchParams.get('lat') ?? '0');
  const paramLng      = parseFloat(searchParams.get('lng') ?? '0');
  const paramCheckIn  = searchParams.get('checkIn') ?? '';
  const paramCheckOut = searchParams.get('checkOut') ?? '';
  const paramAdults   = parseInt(searchParams.get('adults') ?? '2', 10);
  const paramChildren = parseInt(searchParams.get('children') ?? '0', 10);
  const paramRooms    = parseInt(searchParams.get('rooms') ?? '1', 10);
  const fromTrip      = !!(paramLat && paramLng && paramCheckIn && paramCheckOut);

  const [destPlace, setDestPlace] = useState<SelectedPlace | null>(
    fromTrip ? { latitude: paramLat, longitude: paramLng, name: paramDest, description: paramDest } : null,
  );
  const [guests, setGuests]       = useState<GuestsValue>({
    adults: fromTrip ? paramAdults : 2,
    children: fromTrip ? paramChildren : 0,
    pets: 0,
  });
  const [checkIn, setCheckIn]     = useState(fromTrip ? paramCheckIn : '');
  const [checkOut, setCheckOut]   = useState(fromTrip ? paramCheckOut : '');
  const [minStars, setMinStars]         = useState<number | null>(null);
  const [requiredAmenities, setRequiredAmenities] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder]       = useState<'relevant' | 'az' | 'lowest' | 'highest'>('relevant');
  const [sortOpen, setSortOpen]         = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detailResult, setDetailResult] = useState<any | null>(null);
  const [showBackToTop, setShowBackToTop]     = useState(false);
  const [mapVisible, setMapVisible]     = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = usePerPage();
  const [featuredPage, setFeaturedPage] = useState(1);

  useEffect(() => {
    const el = document.getElementById(MAIN_SCROLL_ID);
    if (!el) return;
    const onScroll = () => setShowBackToTop(el.scrollTop > 420);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const sortRef = useRef<HTMLDivElement>(null);

  const { isDark } = useTheme();

  const hotelSearch = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => trpc.stays.search.mutate(vars),
  });

  // Auto-search when arriving from trip planner with all required data
  useEffect(() => {
    if (!fromTrip) return;
    hotelSearch.mutate({
      latitude: paramLat,
      longitude: paramLng,
      checkInDate: paramCheckIn,
      checkOutDate: paramCheckOut,
      rooms: paramRooms,
      guests: buildGuests({ adults: paramAdults, children: paramChildren, pets: 0 }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 when a new search resolves — adjusted during render
  // (React's documented alternative to an effect for this).
  const [prevHotelData, setPrevHotelData] = useState(hotelSearch.data);
  if (hotelSearch.data !== prevHotelData) {
    setPrevHotelData(hotelSearch.data);
    setPage(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAccommodations: any[] = useMemo(() => hotelSearch.data ?? [], [hotelSearch.data]);

  const availableAmenities = useMemo(() => {
    const map = new Map<string, { description: string; count: number }>();
    allAccommodations.forEach(sr => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sr.accommodation?.amenities ?? []).forEach((a: any) => {
        const type = a.type ?? '';
        const desc = a.description ?? type;
        if (!type) return;
        const prev = map.get(type);
        map.set(type, { description: desc, count: (prev?.count ?? 0) + 1 });
      });
    });
    return Array.from(map.entries())
      .map(([type, { description, count }]) => ({ type, description, count }))
      .sort((a, b) => b.count - a.count);
  }, [allAccommodations]);

  const accommodations = useMemo(() => [...allAccommodations]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((sr: any) => {
      const acc = sr.accommodation ?? {};
      if (minStars !== null && (acc.rating ?? 0) < minStars) return false;
      if (requiredAmenities.size > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const types = new Set((acc.amenities ?? []).map((a: any) => a.type));
        for (const req of requiredAmenities) {
          if (!types.has(req)) return false;
        }
      }
      return true;
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => {
      if (sortOrder === 'az')      return (a.accommodation?.name ?? '').localeCompare(b.accommodation?.name ?? '');
      if (sortOrder === 'lowest')  return parseFloat(a.cheapest_rate_total_amount) - parseFloat(b.cheapest_rate_total_amount);
      if (sortOrder === 'highest') return parseFloat(b.cheapest_rate_total_amount) - parseFloat(a.cheapest_rate_total_amount);
      // 'relevant': float featured (hotel_collection match) hotels to the top
      const aFeatured = Boolean(a.collection);
      const bFeatured = Boolean(b.collection);
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      return 0;
    }), [allAccommodations, minStars, requiredAmenities, sortOrder]);

  const hasMappableHotels = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => accommodations.some((sr: any) => sr.accommodation?.location?.geographic_coordinates),
    [accommodations],
  );

  const hotelPins = useMemo(() => accommodationsToPins(accommodations), [accommodations]);

  const featuredAccommodations = useMemo(() => accommodations.filter((sr) => Boolean(sr.collection)), [accommodations]);
  const regularAccommodations  = useMemo(() => accommodations.filter((sr) => !sr.collection), [accommodations]);

  // Reset to page 1 whenever the filtered/sorted list's shape changes — covers
  // filter and sort changes that don't produce a new hotelSearch.data identity.
  const listKey = `${sortOrder}|${minStars}|${[...requiredAmenities].sort().join(',')}`;
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setPage(1);
    setFeaturedPage(1);
  }

  // Featured hotels and the regular list page independently.
  const safePage = clampPage(page, regularAccommodations.length, perPage);
  const regularPage = paginate(regularAccommodations, safePage, perPage);
  const { from, to } = pageRange(regularAccommodations.length, safePage, perPage);

  const safeFeaturedPage = clampPage(featuredPage, featuredAccommodations.length, FEATURED_PER_PAGE);
  const featuredPageAccommodations = paginate(featuredAccommodations, safeFeaturedPage, FEATURED_PER_PAGE);

  function goToPage(next: number) {
    setPage(next);
    document.getElementById(MAIN_SCROLL_ID)?.scrollTo({ top: 0 });
  }

  function goToFeaturedPage(next: number) {
    setFeaturedPage(next);
    document.getElementById(MAIN_SCROLL_ID)?.scrollTo({ top: 0 });
  }

  const textPrimary = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const textMuted = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const scoreCls = isDark ? 'text-cv-green-500' : 'text-cv-green-800';
  const starOnCls = 'text-cv-amber-400';
  const starOffCls = isDark ? 'text-gph-dark-line' : 'text-gray-200';
  const viewBtnCls = isDark
    ? 'bg-cv-lime-500 text-gph-dark-card hover:bg-cv-lime-400'
    : 'bg-gray-900 text-white hover:bg-gray-800';
  const photoFallbackCls = isDark ? 'bg-gph-dark-linesoft' : 'bg-gray-100';

  function renderHotelPinCard(pin: GeoPin): { expanded: React.ReactNode; tuck: React.ReactNode } {
    const data = pin.data as HotelPinData;

    const tuck = (
      <>
        {data.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet
          <img src={data.photo} alt={data.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base shrink-0 ${photoFallbackCls}`}>
            🏨
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold truncate ${textPrimary}`}>{data.name}</p>
          <p className={`text-[11px] font-mono font-bold ${textMuted}`}>{data.priceLabel} · from</p>
        </div>
      </>
    );

    const expanded = (
      <>
        <div className="mx-2.5 rounded-xl overflow-hidden h-24">
          {data.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote/dynamic photo URL, no remotePatterns configured yet
            <img src={data.photo} alt={data.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-2xl ${photoFallbackCls}`}>
              🏨
            </div>
          )}
        </div>

        <div className="p-3">
          {(data.stars !== null || data.reviewCount !== null) && (
            <div className="flex items-center gap-1.5 mb-1">
              {data.stars !== null && (
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={`text-[10px] ${i < data.stars! ? starOnCls : starOffCls}`}>★</span>
                  ))}
                </div>
              )}
              {data.reviewCount !== null && (
                <span className={`text-[9px] font-bold font-mono tracking-wide uppercase ${textMuted}`}>
                  {data.reviewCount.toLocaleString()} reviews
                </span>
              )}
            </div>
          )}

          <p className={`text-xs font-extrabold leading-snug line-clamp-2 mb-1 ${textPrimary}`}>
            {data.name}
          </p>

          {data.address && (
            <p className={`text-[11px] leading-snug line-clamp-1 mb-1.5 ${textMuted}`}>
              {data.address}
            </p>
          )}

          {data.reviewScore !== null && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`text-xs font-bold font-mono ${textPrimary}`}>
                {data.reviewScore.toFixed(1)}
                <span className={`font-normal ${textMuted}`}>/10</span>
              </span>
              {data.scoreLabel && (
                <span className={`text-xs font-bold ${scoreCls}`}>{data.scoreLabel}</span>
              )}
            </div>
          )}

          <p className={`text-[10px] font-bold font-mono tracking-widest uppercase ${textMuted}`}>
            FROM
          </p>
          <p className={`text-lg font-extrabold tracking-tight leading-none mb-2.5 ${textPrimary}`}>
            {data.priceLabel}
          </p>

          <button
            type="button"
            onClick={() => {
              const sr = accommodations.find((a) => a.id === pin.id);
              if (sr) setDetailResult(sr);
            }}
            className={`w-full min-h-11 rounded-lg text-xs font-bold ${viewBtnCls}`}
          >
            View details
          </button>
        </div>
      </>
    );

    return { expanded, tuck };
  }

  const canSearch = !!destPlace && !!checkIn && !!checkOut;

  function handleSearch() {
    if (!canSearch || !destPlace) return;
    hotelSearch.mutate({
      latitude: destPlace.latitude,
      longitude: destPlace.longitude,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      rooms: 1,
      guests: buildGuests(guests),
    });
  }

  const SORT_LABELS = {
    relevant: 'Best value',
    az:       'A to Z',
    lowest:   'Lowest price',
    highest:  'Highest price',
  } as const;

  const filterCount = (minStars !== null ? 1 : 0) + (requiredAmenities.size > 0 ? 1 : 0);

  function handleToggleAmenity(type: string) {
    setRequiredAmenities(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  function handleClearFilters() {
    setMinStars(null);
    setRequiredAmenities(new Set());
  }

  const { isDark: dark } = useTheme();
  const ghostBtn = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
    dark
      ? 'border-gph-dark-line text-gph-dark-muted hover:border-gph-dark-action hover:text-gph-dark-ink'
      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900'
  }`;
  const dropdownCls = `absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-lg overflow-hidden min-w-[140px] ${
    dark ? 'bg-gph-dark-card border-gph-dark-line' : 'bg-white border-gray-200'
  }`;
  const optionCls = (active: boolean) =>
    `w-full text-left px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
      active
        ? 'bg-gray-900 text-white'
        : dark ? 'text-gph-dark-ink hover:bg-gph-dark-linesoft' : 'text-gray-700 hover:bg-gray-50'
    }`;
  const chevron = (open: boolean) => (
    <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );

  const header = (
    <HotelSearchForm
      onDestSelect={setDestPlace}
      onDestClear={() => setDestPlace(null)}
      destInitialValue={fromTrip ? paramDest : undefined}
      checkIn={checkIn}
      onCheckInChange={setCheckIn}
      checkOut={checkOut}
      onCheckOutChange={setCheckOut}
      guests={guests}
      onGuestsChange={setGuests}
      onSearch={handleSearch}
      searchDisabled={!canSearch}
      searchPending={hotelSearch.isPending}
    />
  );

  const resultsHeader = accommodations.length > 0 && (
    <div className={`flex items-end justify-between pb-3 mb-5 border-b-2 ${isDark ? 'border-gph-dark-action' : 'border-gray-900'}`}>
      <div>
        <h2 className={`text-3xl font-extrabold tracking-tight leading-none ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {accommodations.length} hotel{accommodations.length !== 1 ? 's' : ''}{destPlace?.name ? ` in ${destPlace.name}` : ' found'}
        </h2>
        <p className={`text-[10px] font-bold font-mono tracking-widest uppercase mt-2 ${isDark ? 'text-gph-dark-muted' : 'text-gray-600'}`}>
          {[
            destPlace?.name,
            guests.adults + guests.children > 0 ? `${guests.adults + guests.children} guest${guests.adults + guests.children !== 1 ? 's' : ''}` : null,
            regularAccommodations.length > 0 ? `Showing ${from}–${to} of ${regularAccommodations.length}` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        {/* Mobile-only filter button */}
        <HotelFiltersDropdown
          isDark={isDark}
          minStars={minStars}
          onStarsChange={setMinStars}
          availableAmenities={availableAmenities}
          requiredAmenities={requiredAmenities}
          onToggleAmenity={handleToggleAmenity}
          filterCount={filterCount}
          onClearAll={handleClearFilters}
        />

        {/* Map toggle */}
        {hasMappableHotels && (
          <button onClick={() => setMapVisible((v) => !v)} className={ghostBtn}>
            {mapVisible ? 'Hide map' : 'Show map'}
          </button>
        )}

        {/* Sort */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(o => !o)}
            onBlur={(e) => { if (!sortRef.current?.contains(e.relatedTarget as Node)) setSortOpen(false); }}
            className={ghostBtn}
          >
            Sort: {SORT_LABELS[sortOrder]}
            {chevron(sortOpen)}
          </button>
          {sortOpen && (
            <div className={dropdownCls}>
              {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((s) => (
                <button
                  key={s}
                  onMouseDown={() => { setSortOrder(s); setSortOpen(false); }}
                  className={optionCls(s === sortOrder)}
                >
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
    <AppShell
      header={header}
      hasResults={accommodations.length > 0}
      sidebar={allAccommodations.length > 0 ? (
        <HotelFiltersContent
          isDark={isDark}
          minStars={minStars}
          onStarsChange={setMinStars}
          availableAmenities={availableAmenities}
          requiredAmenities={requiredAmenities}
          onToggleAmenity={handleToggleAmenity}
          filterCount={filterCount}
          onClearAll={handleClearFilters}
        />
      ) : undefined}
    >
      <h1 className="sr-only">Hotel search results</h1>
      {showBackToTop && (
        <button
          onClick={() => document.getElementById(MAIN_SCROLL_ID)?.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`hidden md:flex fixed bottom-24 right-6 z-50 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-lg transition-colors ${isDark ? 'bg-gph-dark-card text-gph-dark-ink hover:bg-gph-dark-linesoft border-gph-dark-line' : 'bg-white text-gray-900 hover:bg-gray-50 border-gray-200'} border`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          Back to top
        </button>
      )}
      {hotelSearch.isPending ? (
        <div className="flex items-center justify-center py-24">
          <svg className={`w-8 h-8 animate-spin ${isDark ? 'text-gph-dark-muted' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : hotelSearch.isError ? (
        <EmptyState message="Hotel search failed. Check your selections and try again." />
      ) : accommodations.length > 0 ? (
        <div className="space-y-4">
          {resultsHeader}
          {mapVisible && destPlace && (
            <div className={`w-full h-72 md:h-96 relative rounded-xl overflow-hidden border ${isDark ? 'border-gph-dark-line' : 'border-gray-200'}`}>
              <GeoMap
                pins={hotelPins}
                center={{ lat: destPlace.latitude, lng: destPlace.longitude }}
                isDark={isDark}
                markerVariant="teardrop"
                zoomControls="navigation"
                allowFullscreen
                header={false}
                renderPinCard={renderHotelPinCard}
              />
            </div>
          )}
          {featuredAccommodations.length > 0 && (
            <div data-testid="featured-hotels-section" className={`rounded-2xl border p-3 md:p-4 ${isDark ? 'bg-gph-dark-linesoft border-gph-dark-line' : 'bg-cv-blue-50 border-cv-blue-100'}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 pb-3">
                <h2 className={`text-[10px] font-bold font-mono tracking-widest uppercase ${isDark ? 'text-white' : 'text-cv-navy-900'}`}>
                  ★ Featured hotels
                </h2>
              </div>
              <div className="space-y-4">
                {featuredPageAccommodations.map((sr) => (
                  <HotelCard key={sr.id} searchResult={sr} onOpenDetail={setDetailResult} />
                ))}
              </div>
              <FeaturedPagination
                page={safeFeaturedPage}
                totalItems={featuredAccommodations.length}
                onPageChange={goToFeaturedPage}
                isDark={isDark}
                itemLabel="hotel"
                idPrefix="hotels"
              />
            </div>
          )}
          {regularPage.map((sr, i) => (
            <Fragment key={sr.id}>
              <HotelCard searchResult={sr} onOpenDetail={setDetailResult} />
              {i === 1 && regularPage.length >= 3 && (
                <AffiliateAdSpot
                  slot="hotels_inline"
                  variant="inline_banner"
                  isDark={isDark}
                  context={{ city: destPlace?.name }}
                />
              )}
            </Fragment>
          ))}

          <Pagination
            page={safePage}
            perPage={perPage}
            totalItems={regularAccommodations.length}
            onPageChange={goToPage}
            onPerPageChange={setPerPage}
            isDark={isDark}
            itemLabel="hotel"
            idPrefix="hotels"
          />
        </div>
      ) : hotelSearch.isSuccess ? (
        <EmptyState message="No hotels found for this location and dates." />
      ) : (
        <EmptyState message={!destPlace ? 'Search for a location to find hotels.' : 'Fill in dates and press Search.'} />
      )}
    </AppShell>

    {detailResult && (
      <HotelDetailModal searchResult={detailResult} onClose={() => setDetailResult(null)} />
    )}
    </>
  );
}

export default function HotelsPage() {
  return (
    <Suspense>
      <HotelsPageInner />
    </Suspense>
  );
}
