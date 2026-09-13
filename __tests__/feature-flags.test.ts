import { isEnabled, getEnabledFlags } from '@/lib/feature-flags';
import type { FlagName } from '@/lib/feature-flags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withEnv(value: string | undefined, fn: () => void) {
  const original = process.env.NEXT_PUBLIC_APP_ENV;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_APP_ENV;
  } else {
    process.env.NEXT_PUBLIC_APP_ENV = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_APP_ENV;
    } else {
      process.env.NEXT_PUBLIC_APP_ENV = original;
    }
  }
}

// ---------------------------------------------------------------------------
// isEnabled() — environment detection
// ---------------------------------------------------------------------------

describe('isEnabled() — environment detection', () => {
  it('defaults to local when NEXT_PUBLIC_APP_ENV is unset', () => {
    withEnv(undefined, () => {
      expect(isEnabled('ui:flights')).toBe(true);
    });
  });

  it('defaults to local for unrecognised env values', () => {
    withEnv('staging', () => {
      expect(isEnabled('ui:flights')).toBe(true);
    });
  });

  it('reads beta environment correctly', () => {
    withEnv('beta', () => {
      expect(isEnabled('ui:flights')).toBe(true);
    });
  });

  it('reads production environment correctly', () => {
    withEnv('production', () => {
      expect(isEnabled('ui:flights')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isEnabled() — gating behaviour
// ---------------------------------------------------------------------------

describe('isEnabled() — gating behaviour', () => {
  it('returns true for a flag enabled in the current env', () => {
    withEnv('local', () => {
      expect(isEnabled('integration:redis:stays')).toBe(true);
    });
  });

  it('returns false for an unknown flag name', () => {
    withEnv('local', () => {
      // Cast to FlagName to test the safety guard — unknown flag returns false
      expect(isEnabled('ui:unknown' as FlagName)).toBe(false);
    });
  });

  it('each tRPC router flag is independent', () => {
    withEnv('local', () => {
      expect(isEnabled('api:stays')).toBe(true);
      expect(isEnabled('api:flights')).toBe(true);
      expect(isEnabled('api:places')).toBe(true);
    });
  });

  it('each integration flag is independent', () => {
    withEnv('local', () => {
      expect(isEnabled('integration:duffel:flights')).toBe(true);
      expect(isEnabled('integration:duffel:stays')).toBe(true);
      expect(isEnabled('integration:hotelbeds:stays')).toBe(true);
      expect(isEnabled('integration:google-places:places')).toBe(true);
      expect(isEnabled('integration:redis:stays')).toBe(true);
      expect(isEnabled('integration:redis:places')).toBe(true);
      expect(isEnabled('integration:redis:offers')).toBe(true);
      expect(isEnabled('integration:supabase')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// getEnabledFlags()
// ---------------------------------------------------------------------------

describe('getEnabledFlags()', () => {
  // ui:trip-planner excluded — temporarily disabled in all envs, see lib/feature-flags.ts
  const ALL_FLAGS: FlagName[] = [
    'ui:hotels', 'ui:flights', 'ui:search', 'ui:offers', 'ui:settings', 'ui:admin',
    'api:stays', 'api:flights', 'api:places', 'api:offers', 'api:portal-data',
    'integration:duffel:flights', 'integration:duffel:stays',
    'integration:hotelbeds:stays', 'integration:google-places:places',
    'integration:redis:stays', 'integration:redis:flights', 'integration:redis:places', 'integration:redis:offers',
    'integration:redis:portal-data',
    'integration:supabase',
  ];

  it('returns only enabled flags for current config', () => {
    withEnv('local', () => {
      const enabled = getEnabledFlags();
      for (const flag of ALL_FLAGS) {
        expect(enabled).toContain(flag);
      }
    });
  });

  it('returns the same enabled set for beta', () => {
    withEnv('beta', () => {
      const enabled = getEnabledFlags();
      expect(enabled).toContain('ui:hotels');
      expect(enabled).toContain('integration:redis:offers');
    });
  });

  it('ui:hotels is not enabled in production', () => {
    withEnv('production', () => {
      const enabled = getEnabledFlags();
      expect(enabled).not.toContain('ui:hotels');
      expect(enabled).toContain('ui:flights');
    });
  });

});
