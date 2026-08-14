# 591 Property Radar Extension POC

Stage 2/9 POC for scanning a 591 search results page that the user has already opened manually.

## Scope

- Reads only the DOM of the current active 591 page after clicking **Scan Current Page**.
- Does not log in automatically.
- Does not turn pages automatically.
- Does not run a background crawler.
- Does not bypass CAPTCHA, anti-bot, or access restrictions.
- Does not modify the 591 page content.
- Does not write to the existing server or database.
- Does not sync to Google Sheets.
- Does not score listings.

## Install In Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `extensions/591-radar`.
5. Pin **591 Property Radar POC** from the Chrome extensions menu if you want quick access.

## Test Page

Open a 591 search results page manually, then click the extension.

Best first test:

- 591 店面出租搜尋結果頁

Also possibly compatible:

- 591 租屋搜尋結果頁, if the DOM structure is shared with 店面出租

This POC scans the listings currently rendered in the page DOM. It does not click next page, scroll in the background, or fetch additional pages.

## Use

1. Open the target 591 search results page in Chrome.
2. Click the extension icon.
3. Click **Scan Current Page**.
4. Review:
   - **Found Listings**: unique `rent.591.com.tw` numeric listing IDs
   - **Parsed Successfully**
   - **Failed**
5. Copy the JSON with **Copy JSON**, or save it with **Download JSON**.

## Send To Google Sheet

Normal use does not require copying JSON manually.

1. Add the Apps Script from `google-apps-script.js` to the target Google Sheet.
2. Deploy the Apps Script as a Web App.
3. Paste the Web App `/exec` URL into **Google Sheet Webhook URL**.
4. Optional: set a shared secret in the Apps Script and paste the same value into **Shared Secret**.
5. Scan the current 591 page.
6. Click **Send to Google Sheet**.

Rows are upserted by:

```text
source + source_listing_id
```

Crawler-owned fields are refreshed on repeated scans, while human-review fields
such as `status`, `usable_area_ping`, `mrt_station`, `signage`, and notes are
preserved.

The exported JSON includes:

```json
{
  "stats": {
    "candidate_anchors": 12,
    "unique_listing_ids": 10,
    "parsed_successfully": 10,
    "failed": 0,
    "excluded_non_listing": 8,
    "duplicate_ids_removed": 2,
    "invalid_rent_count": 0,
    "invalid_district_count": 0
  },
  "listings": [
    {
      "source": "591",
      "source_listing_id": "12345678",
      "url": "https://rent.591.com.tw/12345678",
      "title": "string or null",
      "city": "string or null",
      "district": "string or null",
      "rent_twd": 320000,
      "listed_area_ping": 20.5,
      "floor_text": "string or null",
      "property_type": "string or null",
      "thumbnail_url": "string or null",
      "scraped_at": "ISO8601 string"
    }
  ]
}
```

Notes:

- `rent_twd` is normalized to a plain number. Example: `32萬` becomes `320000`.
- `listed_area_ping` is only the listed area shown on 591. It is not treated as usable area.
- Unknown fields are returned as `null`.
- URLs must be absolute `rent.591.com.tw` listing URLs.
- `source_listing_id` must come from a numeric `rent.591.com.tw/{listing_id}` URL.
- Candidates without both `source_listing_id` and `url` are not counted as parsed successfully.
- `invalid_rent_count` counts parsed listings whose `rent_twd` is missing or not a positive integer.
- For Taipei pages, `invalid_district_count` counts non-null districts outside the Taipei district whitelist.

## Parser Self-Test

Run the parser self-test from the repository root:

```bash
node extensions/591-radar/parser-self-test.js
```

It checks the critical rent and Taipei district parsing cases used by this POC.

## Debug

Open Chrome DevTools on the 591 page and check the Console for logs prefixed with:

```text
[591-radar]
```

The scanner logs only legal listing IDs, each resolved root container class, a root text preview, and the parsed result.

## Parser Design

The parser intentionally uses multiple fallbacks instead of brittle `nth-child` selectors:

- Legal listing anchors must point to `rent.591.com.tw/{numeric_listing_id}`.
- `market.591.com.tw`, broker cards, community cards, recommended agent cards, and carousel cards are excluded.
- The parser walks upward from each legal listing anchor to find one complete listing card root, while ignoring inner blocks such as `.content`, `.item-info-flex`, `.item-info-left`, and `.item-info-title`.
- Duplicate listing IDs are removed before output.
- Text-based fallbacks are scoped to the resolved listing card root.

If 591 changes its DOM, inspect the `[591-radar]` console output first to see whether candidate containers are being found.
