'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PointsResult, PortalId, TransferResult } from '@/lib/points/types';
import { rankOptions } from '@/lib/points/rankOptions';
import { buildRowView, cashEarnLine, splitFeatured, type OptionRowView, type SourceCardView } from '@/lib/points/rowView';
import { useTheme } from '@/contexts/ThemeContext';
import { trpc } from '@/lib/trpc-client';
import type { TransferBonus } from '@/lib/types/offers';
import { ISSUER_LOYALTY_NAME, formatBonusEndDate, findBonusForEligibleCards } from '@/lib/points/transferBonus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function cppTier(cpp: number): { label: string; chipBg: string; chipFg: string } {
  if (cpp >= 2.0) return { label: 'Excellent',  chipBg: '#dcf3e3', chipFg: '#0f7536' };
  if (cpp >= 1.5) return { label: 'Great',       chipBg: '#dcf3e3', chipFg: '#0f7536' };
  if (cpp >  1.0) return { label: 'Above face',  chipBg: '#e8f5eb', chipFg: '#3f8f4e' };
  if (cpp === 1.0) return { label: '= Cash',     chipBg: '#f0f0ee', chipFg: '#5f6066' };
  return               { label: 'Below face',  chipBg: '#e2e8f0', chipFg: '#475569' };
}

/** Colour marks for the overlapping stack on the grouped-alternatives trigger. */
const PORTAL_MARK: Record<PortalId, string> = {
  chase: '#0B4FA2',
  amex:  '#1F6FBF',
  c1:    '#C0212B',
  bilt:  '#4D7C0F',
  citi:  '#0A1628',
};

const TRANSFER_MARK = '#38BDF8';

function markColor(view: OptionRowView): string {
  return view.kind === 'transfer' ? TRANSFER_MARK : PORTAL_MARK[view.sourcePortalId];
}

