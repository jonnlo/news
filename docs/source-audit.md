# Source audit and candidate registry

Prepared 28 October 2026 for the personal news digest. This is a planning registry; `scripts/feeds.json` remains the active collector configuration. A candidate is not a working feed until it has been fetched and parsed successfully by the actual collector. Publication preference is an editorial judgment, not a credibility score.

## Current baseline

The checked-in configuration contains 22 RSS sources and Hacker News after the source additions verified on 29 October. The 28 October local edition reports no source errors, but that alone does not establish that every feed produced usable, recent articles. The collector and site support seven categories, including Society and Arts, and select at most six stories per category. The edition reflects one collection environment; GitHub Actions can encounter different availability.

## Initial trial shortlist

The original shortlist considered 13 additions to the original nine RSS feeds, balancing reporting with slower-moving writing and creative work. Ten have now been added; The Creative Independent, Psyche, and MUBI Notebook remain under review:

| Candidate | Proposed area | Role | Language | Freshness profile |
| --- | --- | --- | --- | --- |
| MIT Technology Review | Technology | Reporting and analysis | English | News/analysis |
| The Verge | Technology | Reporting | English | News |
| CSS-Tricks | Design | Specialist tutorials and analysis | English | Slow |
| The Creative Independent | Design / arts | Interviews and creative practice | English | Slow |
| Rest of World | Society / technology | Reporting | English | News/analysis |
| 404 Media | Society / technology | Reporting | English | News/analysis |
| RTHK Chinese local news | Hong Kong | Reporting; Chinese-language complement to existing English feed | Chinese | News |
| Psyche | Philosophy / psychology | Essays and practical ideas | English | Slow |
| Tricycle | Philosophy / Buddhism | Specialist essays and reporting | English | Slow |
| Poetry Foundation | Literature | Poetry; proposed feed is Poem of the Day, not general news | English | Slow |
| Hyperallergic | Arts | Arts reporting and criticism | English | News/analysis |
| Bandcamp Daily | Arts / music | Music writing; associated with a music marketplace | English | Slow |
| MUBI Notebook | Arts / cinema | Film criticism; associated with a streaming service | English | Slow |

The active configuration now has 39 RSS feeds plus Hacker News (30 October trial). Check candidate alternatives below if a feed is unavailable or contributes redundant material. These role and freshness labels are proposed configuration values, not scores. Consider the publication's affiliation when choosing and presenting sources.

## Full candidate directory

The following directory combines the previous source strategy with the existing app. `Active` means present in the current feed configuration, not that it is guaranteed healthy. `Candidate` means not active and requires endpoint, access, content, and parser checks. Some publications appear in more than one area but are listed once. All language labels are provisional and refer to the intended source/feed.

