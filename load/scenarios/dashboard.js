// load/scenarios/dashboard.js
//
// Reproduces one cold load of /dashboard, request for request.
//
// The page is a client component (app/(dashboard)/dashboard/page.tsx:1), so
// the HTML document carries no data and every figure on the screen comes from
// a separate browser->Supabase round trip. The layout adds three more callers
// of its own before the page runs:
//   app/(dashboard)/layout.tsx:13  ThemeProvider -> useOrganization -> /api/settings/organization
//   app/(dashboard)/layout.tsx:20  PilotBanner   -> useSubscription  -> /api/subscriptions
//   app/(dashboard)/layout.tsx:15  Sidebar       -> getUser + users select (direct)

import { get } from '../lib/metrics.js';
import { appHeaders } from '../lib/auth.js';
import { select, selectSingle, count } from '../lib/rest.js';
import { BASE_URL, SUPABASE_URL } from '../config.js';
import http from 'k6/http';

export function dashboardLoad(session, orgId) {
  // 1. The HTML document.
  get('GET /dashboard (doc)', `${BASE_URL}/dashboard`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });

  // 2. Sidebar (components/Sidebar.tsx:93) validates the session again, then
  //    reads the user row. auth.getUser() is a network call in every case:
  //    @supabase/auth-js GoTrueClient.js:1265 always issues GET /auth/v1/user.
  http.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: session.supabaseHeaders,
    tags: { name: 'gotrue getUser (Sidebar)', class: 'read' },
  });
  selectSingle(
    'pgrst users (Sidebar)',
    session,
    'users',
    `select=first_name,last_name,email&id=eq.${session.userId}`
  );

  // 3. Layout providers.
  get('GET /api/settings/organization', `${BASE_URL}/api/settings/organization`, {
    headers: appHeaders(session),
  });
  get('GET /api/subscriptions', `${BASE_URL}/api/subscriptions`, {
    headers: appHeaders(session),
  });

  // 4. The page itself: nine sequential queries (dashboard/page.tsx:63-192).
  http.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: session.supabaseHeaders,
    tags: { name: 'gotrue getUser (dashboard)', class: 'read' },
  });

  selectSingle(
    'pgrst users+org (dashboard)',
    session,
    'users',
    `select=first_name,organization_id,organizations(name,onboarding_completed,demo_data_seeded)&id=eq.${session.userId}`
  );

  count('pgrst assets count (total)', session, 'assets', `organization_id=eq.${orgId}&archived_at=is.null`);
  count(
    'pgrst assets count (in_use)',
    session,
    'assets',
    `organization_id=eq.${orgId}&archived_at=is.null&status=eq.in_use`
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  // Note: this query carries NO organization filter (dashboard/page.tsx:107),
  // so it is an RLS-filtered count over the whole scans table.
  count('pgrst scans count (7d unscoped)', session, 'scans', `scanned_at=gte.${sevenDaysAgo}`);

  select(
    'pgrst vgp_schedules (dashboard)',
    session,
    'vgp_schedules',
    `select=id,next_due_date,assets(id,name)&organization_id=eq.${orgId}&archived_at=is.null&status=neq.completed&order=next_due_date.asc`
  );

  select(
    'pgrst rentals (all active)',
    session,
    'rentals',
    `select=expected_return_date&organization_id=eq.${orgId}&status=eq.active`
  );

  select(
    'pgrst rentals (top 3)',
    session,
    'rentals',
    `select=id,asset_id,client_name,expected_return_date,assets(name)&organization_id=eq.${orgId}&status=eq.active&order=expected_return_date.asc&limit=3`
  );

  select(
    'pgrst assets+category (utilisation)',
    session,
    'assets',
    `select=status,category_id,asset_categories(name)&organization_id=eq.${orgId}&archived_at=is.null`
  );
}
