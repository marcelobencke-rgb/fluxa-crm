'use client';

import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// Lazy-load every panel except SettingsOverview (the default landing).
// Each panel is only mounted when its tab is active — no more 12
// simultaneous useEffect fetches on Settings open.
const ProfileForm = lazy(() =>
  import('@/components/settings/profile-form').then((m) => ({ default: m.ProfileForm })),
);
const SecurityPanel = lazy(() =>
  import('@/components/settings/security-panel').then((m) => ({ default: m.SecurityPanel })),
);
const AppearancePanel = lazy(() =>
  import('@/components/settings/appearance-panel').then((m) => ({ default: m.AppearancePanel })),
);
const WhatsAppConfig = lazy(() =>
  import('@/components/settings/whatsapp-config').then((m) => ({ default: m.WhatsAppConfig })),
);
const TemplateManager = lazy(() =>
  import('@/components/settings/template-manager').then((m) => ({ default: m.TemplateManager })),
);
const QuickRepliesManager = lazy(() =>
  import('@/components/settings/quick-replies-manager').then((m) => ({
    default: m.QuickRepliesManager,
  })),
);
const FieldsAndTagsPanel = lazy(() =>
  import('@/components/settings/fields-and-tags-panel').then((m) => ({
    default: m.FieldsAndTagsPanel,
  })),
);
const DealsSettings = lazy(() =>
  import('@/components/settings/deals-settings').then((m) => ({ default: m.DealsSettings })),
);
const MembersTab = lazy(() =>
  import('@/components/settings/members-tab').then((m) => ({ default: m.MembersTab })),
);
const ApiKeysSettings = lazy(() =>
  import('@/components/settings/api-keys-settings').then((m) => ({
    default: m.ApiKeysSettings,
  })),
);
const WebhooksSettings = lazy(() =>
  import('@/components/settings/webhooks-settings').then((m) => ({
    default: m.WebhooksSettings,
  })),
);

function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

/** Map from section key to its lazy component. Only the active one
 *  is rendered, so only that panel's JS is loaded and its useEffect
 *  fetches fire. Switching tabs unmounts the old panel and mounts
 *  the new one on demand. */
function renderPanel(
  section: SettingsSection,
  go: (next: SettingsSection) => void,
): ReactNode {
  switch (section) {
    case 'overview':
      return <SettingsOverview onSelect={go} />;
    case 'profile':
      return <ProfileForm />;
    case 'security':
      return <SecurityPanel />;
    case 'appearance':
      return <AppearancePanel />;
    case 'whatsapp':
      return <WhatsAppConfig />;
    case 'templates':
      return <TemplateManager />;
    case 'quick-replies':
      return <QuickRepliesManager />;
    case 'fields':
      return <FieldsAndTagsPanel />;
    case 'deals':
      return <DealsSettings />;
    case 'members':
      return <MembersTab />;
    case 'api':
      return <ApiKeysSettings />;
    case 'webhooks':
      return <WebhooksSettings />;
    default:
      return <SettingsOverview onSelect={go} />;
  }
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pageDesc')}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">
          <Suspense fallback={<PanelLoader />}>
            {renderPanel(section, go)}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

