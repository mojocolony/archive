# Foundation + Import Inspector implementation note

The approved implementation plan originally selected React/Vite, Dexie, the Dropbox JS SDK, and fflate. The build sandbox had no outbound DNS, so npm dependencies could not be installed or verified.

Rather than weaken the privacy/data-integrity design or stall the milestone, the first slice was implemented with browser-native APIs:

- static ES modules instead of React/Vite
- native IndexedDB instead of Dexie
- Dropbox HTTP API + Web Crypto PKCE instead of the Dropbox SDK
- ZIP central-directory and ZIP64 parsing + `DecompressionStream('deflate-raw')` instead of fflate

This preserves the approved product architecture: PWA, Dropbox as the only cloud service, local derived state, no hosted transcript database, and bounded streaming inspection of large source exports.

A second security review against Dropbox's current OAuth guidance changed browser token handling from offline refresh tokens to short-lived PKCE access tokens only. The app stores no Dropbox app secret and no refresh token. Reconnection is required when the short-lived token expires.
