# RecoverIQ

Recover money you're owed: forgotten deposits, rejected refunds, missing reimbursements, travel compensation, and unwanted renewals.

Upload a receipt, email, or screenshot. RecoverIQ identifies the claim, prepares the evidence and a request letter, sends it through your email app once you authorize it, and tracks deadlines and escalation.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go (iOS/Android), or press w for web
```

Other scripts: `npm test` (logic unit tests), `npm run typecheck`, `npx expo lint`.

## How it's built

Expo SDK 58, React Native, TypeScript, and Expo Router. Everything runs on the device. Data is stored locally with AsyncStorage.

| Path | What it does |
| --- | --- |
| `src/app/index.tsx` | Onboarding, plus the dashboard: money in play, recovered, claims needing action |
| `src/app/new.tsx` | Add a photo, file, or pasted text, analyze it, review the details, create the claim |
| `src/app/claim/[id].tsx` | Authorization, letter preview, send via email, wait timer, escalation ladder, evidence, timeline |
| `src/app/settings.tsx` | Profile, plans (free / pro / pay-on-success), disclosures, delete data |
| `src/lib/analyzer.ts` | Heuristic claim detection: merchant, amount, currency, date, reference, contact, category |
| `src/lib/escalation.ts` | Per-category escalation ladders, pure state transitions, letter generation |
| `src/lib/store.tsx` | App state and persistence |

## Compliance design

- **The user sends everything.** The app never contacts a business on its own. It records an explicit, timestamped authorization per claim, and the user reviews and sends each request from their own email.
- **Fee disclosure.** The success fee (15%) is shown in the plan picker and on every recovery. It's labelled as offered only where legally permitted.
- **Not legal advice.** Shown on onboarding and in settings.

## Known limitations / next steps

1. **Image OCR.** Screenshots are attached as evidence, but their text isn't read yet. Use on-device OCR or a backend vision model.
2. **Smarter analysis.** Swap `analyze()` for a server endpoint backed by an LLM, keeping the same `Analysis` shape. Don't ship API keys in the app.
3. **Durable files.** Picked images and files reference the OS cache, so copy them into app storage with `expo-file-system`.
4. **Reminders.** Add `expo-notifications` to alert the user when a response deadline passes.
5. **Accounts and sync, real payments** (RevenueCat or StoreKit / Play Billing), and jurisdiction-specific rules for deadlines and success-fee legality.
