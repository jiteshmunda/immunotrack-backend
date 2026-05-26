# Deep Link Server Setup — Backend Team Reference

This document describes what the backend needs to host and how the email
invitation template should be updated for ImmunoTrack's deep linking flow.

No backend code changes are required beyond hosting two static files and
updating the invite email template.

---

## 1. Host the Verification Files

Both files live in this directory (`/deep-link-server-files/well-known/`).
They must be accessible at these exact URLs — no authentication, no redirects.

### Android — Digital Asset Links

```
URL:           https://dev.immunotrack.ai/.well-known/assetlinks.json
Content-Type:  application/json
```

**Before deploying:** Replace `REPLACE_WITH_YOUR_RELEASE_SHA256_FINGERPRINT`
with the actual SHA-256 fingerprint from your Play signing keystore or
Play Console → App Integrity → App Signing tab. (Get it from flutter dev)

### iOS — Apple App Site Association

```
URL:           https://dev.immunotrack.ai/.well-known/apple-app-site-association
Content-Type:  application/json   (no .json extension — Apple requires this)
```

**Before deploying:** Replace `REPLACE_WITH_TEAM_ID` with your Apple Developer
Team ID (10-character string, found in developer.apple.com → Membership). (Get it from flutter dev)

bundle ID - ai.immunotrack.app
team ID - 6766438796

Example: if Team ID is `6766438796` and bundle ID is `ai.immunotrack.app`,
the appID entry should be: `"6766438796.ai.immunotrack.app"`

---

## 2. Update the Invite Email Template

The current `EmailService.getInviteTemplate()` sends only the display code
(e.g. `IMMU-ABCD-1234`). For deep linking to work, the email must also
include the HTTPS deep link URL so:
  - Users with the app installed can tap it to open directly.
  - Users without the app get routed through the store landing page.

### Add to the email body:

```
Primary button / link:
  https://dev.immunotrack.ai/invite?code=IMMU12345678

Fallback text:
  Or enter this code manually in the ImmunoTrack app: IMMU-ABCD-1234
```

Pass the deep link URL to `getInviteTemplate()` or construct it inside:

```typescript
const deepLink = `https://dev.immunotrack.ai/invite?code=${raw}`;
// raw is the unformatted 12-char code, e.g. "IMMU12345678"
```

---

## 3. Create the Web Landing Page `/invite`

When a user who doesn't have the app taps the link, the browser loads
`https://dev.immunotrack.ai/invite?code=IMMU12345678`.

This page should:

1. Detect the user's platform (User-Agent).
2. On Android → redirect to Play Store with the invite code in the referrer:
   ```
   https://play.google.com/store/apps/details
     ?id=ai.immunotrack.app
     &referrer=invite_code%3DIMMU12345678
   ```
   The `referrer` value must be URL-encoded. The Flutter app reads this
   via the Play Install Referrer API after install.

3. On iOS → redirect to the App Store:
   ```
   https://apps.apple.com/app/idREPLACE_WITH_APP_STORE_ID
   ```
   Also display the invite code prominently so the user can copy it
   manually if needed. Optionally use a JS clipboard copy button.

4. On desktop → show a QR code pointing to the mobile link above. (NOT needed)

### Minimal redirect snippet (Express/Node):

```typescript
app.get('/invite', (req, res) => {
  const code = req.query.code as string;
  const ua = req.headers['user-agent'] || '';

  if (/android/i.test(ua)) {
    const referrer = encodeURIComponent(`invite_code=${code}`);
    return res.redirect(
      `https://play.google.com/store/apps/details?id=ai.immunotrack.app&referrer=${referrer}`
    );
  }

  if (/iphone|ipad|ipod/i.test(ua)) {
    return res.redirect(
      `https://apps.apple.com/app/idREPLACE_WITH_APP_STORE_ID`
    );
  }

  // Desktop fallback — show a download page with the code.
  res.send(`
    <html>
      <body>
        <h1>Get ImmunoTrack</h1>
        <p>Your invite code: <strong>${code}</strong></p>
        <p>Download the app from the App Store or Play Store,
           then enter this code to get started.</p>
      </body>
    </html>
  `);
});
```

> **Note:** When the app IS installed, iOS/Android intercepts the
> `https://dev.immunotrack.ai/invite?code=…` URL before the browser even
> loads — so this landing page only appears when the app is not installed.

---

## 4. Testing Checklist

### Android App Links
- [ ] `https://dev.immunotrack.ai/.well-known/assetlinks.json` returns 200
- [ ] Content-Type is `application/json`
- [ ] SHA-256 fingerprint matches the signing key used in the Play build
- [ ] Test with: `adb shell pm get-app-links ai.immunotrack.app` → shows "verified"
- [ ] Tap `https://dev.immunotrack.ai/invite?code=TESTCODE` on device (app installed) → opens app
- [ ] Tap same link (app not installed) → goes to Play Store

### iOS Universal Links
- [ ] `https://dev.immunotrack.ai/.well-known/apple-app-site-association` returns 200
- [ ] Content-Type is `application/json`
- [ ] Team ID + bundle ID match exactly
- [ ] Test with: WWDR's "App Link Validator" or `swcutil display -f` on Mac
- [ ] Tap `https://dev.immunotrack.ai/invite?code=TESTCODE` in iOS Mail (app installed) → opens app
- [ ] Tap same link in Safari (app installed) → smart banner or opens app

### Deferred — Android
- [ ] Uninstall app
- [ ] Tap invite email link → lands on Play Store with referrer parameter
- [ ] Install app → open → SplashScreen → InviteCodeScreen with code pre-filled

### Deferred — iOS
- [ ] Uninstall app
- [ ] Long-press invite link in email → Copy Link
- [ ] Open App Store → install app
- [ ] Open app → iOS prompts "ImmunoTrack wants to paste…" → Allow
- [ ] InviteCodeScreen opens with code pre-filled

### Fallback (always available)
- [ ] User opens app manually → sees InviteCodeScreen → types code manually → works