function EstMark({ isDark, title }: { isDark: boolean; title?: string }) {
  return (
    <span
      tabIndex={0}
      title={title ?? 'Estimated from recent portal pricing'}
      className={`text-[9px] font-mono border-b border-dotted cursor-help ${
        isDark ? 'text-gph-dark-muted border-gph-dark-muted' : 'text-gray-400 border-gray-300'
      }`}
    >
      est.
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.4} aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function RankBadge({ kind, isBestChoice, isDark }: { kind: OptionRowView['kind']; isBestChoice: boolean; isDark: boolean }) {
  const isPortal = kind === 'portal';
  return (
    <p className={`text-[10px] font-bold font-mono uppercase tracking-widest mt-1.5 ${
      isBestChoice
        ? isDark ? 'text-cv-green-400' : 'text-cv-green-800'
        : isDark ? 'text-cv-sky-300'   : 'text-cv-blue-600'
    }`}>
      {isBestChoice ? 'Best choice' : isPortal ? 'Direct portal' : 'Transfer partner'}
    </p>
  );
}

function BonusBadge({ bonus, isDark }: { bonus: TransferBonus; isDark: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wide shrink-0 ${
      isDark ? 'bg-cv-amber-900 text-cv-amber-300' : 'bg-cv-amber-50 text-cv-amber-700'
    }`}>
      {bonus.bonus_pct != null ? `+${bonus.bonus_pct}% bonus` : 'status match'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FeaturedRow — one of the two default-visible ranked options
// ---------------------------------------------------------------------------

/** Column widths shared by the header strip and every featured row. */
const VALUE_COL = 'md:w-36';
const ACTION_COL = 'md:w-32';

function ColumnHeaders({ isDark }: { isDark: boolean }) {
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-400';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  return (
    <div className={`hidden md:flex items-center gap-5 px-5 py-2.5 border-b text-[10px] font-bold font-mono uppercase tracking-widest ${borderCls} ${mutedCls}`}>
      <span className="flex-1">Booking option</span>
      <span className={VALUE_COL}>Value (cpp)</span>
      <span className={ACTION_COL} />
    </div>
  );
}

/**
 * Chip tone reads the deal, not the card: a live bonus is the one worth acting
 * on, and a rate that returns less than a cent per point is worth flagging even
 * though the card is perfectly usable. Everything in between stays neutral so
 * the two ends keep their meaning.
 */
const POOR_CPP = 0.99;

/**
 * Two independent signals, so they get two independent channels: colour states
 * what the transfer is worth, the dashed outline and missing fill state that the
 * card isn't in the wallet. Folding ownership into the colour is what left every
 * unlock chip grey — including ones sitting on a sub-cent rate worth flagging.
 */
const CHIP_PALETTE = {
  bonus: {
    dark:  { fill: 'bg-green-950/40',    text: 'text-cv-green-400',  border: 'border-cv-green-800' },
    light: { fill: 'bg-cv-green-50',     text: 'text-cv-green-800',  border: 'border-cv-green-500' },
  },
  poor: {
    dark:  { fill: 'bg-cv-amber-900',    text: 'text-cv-amber-300',  border: 'border-cv-amber-700' },
    light: { fill: 'bg-cv-amber-50',     text: 'text-cv-amber-700',  border: 'border-cv-amber-400' },
  },
  neutral: {
    dark:  { fill: 'bg-gph-dark-linesoft', text: 'text-gph-dark-ink', border: 'border-gph-dark-line' },
    light: { fill: 'bg-white',             text: 'text-gray-900',     border: 'border-gray-300' },
  },
} as const;

function chipTone(card: SourceCardView, owned: boolean, isDark: boolean): string {
  const deal = card.hasBonus
    ? 'bonus'
    : card.cpp !== null && card.cpp < POOR_CPP
      ? 'poor'
      : 'neutral';
  const { fill, text, border } = CHIP_PALETTE[deal][isDark ? 'dark' : 'light'];
  return owned
    ? `${fill} ${text} ${border}`
    : `bg-transparent ${text} ${border} border-dashed`;
}

/**
 * Which card(s) the transfer actually comes out of. Without this the row names
 * an issuer and nothing tells the user whether that issuer is even in their
 * wallet — the case that made an Air Canada row read "via Chase" to a
 * Capital One-only holder.
 */
function SourceCards({ view, isDark }: { view: OptionRowView; isDark: boolean }) {
  if (view.kind !== 'transfer' || view.sourceCards.length === 0) return null;

  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const ownedCount = view.sourceCards.filter(c => c.owned).length;

  // The no-owned-route case states itself in `unlockNote` above the chips.
  const lead = ownedCount === 0
    ? null
    : view.sourceNarrowing === 'bonus'
      ? 'Transfer from this card — it holds the live bonus'
      : view.sourceNarrowing === 'ratio'
        ? 'Transfer from this card — best ratio of your cards'
        : ownedCount > 1
          ? 'Transfer from any of these cards'
          : 'Transfer from';

  return (
    <div className="mt-1.5">
      {lead && <p className={`text-[10px] font-mono ${mutedCls}`}>{lead}</p>}
      <div className="flex flex-wrap gap-1 mt-1">
        {view.sourceCards.map(card => (
          <span
            key={card.key}
            data-testid="source-chip"
            // Ownership is carried by fill vs dashed outline; mirror it in the
            // DOM so tests assert the state rather than the class string.
            data-owned={card.owned}
            // Full ratio text (and, on an issuer chip, its per-card breakdown)
            // is supplementary — the label, rate and ¢/pt stay on the chip, so
            // nothing here is hover-only.
            title={card.ratioDetail}
            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${chipTone(card, card.owned, isDark)}`}
          >
            {card.label}
            {/* Shown on unowned chips too — it is what earns them their colour. */}
            {card.cpp !== null && (
              <span className="font-mono ml-1 tabular-nums opacity-80">
                {card.ratioLabel !== '1:1' ? `${card.ratioLabel} · ` : ''}{card.cpp}¢
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeaturedRow({ view, isDark }: { view: OptionRowView; isDark: boolean }) {
  const tier = view.cpp !== null ? cppTier(view.cpp) : null;
  const earnLine = cashEarnLine(view);

  const inkCls = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  // Green marks whichever row is actually the better deal — a transfer that
  // beats the portal (TransferResult.isBetterThanPortal) gets the highlight
  // instead of the portal, not the other way around.
  const surface = view.isBestChoice
    ? isDark ? 'bg-green-950/25' : 'bg-cv-green-50'
    : isDark ? 'bg-gph-dark-linesoft' : 'bg-gray-50';

  const btnCls = view.isBestChoice
    ? 'bg-cv-green-800 hover:bg-cv-green-700 text-white'
    : isDark
      ? 'bg-gph-dark-action hover:bg-gph-dark-actionhi text-gph-dark-bg'
      : 'bg-cv-navy-950 hover:bg-cv-navy-900 text-white';

  return (
    <div className={`border-b ${borderCls} ${surface}`}>
      <div className="px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-5">

        {/* Booking source + context */}
        <div className="min-w-0 md:flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: markColor(view) }} aria-hidden="true" />
            <span className={`text-base font-bold ${inkCls}`}>{view.displayName}</span>
            {view.bonus && <BonusBadge bonus={view.bonus} isDark={isDark} />}
          </div>
          {view.context && <p className={`text-xs mt-0.5 ${mutedCls}`}>{view.context}</p>}
          <RankBadge kind={view.kind} isBestChoice={view.isBestChoice} isDark={isDark} />
          {view.unlockNote && (
            <p className={`text-xs mt-1 ${isDark ? 'text-cv-amber-300' : 'text-cv-amber-700'}`}>
              {view.unlockNote}
            </p>
          )}
          <SourceCards view={view} isDark={isDark} />
          {earnLine && (
            <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-cv-green-400' : 'text-cv-green-800'}`}>
              {earnLine}
            </p>
          )}
        </div>

        {/* Value + redemption requirement */}
        <div className={`${VALUE_COL} shrink-0`}>
          {view.cpp !== null && tier ? (
            <>
              <p
                data-testid={view.isBestChoice ? 'best-choice-cpp' : undefined}
                className={`text-3xl font-extrabold font-mono tabular-nums leading-none ${inkCls}`}
              >
                {view.cpp}<span className="text-xl">¢</span>
              </p>
              <p className={`text-xs font-mono mt-1.5 ${mutedCls}`}>
                {view.points !== null
                  ? <span className="tabular-nums">{view.points.toLocaleString()} {view.pointsUnit}</span>
                  : <span className="italic">award rate varies</span>}
                {' '}
                <EstMark isDark={isDark} title={view.estNote} />
              </p>
              <p className={`text-[10px] font-mono mt-0.5 ${mutedCls}`}>{tier.label}</p>
            </>
          ) : (
            <p className={`text-sm font-semibold ${mutedCls}`}>Check program for pricing</p>
          )}
        </div>

        {/* Action */}
        <div className={`${ACTION_COL} shrink-0`}>
          <button
            type="button"
            aria-label={`View ${view.sourceName} deal`}
            className={`min-h-11 w-full px-4 rounded-lg text-sm font-bold transition-colors ${btnCls}`}
          >
            View deal
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlternativeRow — one compact row inside the grouped-alternatives popover
// ---------------------------------------------------------------------------

function AlternativeRow({
  view,
  scopeLabel,
  isDark,
}: {
  view: OptionRowView;
  scopeLabel: string;
  isDark: boolean;
}) {
  const inkCls = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  const earnLine = cashEarnLine(view);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${borderCls}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: markColor(view) }} aria-hidden="true" />
          <span className={`text-xs font-bold truncate ${inkCls}`}>{view.displayName}</span>
          {view.cpp !== null && (
            <span className={`text-xs font-extrabold font-mono tabular-nums ${isDark ? 'text-cv-green-400' : 'text-cv-green-800'}`}>
              {view.cpp} cpp
            </span>
          )}
          {view.bonus && <BonusBadge bonus={view.bonus} isDark={isDark} />}
        </div>
        <p className={`text-[10px] font-mono mt-1 ${mutedCls}`}>
          {scopeLabel} ·{' '}
          {view.points !== null ? `${view.points.toLocaleString()} ${view.pointsUnit}` : 'award rate varies'}
          {view.cashUsd !== null ? ` · or ${fmtUsd(view.cashUsd)} cash` : ' · direct award'}
        </p>
        {/* Too tight for chips — one line saying whose card it comes out of. */}
        {view.kind === 'transfer' && view.sourceCards.length > 0 && (() => {
          const owned = view.sourceCards.filter(c => c.owned);
          return (
            <p className={`text-[10px] font-mono mt-0.5 ${
              owned.length > 0 ? mutedCls : isDark ? 'text-cv-amber-300' : 'text-cv-amber-700'
            }`}>
              {owned.length === 0
                ? `Not in your wallet — needs ${view.sourceCards.map(c => c.label).join(' or ')}`
                : owned.length > 1
                  ? 'Transfer from any of these cards'
                  : `Transfer from ${owned[0].label}`}
            </p>
          );
        })()}
        {earnLine && <p className={`text-[10px] font-mono mt-0.5 ${mutedCls}`}>{earnLine}</p>}
      </div>

      <button
        type="button"
        aria-label={`View ${view.sourceName} deal`}
        className={`shrink-0 min-h-11 px-3 rounded-lg text-[11px] font-extrabold transition-colors ${
          isDark ? 'bg-gph-dark-action hover:bg-gph-dark-actionhi text-gph-dark-bg' : 'bg-gray-900 hover:bg-gray-700 text-white'
        }`}
      >
        View deal
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupedAlternatives — overlapping marks trigger + full-grid overlay
// ---------------------------------------------------------------------------

function AlternativesTrigger({
  views,
  scopeAdj,
  open,
  onToggle,
  isDark,
}: {
  views: OptionRowView[];
  scopeAdj: string;
  open: boolean;
  onToggle: () => void;
  isDark: boolean;
}) {
  const inkCls = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  const triggerHover = isDark ? 'hover:bg-gph-dark-linesoft' : 'hover:bg-gray-50';
  const ringColor = isDark ? '#161618' : '#ffffff';

  return (
    <div className={`border-b ${borderCls}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`w-full min-h-11 px-5 py-3 flex items-center gap-3 text-left transition-colors ${triggerHover}`}
      >
        <span className="flex items-center shrink-0" aria-hidden="true">
          {views.slice(0, 5).map((v, i) => (
            <span
              key={v.key}
              className="w-4 h-4 rounded-full shrink-0"
              style={{
                background: markColor(v),
                boxShadow: `0 0 0 2px ${ringColor}`,
                marginLeft: i === 0 ? 0 : -6,
                zIndex: 5 - i,
              }}
            />
          ))}
        </span>
        <span className={`flex-1 text-xs font-bold ${inkCls}`}>
          See {views.length} {scopeAdj} option{views.length !== 1 ? 's' : ''}
        </span>
        <span className={mutedCls}>
          <ChevronIcon open={open} />
        </span>
      </button>
    </div>
  );
}

/**
 * Covers the grid box exactly (`absolute inset-0` inside the grid's relative
 * root) instead of hanging off the trigger. Anchoring below the trigger spilled
 * the panel over the next result card and left the grid half-visible behind it;
 * filling the same rectangle keeps the card footprint unchanged while it is
 * open. The row list is the only flexible band, so a long list scrolls inside
 * the overlay rather than growing past the grid.
 */
function AlternativesOverlay({
  views,
  scopeLabel,
  scopeAdj,
  unitNoun,
  onClose,
  isDark,
}: {
  views: OptionRowView[];
  scopeLabel: string;
  scopeAdj: string;
  unitNoun: string;
  onClose: () => void;
  isDark: boolean;
}) {
  const inkCls = isDark ? 'text-gph-dark-ink' : 'text-gray-900';
  const mutedCls = isDark ? 'text-gph-dark-muted' : 'text-gray-500';
  const borderCls = isDark ? 'border-gph-dark-line' : 'border-gray-200';
  const surfaceCls = isDark ? 'bg-gph-dark-card' : 'bg-white';

  return (
    <div
      role="dialog"
      aria-label={`Other ${scopeAdj} options`}
      className={`cv-overlay absolute inset-0 z-40 flex flex-col overflow-hidden rounded-b-xl border shadow-xl ${borderCls} ${surfaceCls}`}
    >
      <div className={`flex items-center justify-between gap-3 shrink-0 pl-4 pr-2 py-2 border-b ${borderCls} ${isDark ? 'bg-gph-dark-bg' : 'bg-gray-50'}`}>
        <p className={`text-sm font-bold ${inkCls}`}>Other {scopeAdj} options</p>
        <div className="flex items-center gap-2">
          <p className={`text-[10px] font-bold font-mono uppercase tracking-widest ${mutedCls}`}>
            {views.length} {unitNoun}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors ${
              isDark ? 'text-gph-dark-muted hover:bg-gph-dark-linesoft' : 'text-gray-500 hover:bg-gray-200'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {views.map(v => (
          <AlternativeRow key={v.key} view={v} scopeLabel={scopeLabel} isDark={isDark} />
        ))}
      </div>

      <p className={`shrink-0 px-4 py-2.5 text-[10px] leading-relaxed border-t ${borderCls} ${mutedCls}`}>
        Cash earnings are estimates based on the selected card&rsquo;s travel-category multiplier.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BonusNotice — live transfer promotion that changes the ranking
// ---------------------------------------------------------------------------

function BonusNotice({ bonus, scopeNote, isDark }: { bonus: TransferBonus; scopeNote: string; isDark: boolean }) {
  return (
    <div className={`px-5 py-2 text-[11px] font-semibold font-mono border-b ${
      isDark ? 'bg-cv-amber-900 text-cv-amber-300 border-gph-dark-line' : 'bg-cv-amber-50 text-cv-amber-700 border-gray-200'
    }`}>
      ⚡ {bonus.bonus_pct != null ? `${bonus.bonus_pct}% transfer bonus` : 'Status-match transfer offer'} to {bonus.transfer_partner} from{' '}
      {ISSUER_LOYALTY_NAME[bonus.issuer]} through {formatBonusEndDate(bonus.end_date)} · {scopeNote}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RedemptionTable — portal comparison table + grouped alternatives + footnote
// ---------------------------------------------------------------------------

export function RedemptionTable({
  result,
  scopeLabel = 'Total',
  scopeAdj = 'booking',
  unitNoun = 'options',
  scopeNote = 'applies to the complete booking',
  showBonusNotice = true,
}: {
  result: PointsResult;
  /** Prefixes every redemption line — 'Round trip', 'One way', '3 nights' */
  scopeLabel?: string;
  /** Adjective in the grouped trigger and popover title — 'round-trip', 'stay' */
  scopeAdj?: string;
  /** What the popover counts — 'itineraries', 'options' */
  unitNoun?: string;
  /** Tail of the transfer-bonus notice, clarifying what the promo covers */
  scopeNote?: string;
  /** Off when the surrounding card already renders a TransferBonusBanner */
  showBonusNotice?: boolean;
}) {
  const { isDark } = useTheme();
  const [altOpen, setAltOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!altOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAltOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAltOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [altOpen]);

  // This key is shared with the offers page, so the cached value must stay the
  // bare array — wrapping it in an envelope here hands that page an object it
  // then tries to spread. `dataUpdatedAt` already carries the fetch time, so the
  // date-window check below gets its clock without calling the impure Date.now()
  // during render (react-hooks/purity forbids that even inside useMemo).
  const { data: transferBonuses = [], dataUpdatedAt } = useQuery({
    queryKey: ['offers.transferBonuses'],
    queryFn:  () => trpc.offers.listTransferBonuses.query(),
  });
  const now = dataUpdatedAt || null;
  // Matched against the cards the user holds, not the row's default issuer: a
  // promo on a card they don't own must not badge the row or move its numbers.
  // Date-window guard: admin sessions bypass the public RLS end_date filter,
  // so re-check here to only badge bonuses currently live on the offers page.
  const bonusFor = (t: TransferResult) =>
    now === null ? undefined : findBonusForEligibleCards(t, transferBonuses, now);

  // Unified ¢/pt-ranked list — direct-book portals and transfer partners
  // compete on the same axis; a transfer partner can lead the list. Bonuses are
  // folded into cpp inside buildRowView, so ranking happens on the raw rate and
  // the displayed rate can differ — re-sort on the displayed value so the card
  // never shows a lower cpp above a higher one.
  const views = rankOptions(result)
    .map(row => {
      const match = row.kind === 'transfer' ? bonusFor(row.transfer) : undefined;
      return buildRowView(row, result, match?.bonus, match?.portalId);
    })
    .sort((a, b) => (b.cpp ?? -Infinity) - (a.cpp ?? -Infinity));

  const { featured, alternatives } = splitFeatured(views);
  const liveBonus = views.find(v => v.bonus)?.bonus;

  const containerBg = isDark ? 'bg-gph-dark-card' : 'bg-white';
  const mutedCls    = isDark ? 'text-gph-dark-muted' : 'text-gray-500';

  return (
    <div ref={rootRef} data-testid="redemption-table" className={`relative ${containerBg}`}>

      {showBonusNotice && liveBonus && (
        <BonusNotice bonus={liveBonus} scopeNote={scopeNote} isDark={isDark} />
      )}

      <ColumnHeaders isDark={isDark} />

      {featured.map(view => (
        <FeaturedRow key={view.key} view={view} isDark={isDark} />
      ))}

      {alternatives.length > 0 && (
        <AlternativesTrigger
          views={alternatives}
          scopeAdj={scopeAdj}
          open={altOpen}
          onToggle={() => setAltOpen(v => !v)}
          isDark={isDark}
        />
      )}

      {/* Valuation footnote */}
      <p className={`px-5 py-3 text-[10px] font-mono leading-relaxed rounded-b-xl ${mutedCls}`}>
        Values compare each option against the current cash price. Transfer rows use simplified saver
        award rates{liveBonus ? ', with the live bonus already applied' : ''}; cash earnings assume the
        listed card&rsquo;s travel-category multiplier. Chase Sapphire&rsquo;s Points Boost rate shown
        is a 1.0¢/pt baseline (actual per-booking boost, up to 2.0¢/pt on Reserve or 1.75¢/pt on
        Preferred, isn&rsquo;t modeled).
      </p>

      {altOpen && alternatives.length > 0 && (
        <AlternativesOverlay
          views={alternatives}
          scopeLabel={scopeLabel}
          scopeAdj={scopeAdj}
          unitNoun={unitNoun}
          onClose={() => setAltOpen(false)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