| Source | Area | Role | Language | Freshness | Status |
| --- | --- | --- | --- | --- | --- |
| Ars Technica | Technology | Reporting / analysis | English | News/analysis | Active |
| MIT Technology Review | Technology | Reporting / analysis | English | News/analysis | Active |
| The Verge | Technology | Reporting | English | News | Active |
| WIRED | Technology | Reporting / analysis | English | News/analysis | Active |
| Reuters | Technology / general | Wire reporting | English | News | Partial: Reuters Best |
| AP | Technology / general | Wire reporting | English | News | Active via AP Flipboard |
| Hacker News | Technology / discovery | Community discovery and discussion | English / mixed | News | Active API |
| Smashing Magazine | Design | Specialist tutorials / analysis | English | Slow | Active |
| A List Apart | Design | Essays / specialist analysis | English | Slow | Active |
| Nielsen Norman Group | Design | UX research / advice | English | Slow | Active |
| CSS-Tricks | Design | Specialist tutorials | English | Slow | Active |
| The Pudding | Design / society | Data storytelling / interactive work | English | Slow | Active |
| The Creative Independent | Design / arts | Interviews / creative practice | English | Slow | Active |
| Rest of World | Society / technology | Reporting | English | News/analysis | Active |
| 404 Media | Society / technology | Reporting | English | News/analysis | Active |
| The Conversation | Society | Expert commentary | English | News/analysis | Active |
| Pew Research Center | Society | Research | English | Slow | Active |
| Data & Society | Society | Research | English | Slow | Candidate |
| Hong Kong Free Press | Hong Kong | Reporting | English | News | Active |
| RTHK Local News | Hong Kong | Reporting | English | News | Active |
| RTHK 中文本地新聞 | Hong Kong | Reporting | Chinese | News | Active |
| 香港獨立媒體 | Hong Kong | Reporting / commentary | Chinese | News/analysis | Active |
| 端傳媒 | Hong Kong | Reporting / analysis | Chinese | News/analysis | Active (general feed in Society) |
| South China Morning Post | Hong Kong | Reporting / analysis | English | News/analysis | Active |
| Hong Kong government press releases | Hong Kong | Government primary statements | English / Chinese | News | Active (English and Chinese) |
| Daily Nous | Philosophy | Specialist reporting / commentary | English | News/analysis | Active |
| Aeon | Philosophy | Essays | English | Slow | Active |
| Psyche | Philosophy / psychology | Essays / practical ideas | English | Slow | Candidate |
| Tricycle | Philosophy / Buddhism | Specialist essays / reporting | English | Slow | Active |
| Lion's Roar | Philosophy / Buddhism | Specialist essays | English | Slow | Active |
| Buddhistdoor | Philosophy / Buddhism | Specialist reporting / essays | English / mixed | Slow | Candidate |
| The Marginalian | Philosophy / culture | Essays | English | Slow | Active |
| Literary Hub | Literature | Literary reporting / essays | English | News/analysis | Active |
| The Paris Review | Literature | Literary interviews / essays | English | Slow | Active |
| Poetry Foundation | Literature | Poetry | English | Slow | Active |
| Asymptote | Literature | Literature in translation / essays | English / mixed | Slow | Candidate |
| Los Angeles Review of Books | Literature | Reviews / essays | English | Slow | Candidate |
| Publishers Weekly | Literature | Publishing industry reporting | English | News | Active |
| Hyperallergic | Arts | Reporting / criticism | English | News/analysis | Active |
| Bandcamp Daily | Arts / music | Music writing | English | Slow | Active |
| MUBI Notebook | Arts / cinema | Film criticism | English | Slow | Active trial (intermittent) |
| The Quietus | Arts / music | Music criticism | English | Slow | Active |
| Sight and Sound | Arts / cinema | Film criticism | English | Slow | Partial: general BFI feed |
| IndieWire | Arts / cinema | Film industry reporting / criticism | English | News/analysis | Active |

Discovery candidates for later investigation: Hacker News search, GitHub project releases/trending, selected Reddit communities, Bluesky, and official company blogs. X and Instagram are optional; do not assume stable public feed access. Community activity is an interest signal, not verification. Organization announcements are primary claims, not independent confirmation.

## Validation and selection protocol

For each candidate, record the exact URL, evidence of publisher association, check date and environment, HTTP/redirect result, content type, parsing result, sample item title/link/date/language, and approximate feed volume. Check feed availability on both a local run and GitHub Actions before promoting it. A successful response without usable dated items is not a pass. Distinguish a blocked or inaccessible endpoint from a broken one, and retain the last failure reason. Observe the feeds over several runs before setting quotas or weights.

Use publisher-provided endpoints where practical. Do not scrape paywalled full text or add credentials for the trial. Retain original article URLs. Some publications have restrictive or limited feeds; record these limits and choose alternatives where necessary.

Before activation, review the daily selection logic and total edition size as feeds are added. The current regular-expression feed parser should be checked against real RSS and Atom examples, including Chinese text, dates, and links; replace or fix it if validation exposes problems.

Once sources are validated, archive the complete candidate pool and compare ranking methods as described in the implementation plan. Do not tune publisher weights from one day's output.

## Shortlist endpoint check — 28 October 2026

A direct local fetch using the collector's user agent and a 15-second timeout returned the following. The check counted RSS/Atom item blocks and inspected the first item's title, date, and link markup; it did **not** run each item through the collector's parser or test GitHub Actions. Item counts are snapshots, not publication-rate estimates. All successful samples had recognizable titles, dates, and link markup. Endpoint redirects are shown where relevant.

