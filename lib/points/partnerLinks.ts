import type { PortalId } from './types';
import { sameProgram } from './programNames';

export const PORTAL_TRAVEL_URLS: Record<PortalId, string> = {
  chase: 'https://www.chase.com/personal/credit-cards/ultimate-rewards',
  amex:  'https://www.americanexpress.com/en-us/travel/',
  c1:    'https://travel.capitalone.com',
  bilt:  'https://www.biltrewards.com/travel',
  citi:  'https://www.thankyou.com',
};

interface PartnerLink { program: string; url: string }

// One entry per unique program in transferPartners.ts SEED_TRANSFER_PARTNERS (29 total:
// 6 hotel chains, 23 airlines). Root-domain homepage/login links only — no query params.
const PARTNER_LINKS: PartnerLink[] = [
  { program: 'World of Hyatt',              url: 'https://www.hyatt.com' },
  { program: 'IHG One Rewards',             url: 'https://www.ihg.com' },
  { program: 'Marriott Bonvoy',             url: 'https://www.marriott.com' },
  { program: 'Hilton Honors',               url: 'https://www.hilton.com' },
  { program: 'Wyndham Rewards',             url: 'https://www.wyndhamrewards.com' },
  { program: 'Choice Privileges',           url: 'https://www.choicehotels.com' },
  { program: 'United MileagePlus',          url: 'https://www.united.com' },
  { program: 'Southwest Rapid Rewards',     url: 'https://www.southwest.com' },
  { program: 'British Airways Avios',       url: 'https://www.britishairways.com' },
  { program: 'Air France/KLM Flying Blue',  url: 'https://www.flyingblue.com' },
  { program: 'Singapore KrisFlyer',         url: 'https://www.singaporeair.com/krisflyer' },
  { program: 'Virgin Atlantic Flying Club', url: 'https://www.virginatlantic.com/flying-club' },
  { program: 'Iberia Plus',                 url: 'https://www.iberia.com' },
  { program: 'Aer Lingus AerClub',          url: 'https://www.aerlingus.com' },
  { program: 'Air Canada Aeroplan',         url: 'https://www.aeroplan.com' },
  { program: 'Emirates Skywards',           url: 'https://www.emirates.com/skywards' },
  { program: 'JetBlue TrueBlue',            url: 'https://www.jetblue.com' },
  { program: 'Delta SkyMiles',              url: 'https://www.delta.com' },
  { program: 'ANA Mileage Club',            url: 'https://www.ana.co.jp' },
  { program: 'Etihad Guest',                url: 'https://www.etihad.com/en-us/etihad-guest' },
  { program: 'Hawaiian Miles',              url: 'https://www.hawaiianairlines.com' },
  { program: 'Qantas Frequent Flyer',       url: 'https://www.qantas.com' },
  { program: 'American AAdvantage',         url: 'https://www.aa.com' },
  { program: 'Alaska Mileage Plan',         url: 'https://www.alaskaair.com' },
  { program: 'Cathay Pacific Asia Miles',   url: 'https://www.cathaypacific.com' },
  { program: 'Turkish Miles&Smiles',        url: 'https://www.turkishairlines.com' },
  { program: 'Avianca LifeMiles',           url: 'https://www.lifemiles.com' },
  { program: 'TAP Air Portugal Miles&Go',   url: 'https://www.flytap.com' },
  { program: 'EVA Air',                     url: 'https://www.evaair.com' },
];

export function resolvePartnerUrl(partnerProgram: string): string | null {
  return PARTNER_LINKS.find(p => sameProgram(p.program, partnerProgram))?.url ?? null;
}
