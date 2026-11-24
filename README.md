# Porter

> Your airport porter, in your pocket.

Porter is an offline-capable airport-to-hotel Progressive Web App built for travelers.

## Firebase AI Logic

Porter uses **Firebase AI Logic** hybrid inference so route reasoning works on-device first on supported desktop Chrome and seamlessly hands off to cloud or deterministic plans when needed:

1. **On-device Gemini Nano (`ONLY_ON_DEVICE` / `PREFER_ON_DEVICE`)**: Used first on supported desktop Chrome and works offline with zero network calls.
   - Badge: `Gemini Nano · Firebase AI Logic · on device`
2. **Cloud Gemini Flash (`ONLY_IN_CLOUD` / hybrid handoff)**: Used when on-device inference is unavailable and the device is online, plus initial setup extraction, grounded official-fare checks, and translation.
   - Badge: `Gemini Cloud · Firebase AI Logic · online`
   - Fallback notice when Nano was unavailable: `Nano wasn't available, so this answer used the cloud.`
3. **Deterministic Template Engine (`TemplateEngine`)**: Guaranteed offline fallback with zero AI when neither on-device nor cloud inference is available (including offline phones).
   - Badge: `Saved plan · no AI`

```text
Question / Disruption Event
   │
   ├─ Offline? ──► Firebase AI Logic (ONLY_ON_DEVICE)
   │                   ├─ Success ──► Validate numbers ─► Badge: "Gemini Nano · Firebase AI Logic · on device"
   │                   └─ Failure ──► TemplateEngine    ─► Badge: "Saved plan · no AI"
   │
   └─ Online?  ──► Firebase AI Logic (PREFER_ON_DEVICE)
                       ├─ ON_DEVICE ──► Validate numbers ─► Badge: "Gemini Nano · Firebase AI Logic · on device"
                       ├─ IN_CLOUD  ──► Validate numbers ─► Badge: "Gemini Cloud · Firebase AI Logic · online"
                       └─ Failure   ──► TemplateEngine    ─► Badge: "Saved plan · no AI"
```

### Setup

1. In the Firebase console, enable **Firebase AI Logic** with the **Gemini Developer API** backend.
2. Create a Firebase Web App and copy its config values into `.env` (starting from `.env.example` — never commit `.env`).
3. Create an App Check **reCAPTCHA Enterprise** key and set `VITE_APPCHECK_SITE_KEY` in `.env`.
4. To test locally with App Check debug mode, set `VITE_APPCHECK_DEBUG=true` in `.env`, run `npm run dev`, copy the debug token printed in the browser console, and register it in Firebase Console under **App Check > Apps > Manage debug tokens**.
5. Select your Firebase project and deploy Hosting:
   ```bash
   firebase use --add
   npm run deploy
   ```

### Desktop Chrome vs. Phones

- **Desktop Chrome**: On-device Gemini Nano requires supported hardware and sufficient free storage (inspect status at `chrome://on-device-internals`). Tap **Get Nano for offline** in the header when available.
- **Phones**: Phones do not run on-device Nano; Porter uses `Gemini Cloud · Firebase AI Logic · online` when connected and `Saved plan · no AI` (`TemplateEngine`) when offline.

### Repo rules

No direct model API calls; all inference lives in `src/engine/firebaseEngine.ts`. Reviewers can verify compliance by checking that:
- `firebase/ai` and `getAI` are imported and used in `src/firebase.ts` and `src/engine/firebaseEngine.ts`.
- Searching the repo returns zero direct model REST endpoints, zero legacy browser AI globals, zero legacy model SDK packages, and zero server-side model API key variables.
- `.env.example` contains variable names only, and `.env` is ignored by git.
