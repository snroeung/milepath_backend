'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc-client';
import { NavBar } from '@/components/NavBar';
import { Footer } from '@/components/Footer';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSelectedCards } from '@/contexts/SelectedCardsContext';
import { CARD_PORTAL_MAP, type PortalId } from '@/lib/points/types';
import { SearchModeToggle, type SearchMode } from '@/components/search/SearchModeToggle';
import { FlightSearchForm } from '@/components/search/FlightSearchForm';
import { HotelSearchForm } from '@/components/search/HotelSearchForm';
import { SearchBoard, adaptFlightOffer, adaptStay, FALLBACK_FLIGHTS, FALLBACK_STAYS, type BoardCard, type FlightOfferSlice, type StaySearchResultSlice } from '@/components/search/SearchBoard';
import type { GuestsValue } from '@/components/GuestsDropdown';
import type { SelectedPlace } from '@/components/LocationSearch';
import {
  buildFlightSearchUrl,
  buildHotelSearchUrl,
  isFlightSearchValid,
  isHotelSearchValid,
  type TripType,
} from '@/lib/searchUrls';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Example-board: one-way departures from Philadelphia to a spread of destinations.
const BOARD_ORIGIN = 'PHL';
const BOARD_DESTINATIONS = ['SFO', 'LAX', 'ICN', 'MUC', 'LBG', 'HND'];
const PHILLY = { latitude: 39.9526, longitude: -75.1652 };

const PORTAL_ORDER: PortalId[] = ['chase', 'amex', 'c1', 'bilt', 'citi'];
const PORTAL_BRAND: Record<PortalId, string> = {
  chase: 'Chase',
  amex:  'Amex',
  c1:    'Capital One',
  bilt:  'Bilt',
  citi:  'Citi',
};

