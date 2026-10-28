# App languages

The app supports Korean, English, simplified Chinese, traditional Chinese,
Vietnamese, Indonesian, Hindi, Filipino, Japanese, and German.
This is an agreed initial language set, not a verified ranking of Pi Network users
by country. Public website traffic, node counts, and community estimates must not
be presented as actual national user counts.

Nigeria is covered by English (`en-NG`), Indonesia by Indonesian (`id-ID`), and
Vietnam by Vietnamese (`vi-VN`). Language detection uses the device/browser's
preferred language, not IP geolocation or an assumption about nationality.
Unsupported device languages (including Nigerian languages not in this list)
default to Korean. A manually selected, supported language takes priority and is
stored under `koinkorae.language`. Traditional Chinese includes Taiwan, Hong Kong,
Macau, and `zh-Hant`; an explicit Chinese script takes priority over region.

The header globe opens the shared app modal. Language names are displayed in their
own languages. The settings modal no longer duplicates the language selector.

Korean UI strings remain translation keys. `src/messages.en.json` and
`src/in-app-browser-messages.json` contain English copy; `src/locales/*.json`
contain the additional catalogs. They are bundled for offline use; no runtime
translation service is contacted. Initial added catalogs were machine-translated
from English, with navigation and social-action copy reviewed. Native-speaker
review of longer copy is still recommended. User posts, names, and messages are
never translated. Missing UI translations fall back to the Korean source key.

When adding copy, update every catalog and retain all `{0}`, `{1}`, etc.
interpolation tokens. Run `node --test tests/language.test.js` and `npm run build`.
