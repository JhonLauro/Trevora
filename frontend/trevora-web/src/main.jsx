import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from './i18n/index.jsx';
import { LeaveGuardProvider } from './navigation/LeaveGuard.jsx';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { applyTheme, resolveTheme } from './theme.js';
import './styles.css';
// Must come after styles.css — this is the Ink override layer.
import './styles/ink-app.css';
// Auth screens. Imported here rather than from InkAuthShell so the cascade
// order is stated in one place — .ink-button is shared with the app shell,
// and which file wins should not depend on module resolution order.
import './styles/ink-auth.css';
// Shell, Garage and Records surfaces. Loaded last so it wins over the rest.
import './styles/ink-garage.css';
// Vehicle page. Builds on ink-garage.css primitives, so it comes after.
import './styles/ink-vehicle.css';
// The mechanic's shared view. Last, because it builds on primitives from
// every file above it and overrides none of them.
import './styles/ink-mechanic.css';
// Landing composition and section rhythm. Overrides the .fig-* rules in
// styles.css without those needing to be edited in place.
import './styles/ink-landing.css';
// Adding a service record, and checking it before saving. Overrides the
// pre-Ink tokens in styles.css, and neutralises the bare `button` rules there
// and in ink-app.css that out-specify component classes.
//
// These last two sheets cover disjoint surfaces — the landing page and the
// add-record flow share no selectors — so their order relative to each other
// carries no meaning. Both merely need to come after styles.css.
import './styles/service-flow.css';
// One confirmed record, opened. Disjoint from the two above it as well — it
// shares no selectors with either, and only needs to follow styles.css.
import './styles/ink-record.css';
// Account settings. The last screen still served by the legacy styles.css
// block; this sheet overrides it in place of editing that shared file.
import './styles/ink-settings.css';
// Shared access. Also supplies .ink-notice--ok, which ink-auth.css's
// .ink-notice never needed because the auth screens show no success state.
import './styles/ink-access.css';

// The onboarding walkthrough shown once after signup. Last of all: it only
// ever adds, and shares no selectors with the app screens it previews.
import './styles/ink-welcome.css';

// The green brand. Last of the shared sheets on purpose: it is a token
// redefinition, not a screen, and it has to win over every `:root` block
// above it. Nothing before it needs to know the palette changed.
import './styles/trevora-brand.css';
// The landing page, v2. After the brand layer because it reads its tokens,
// and under its own `.tvl-` prefix so it collides with nothing.
import './styles/landing-v2.css';
// Signup step 2. Styles the `vehicle` shell variant, which ink-auth.css has
// no rules for — it only ever knew `signin` and `signup`.
import './styles/signup-vehicle.css';
// The green brand inside the app, one signed-in surface at a time. Last,
// because it overrides the feature sheets above rather than replacing them.
// Temporary by design — see the header of that file.
import './styles/brand-app.css';
// The mechanic's request page. Signed out, no shell, its own `.mreq-`
// namespace — it overrides nothing, so its position here is arbitrary.
import './styles/mechanic-request.css';
// Notifications. Own `.notif-` namespace, but it borrows `.ink-segmented`
// for its filter, so it must come after ink-vehicle.css and brand-app.css.
import './styles/notifications.css';
// Terms and Privacy. Signed out, long-form prose, own `.legal-` namespace.
import './styles/legal.css';
// The walkthrough -> vehicle form hand-off. A fixed overlay above everything,
// own `.gt-` namespace, overrides nothing.
import './styles/garage-transition.css';
// The plain-language explanation panel, `.aiex-`. Replaces the pre-Ink
// `ai-explanation-*` rules in styles.css rather than overriding them.
import './styles/ai-explanation.css';
// The stored receipt and its full-size view, `.rcpt-`. Same story: replaces
// the pre-Ink `stored-receipt-*` and `image-preview-*` rules.
import './styles/stored-receipt.css';

// Arrival motion for screens that wait on the network. Last, and additive:
// one utility class, no selector it shares with anything else.
import './styles/reveal.css';

// Mechanic's shared record detail. That screen is still on the legacy
// `page-shell`, so the record styling in ink-record.css — scoped to
// `.record-page`/`.mechanic-page` — never reached it. Last, because a dozen
// unrelated sheets are imported after ink-mechanic.css.
import './styles/mechanic-record.css';
// Voice input's "Saying it well" guide. Builds on the flow-* classes in
// service-flow.css, so it must come after it.
import './styles/voice-guide.css';
// Hover, press and focus states for the choice cards in the add-record flow.
// After brand-app.css, which restyles one of the two.
import './styles/flow-cards.css';
// Access-request toasts. A floating surface, so it comes after the page styles.
import './styles/toast.css';
// Step-bar fill for the add-record flow. After brand-app.css, which colours it.
import './styles/flow-progress.css';
// The "add this to your vehicle?" offer on the draft review screen.
import './styles/vehicle-offer.css';

// The empty garage — the three ways to add a first record.
import './styles/garage-start.css';
// Unfinished drafts on the Records page. Standalone selectors; only needs
// to follow styles.css.
import './styles/unfinished-drafts.css';
import './styles/vehicle-identity.css';
import './styles/receipt-scan.css';
import './styles/tips.css';
// The language chooser on the settings page.
import './styles/language.css';
// Status badges as labels rather than controls. Additive, shares no selector
// with anything above it.
import './styles/record-badges.css';
// Owner concerns, and their quotation in the shared mechanic view. Additive,
// own `.concern*` namespace.
import './styles/concerns.css';
// Last: it redefines the token values every sheet above draws from.
import './styles/theme.css';

/* Before the first paint. React mounting a moment later would mean a white
   flash on every load for anyone using the dark theme. */
applyTheme(resolveTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <LanguageProvider>
          <LeaveGuardProvider>
            <App />
          </LeaveGuardProvider>
        </LanguageProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