function SearchHome() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { selectedCards, cardBalances } = useSelectedCards();

  const [today] = useState(() => new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState<SearchMode>('flights');

  // Flight form state
  const [tripType, setTripType]         = useState<TripType>('roundtrip');
  const [originPlace, setOriginPlace]   = useState<SelectedPlace | null>(null);
  const [arrivalPlace, setArrivalPlace] = useState<SelectedPlace | null>(null);
  const [departDate, setDepartDate]     = useState('');
  const [returnDate, setReturnDate]     = useState('');

  // Hotel form state
  const [destPlace, setDestPlace] = useState<SelectedPlace | null>(null);
  const [checkIn, setCheckIn]     = useState('');
  const [checkOut, setCheckOut]   = useState('');
  const [guests, setGuests]       = useState<GuestsValue>({ adults: 2, children: 0, pets: 0 });

  const flightValues = {
    originCode:      originPlace?.iataCode ?? '',
    originName:      originPlace?.description ?? '',
    destinationCode: arrivalPlace?.iataCode ?? '',
    destinationName: arrivalPlace?.description ?? '',
    departDate,
    returnDate: tripType === 'oneway' ? '' : returnDate,
    tripType,
  };
  const hotelValues = {
    destinationName: destPlace?.description ?? destPlace?.name ?? '',
    latitude:  destPlace?.latitude ?? 0,
    longitude: destPlace?.longitude ?? 0,
    checkIn,
    checkOut,
    rooms: 1,
    adults: guests.adults,
    children: guests.children,
  };

  const flightsValid = isFlightSearchValid(flightValues, today);
  const hotelsValid = isHotelSearchValid(hotelValues, today);

  // ── Example board: cache-first (Redis → Duffel) via the existing tRPC search.
  const bDepart = useMemo(() => addDays(21), []);
  const bReturn = useMemo(() => addDays(24), []);

  // Single server-side fan-out, whole-board cached 24h (see flights.board). One request,
  // one cheapest offer per route — no per-visit Duffel calls competing with real searches.
  const flightBoard = useQuery({
    queryKey: ['searchBoard.flights', BOARD_ORIGIN, bDepart],
    queryFn: () => trpc.flights.board.query({ origin: BOARD_ORIGIN, destinations: BOARD_DESTINATIONS, departureDate: bDepart }),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
  });
  const stayBoard = useQuery({
    queryKey: ['searchBoard.stays', PHILLY.latitude, PHILLY.longitude, bDepart, bReturn],
    queryFn: () => trpc.stays.search.mutate({
      latitude: PHILLY.latitude, longitude: PHILLY.longitude,
      checkInDate: bDepart, checkOutDate: bReturn,
      guests: [{ type: 'adult' }, { type: 'adult' }],
    }),
    staleTime: 1000 * 60 * 15,
    retry: false,
  });

  const flightCards: BoardCard[] = useMemo(
    () => ((flightBoard.data as FlightOfferSlice[] | undefined) ?? []).map(adaptFlightOffer).filter((c: BoardCard | null): c is BoardCard => c !== null),
    [flightBoard.data],
  );
  const nights = useMemo(() => Math.max(1, Math.round((Date.parse(bReturn) - Date.parse(bDepart)) / 86400000)), [bDepart, bReturn]);
  const stayCards: BoardCard[] = useMemo(
    () => ((stayBoard.data as StaySearchResultSlice[] | undefined) ?? []).map((sr) => adaptStay(sr, nights)).filter((c: BoardCard | null): c is BoardCard => c !== null).slice(0, 8),
    [stayBoard.data, nights],
  );

  const isFlights = mode === 'flights';
  const boardLoading = isFlights ? flightBoard.isLoading : stayBoard.isLoading;
  // Live cache-first results win; fall back to curated examples when empty.
  const liveItems = isFlights ? flightCards : stayCards;
  const boardItems = liveItems.length > 0 ? liveItems : (isFlights ? FALLBACK_FLIGHTS : FALLBACK_STAYS);

  const pageBg = isDark ? 'bg-gph-dark-bg' : 'bg-gray-100';
  const surface = isDark ? 'bg-gph-dark-card border-gph-dark-line' : 'bg-white border-gray-200';
  const tray    = isDark ? 'bg-gph-dark-bg border-gph-dark-line' : 'bg-gray-100 border-gray-200';
  const ink = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const muted = isDark ? 'text-gph-dark-muted' : 'text-gray-600';

  // "Searching with" chips: signed-in users see the issuers they selected + their
  // points (entered in the profile popup); everyone else sees all brands, no points.
  const wallet = (() => {
    const loggedInWithCards = !!user && selectedCards.length > 0;
    if (!loggedInWithCards) {
      return PORTAL_ORDER.map((p) => ({ label: PORTAL_BRAND[p], points: null as number | null }));
    }
    const totals = new Map<PortalId, number>();
    for (const id of selectedCards) {
      const portal = CARD_PORTAL_MAP[id];
      totals.set(portal, (totals.get(portal) ?? 0) + (cardBalances[id] ?? 0));
    }
    return PORTAL_ORDER.filter((p) => totals.has(p)).map((p) => ({ label: PORTAL_BRAND[p], points: totals.get(p)! }));
  })();

  return (
    <div className={`min-h-screen flex flex-col ${pageBg}`}>
      <NavBar />

      <main className="w-full px-4 md:px-8 py-8 md:py-12 flex-1">
        {/* White hub panel: hero + search + wallet */}
        <div className={`rounded-2xl border p-5 md:p-8 ${surface}`}>
        {/* Hero */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-6">
          <div>
            <div className={`text-[11px] font-mono font-bold uppercase tracking-widest ${muted}`}>
              Search · every portal, one query
            </div>
            <h1 className={`mt-3 text-4xl md:text-5xl font-bold tracking-tight ${ink}`}>
              {isFlights ? 'Find your flight' : 'Find your stay'}
              <span className="text-cv-lime-500">.</span>
            </h1>
            <p className={`mt-3 max-w-xl text-sm md:text-base ${muted}`}>
              Search cash and points side by side across every travel portal — ranked by true
              cents-per-point value.
            </p>
          </div>
          <SearchModeToggle mode={mode} onChange={setMode} />
        </div>

        {/* Search tray (inset within the panel) */}
        <div className={`rounded-xl border p-4 md:p-5 ${tray}`}>
          {isFlights ? (
            <FlightSearchForm
              tripType={tripType}
              onTripTypeChange={setTripType}
              onOriginSelect={setOriginPlace}
              onOriginClear={() => setOriginPlace(null)}
              onArrivalSelect={setArrivalPlace}
              onArrivalClear={() => setArrivalPlace(null)}
              startDate={departDate}
              onStartDateChange={setDepartDate}
              endDate={returnDate}
              onEndDateChange={setReturnDate}
              onSearch={() => router.push(buildFlightSearchUrl(flightValues))}
              searchDisabled={!flightsValid}
            />
          ) : (
            <HotelSearchForm
              onDestSelect={setDestPlace}
              onDestClear={() => setDestPlace(null)}
              checkIn={checkIn}
              onCheckInChange={setCheckIn}
              checkOut={checkOut}
              onCheckOutChange={setCheckOut}
              guests={guests}
              onGuestsChange={setGuests}
              onSearch={() => router.push(buildHotelSearchUrl(hotelValues))}
              searchDisabled={!hotelsValid}
            />
          )}
        </div>

        {/* Wallet strip */}
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${muted}`}>Searching with</span>
          {wallet.map(({ label, points }) => (
            <span key={label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tray}`}>
              <span className="w-1.5 h-1.5 rounded-sm bg-cv-lime-500" />
              <span className={`font-bold ${ink}`}>{label}</span>
              {points !== null && <span className={`font-mono ${muted}`}>{points.toLocaleString()}</span>}
            </span>
          ))}
        </div>
        </div>

        {/* Example board */}
        <div className="mt-8">
          <div className={`flex items-end justify-between pb-3 mb-4 border-b ${isDark ? 'border-gph-dark-line' : 'border-gray-300'}`}>
            <div>
              <div className={`text-xl font-bold tracking-tight ${ink}`}>
                {isFlights ? 'Example routes · Philadelphia departures' : 'Example stays · Philadelphia'}
              </div>
              <div className={`text-[11px] font-mono uppercase tracking-widest mt-1 ${muted}`}>Live board</div>
            </div>
          </div>
          <SearchBoard items={boardItems} loading={boardLoading} />

        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchHome />
    </Suspense>
  );
}