| Source | Requested endpoint | Result | Item blocks | Notes |
| --- | --- | --- | ---: | --- |
| MIT Technology Review | https://www.technologyreview.com/feed/ | HTTP 200 | 10 | RSS |
| The Verge | https://www.theverge.com/rss/index.xml | HTTP 200 | 10 | Atom-style XML; verify link extraction |
| CSS-Tricks | https://css-tricks.com/feed/ | HTTP 200 | 15 | RSS |
| The Creative Independent | https://thecreativeindependent.com/feed/ | HTTP 403 | 0 | Blocked in this environment; hold and recheck, not proof that the feed is permanently unavailable |
| Rest of World | https://restofworld.org/feed/latest/ | HTTP 200 | 12 | XML; publisher [lists RSS](https://restofworld.org/platforms/) |
| 404 Media | https://www.404media.co/rss/ | HTTP 200 | 15 | RSS |
| RTHK 中文本地新聞 | https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml | HTTP 200 | 20 | Redirected to rthk9.rthk.hk; Chinese sample; [publisher RSS directory](https://news.rthk.hk/rthk/ch/rss.htm) |
| Psyche | https://psyche.co/feed | HTTP 200 | 20 | Redirected to https://psyche.co/feed.rss; review publisher's [RSS terms](https://psyche.co/terms-of-use) for the public site before activation |
| Tricycle | https://tricycle.org/feed/ | HTTP 200 | 10 | RSS |
| Poetry Foundation | https://www.poetryfoundation.org/rss/poemoftheday | HTTP 200 | 30 | Poem of the Day feed, not general literary news |
| Hyperallergic | https://hyperallergic.com/feed/ | HTTP 200 | 15 | Redirected to https://hyperallergic.com/rss/ |
| Bandcamp Daily | https://daily.bandcamp.com/feed | HTTP 200 | 37 | RSS blocks; response did not supply a content type |
| MUBI Notebook | https://mubi.com/notebook/posts.rss | HTTP 200 | 24 | RSS |

The 12 successful additions, plus the nine existing RSS feeds, form a provisional 21-feed trial set. Holding Psyche pending assessment of its use for this publicly accessible site leaves 20 RSS feeds for the initial trial. The blocked Creative Independent is retained as a candidate. Substitute another arts/design source if it cannot be collected reliably. Ten of these additions are now active; Psyche remains under review and MUBI Notebook requires a reliability recheck. Scheduled-run availability remains to be checked. Existing Aeon is also published by Aeon Media Group; review its applicable feed terms alongside Psyche before the public trial.

Additional research candidates include [Pew's RSS directory](https://www.pewresearch.org/about/follow-us/) and the [Hong Kong government press-release feed](https://data.gov.hk/en-data/dataset/hk-isd-gnmis-gnmis/resource/751b5a45-5c70-4ccb-9aff-d18fdcf2750e). Choose an appropriately narrow feed and label official releases as primary statements. Other candidate URLs identified through third-party directories require the same direct checks; do not treat a directory listing as proof of current collection success.

### Existing parser check

A separate direct local run on 28 October passed the retrieved XML to the existing `parseRss` implementation. Eleven of the 12 successful endpoints returned parsed items with HTTP(S) links and parseable dates for every item in that snapshot: MIT Technology Review 10, The Verge 10, CSS-Tricks 15, Rest of World 12, 404 Media 15, RTHK Chinese 20, Psyche 20, Tricycle 10, Poetry Foundation 30, Hyperallergic 15, and Bandcamp Daily 37. MUBI Notebook timed out on this second fetch despite its earlier successful response; retry before activation. This is a basic structural check, not a review of every article, rate or accuracy of source attribution. No GitHub Actions collection has been tested for these additions.

### Additional candidate checks — 29 October 2026

Three candidate feeds were fetched directly using the collector's user agent and 15-second timeout. Each response was RSS/XML, contained recognizable dated item blocks, and yielded items with titles, links, and parseable dates under the collector's current extraction pattern. The checks used the active collector environment; scheduled-run availability and editorial quality still need observation.

| Source | Feed URL | Result | Parsed item blocks | Sample |
| --- | --- | --- | ---: | --- |
| WIRED | https://www.wired.com/feed/rss | HTTP 200, `application/xml` | 50 | “Hisense UR8 RGB MiniLED TV: Midrange Quality, Upscale Color Accuracy” — 29 Oct 2026 |
| Nielsen Norman Group | https://www.nngroup.com/feed/rss/ | HTTP 200, `application/rss+xml` | 20 | “UX Disciplines: Glossary” — 23 Oct 2026 |
| South China Morning Post (Hong Kong) | https://www.scmp.com/rss/2/feed | HTTP 200, `text/xml`; redirected to trailing-slash URL | 50 | “China’s currency goes global” — 29 Oct 2026 |

The WIRED endpoint is linked from the publisher's [RSS directory](https://www.wired.com/about/rss-feeds/); the SCMP section endpoint was selected from its [official RSS directory](https://www.scmp.com/feed-rss). The Nielsen Norman Group endpoint is the direct feed URL tested above; no publisher RSS directory was located during this check. WIRED and SCMP feed links are classified as reporting sources; NN/G is slower specialist UX research/advice. These additions are now in `scripts/feeds.json`. A direct check of `https://thepudding.cool/feed.xml` failed with a network fetch error, so The Pudding remains a candidate and was not added. No GitHub Actions check was performed.

### Expanded-source trial — 30 October 2026

A local direct endpoint check returned HTTP 200 and dated item markup for The Conversation (`https://theconversation.com/global/articles.atom`, 49 entries), Pew Research Center (`https://www.pewresearch.org/feed/`, 100), 香港獨立媒體 (`https://www.inmediahk.net/rss.xml`, 15), Lion’s Roar (`https://www.lionsroar.com/feed/`, 10), The Marginalian (`https://www.themarginalian.org/feed/`, 20), MUBI Notebook (`https://mubi.com/notebook/posts.rss`, 24), The Quietus (`https://thequietus.com/feed/`, 32) and IndieWire (`https://www.indiewire.com/feed/`, 12). These are trial feeds at neutral weight; their practical availability, category fit and output should be monitored in the real collector and in GitHub Actions.

The Creative Independent and Asymptote returned HTTP 403, the tested LA Review of Books feed returned 404, and Data & Society and Buddhistdoor returned XML without article entries. The Pudding hostname could not be resolved in this test. These results do not establish that alternate official feeds are unavailable. 端傳媒's general feed returned entries, but is not configured as Hong Kong-specific because it also covers other places; a suitable category-aware integration needs investigation. Reuters, AP, the Hong Kong government feed, Publishers Weekly, Sight and Sound and other candidates still need suitable endpoints or integrations. Psyche remains on hold: its [feed terms](https://psyche.co/terms-of-use) specify individual, personal, noncommercial use, and the digest is public. Existing Aeon usage also remains to be reviewed. No scheduled-run test was performed.

The subsequent 30 October collector run returned 747 candidates and 30/31 sources succeeded. The Conversation, Pew, 香港獨立媒體, Lion’s Roar, The Marginalian, The Quietus and IndieWire all produced dated, HTTP-linked items through the actual parser. MUBI timed out in the collector after passing the direct endpoint check; it remains a trial feed, not a reliability-confirmed source. Its failure was recorded in the candidate snapshot.

A further local trial on 30 October added 端傳媒's general feed to Society and labeled Hong Kong government press releases in Chinese and English, plus Reuters Best (a curated Reuters feed, not a general wire), Publishers Weekly, and the general BFI feed (which is not limited to Sight and Sound). The collector parsed dated article links from each. AP's tested endpoint returned 403; alternative access for the other unactivated candidates remains unresolved. Source labels do not establish independent reporting; press releases are official statements. The broad 端傳媒 and BFI categories are provisional. GitHub Actions availability is unverified.

### Remaining-source checks — 30 October 2026

The Pudding (`https://pudding.cool/rss.xml`), The Creative Independent (`https://thecreativeindependent.com/feed.xml`), and AP via its curated Flipboard feed (`https://flipboard.com/@associatedpress/top-stories-u7govdf1z.rss`) each yielded dated article links through the collector. The AP feed links directly to AP articles but represents a curated selection. Asymptote returned 403 and the tested LA Review of Books feed returned 404; no usable article feeds were established for Data & Society or Buddhistdoor. Psyche remains on hold for the public site pending its feed terms. Reuters Best and the general BFI feed are partial representations, not complete substitutes. These are local checks, not GitHub Actions verification.

### Discovery-source expansion — 30 October 2026

Eighteen trial feeds were added: Kottke, Waxy, MetaFilter, Longreads, Sidebar, Dense Discovery, The Public Domain Review, JSTOR Daily, Noema, Undark, Quanta Magazine, It’s Nice That, Colossal, n+1, Mekong Review, The Offing, Words Without Borders, and London Review of Books. Curators are recorded as such in feed configuration; links sometimes lead to their own posts and sometimes to an outside publisher. Per-curator diversity limits apply within the existing score window, with the same fallback used for other diversity caps.

Not yet added: Codrops returned 403; Boston Review was blocked/redirected; The Sociological Review's tested journal endpoint returned 403; Zolima CityMag's tested feed URL led to a web page rather than RSS; Africa Is a Country's tested feed lacked recognizable dates; Creative Applications Network's tested endpoint returned HTML and needs validation. The earlier Asymptote and Buddhistdoor limitations remain. Psyche remains on hold for the public deployment because its terms restrict feed use. Availability in GitHub Actions remains unverified. The proposed multi-topic tagging and discovery allocation remain future work; the current collector assigns each feed a primary category.
