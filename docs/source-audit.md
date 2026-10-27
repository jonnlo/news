# Source audit and candidate registry

Prepared 28 October 2026 for the personal news digest. This is a planning registry; `scripts/feeds.json` remains the active collector configuration. A candidate is not a working feed until it has been fetched and parsed successfully by the actual collector. Publication preference is an editorial judgment, not a credibility score.

## Current baseline

The checked-in configuration contains 19 RSS sources and Hacker News after the first expansion. The 28 October local edition reports no source errors, but that alone does not establish that every feed produced usable, recent articles. The collector and site support seven categories, including Society and Arts, and select at most six stories per category. The edition reflects one collection environment; GitHub Actions can encounter different availability.

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

The active configuration now has 19 RSS feeds plus Hacker News. Check candidate alternatives below if a feed is unavailable or contributes redundant material. These role and freshness labels are proposed configuration values, not scores. Consider the publication's affiliation when choosing and presenting sources.

## Full candidate directory

The following directory combines the previous source strategy with the existing app. `Active` means present in the current feed configuration, not that it is guaranteed healthy. `Candidate` means not active and requires endpoint, access, content, and parser checks. Some publications appear in more than one area but are listed once. All language labels are provisional and refer to the intended source/feed.

| Source | Area | Role | Language | Freshness | Status |
| --- | --- | --- | --- | --- | --- |
| Ars Technica | Technology | Reporting / analysis | English | News/analysis | Active |
| MIT Technology Review | Technology | Reporting / analysis | English | News/analysis | Active |
| The Verge | Technology | Reporting | English | News | Active |
| WIRED | Technology | Reporting / analysis | English | News/analysis | Candidate |
| Reuters | Technology / general | Wire reporting | English | News | Candidate |
| AP | Technology / general | Wire reporting | English | News | Candidate |
| Hacker News | Technology / discovery | Community discovery and discussion | English / mixed | News | Active API |
| Smashing Magazine | Design | Specialist tutorials / analysis | English | Slow | Active |
| A List Apart | Design | Essays / specialist analysis | English | Slow | Active |
| Nielsen Norman Group | Design | UX research / advice | English | Slow | Candidate |
| CSS-Tricks | Design | Specialist tutorials | English | Slow | Active |
| The Pudding | Design / society | Data storytelling / interactive work | English | Slow | Candidate |
| The Creative Independent | Design / arts | Interviews / creative practice | English | Slow | Candidate |
| Rest of World | Society / technology | Reporting | English | News/analysis | Active |
| 404 Media | Society / technology | Reporting | English | News/analysis | Active |
| The Conversation | Society | Expert commentary | English | News/analysis | Candidate |
| Pew Research Center | Society | Research | English | Slow | Candidate |
| Data & Society | Society | Research | English | Slow | Candidate |
| Hong Kong Free Press | Hong Kong | Reporting | English | News | Active |
| RTHK Local News | Hong Kong | Reporting | English | News | Active |
| RTHK 中文本地新聞 | Hong Kong | Reporting | Chinese | News | Active |
| 香港獨立媒體 | Hong Kong | Reporting / commentary | Chinese | News/analysis | Candidate |
| 端傳媒 | Hong Kong | Reporting / analysis | Chinese | News/analysis | Candidate |
| South China Morning Post | Hong Kong | Reporting / analysis | English | News/analysis | Candidate |
| Hong Kong government press releases | Hong Kong | Government primary statements | English / Chinese | News | Candidate |
| Daily Nous | Philosophy | Specialist reporting / commentary | English | News/analysis | Active |
| Aeon | Philosophy | Essays | English | Slow | Active |
| Psyche | Philosophy / psychology | Essays / practical ideas | English | Slow | Candidate |
| Tricycle | Philosophy / Buddhism | Specialist essays / reporting | English | Slow | Active |
| Lion's Roar | Philosophy / Buddhism | Specialist essays | English | Slow | Candidate |
| Buddhistdoor | Philosophy / Buddhism | Specialist reporting / essays | English / mixed | Slow | Candidate |
| The Marginalian | Philosophy / culture | Essays | English | Slow | Candidate |
| Literary Hub | Literature | Literary reporting / essays | English | News/analysis | Active |
| The Paris Review | Literature | Literary interviews / essays | English | Slow | Active |
| Poetry Foundation | Literature | Poetry | English | Slow | Active |
| Asymptote | Literature | Literature in translation / essays | English / mixed | Slow | Candidate |
| Los Angeles Review of Books | Literature | Reviews / essays | English | Slow | Candidate |
| Publishers Weekly | Literature | Publishing industry reporting | English | News | Candidate |
| Hyperallergic | Arts | Reporting / criticism | English | News/analysis | Active |
| Bandcamp Daily | Arts / music | Music writing | English | Slow | Active |
| MUBI Notebook | Arts / cinema | Film criticism | English | Slow | Candidate |
| The Quietus | Arts / music | Music criticism | English | Slow | Candidate |
| Sight and Sound | Arts / cinema | Film criticism | English | Slow | Candidate |
| IndieWire | Arts / cinema | Film industry reporting / criticism | English | News/analysis | Candidate |

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

Additional research candidates include [SCMP's section feeds](https://www.scmp.com/rss), [Pew's RSS directory](https://www.pewresearch.org/about/follow-us/), and the [Hong Kong government press-release feed](https://data.gov.hk/en-data/dataset/hk-isd-gnmis-gnmis/resource/751b5a45-5c70-4ccb-9aff-d18fdcf2750e). Choose an appropriately narrow feed and label official releases as primary statements. Other candidate URLs identified through third-party directories require the same direct checks; do not treat a directory listing as proof of current collection success.

### Existing parser check

A separate direct local run on 28 October passed the retrieved XML to the existing `parseRss` implementation. Eleven of the 12 successful endpoints returned parsed items with HTTP(S) links and parseable dates for every item in that snapshot: MIT Technology Review 10, The Verge 10, CSS-Tricks 15, Rest of World 12, 404 Media 15, RTHK Chinese 20, Psyche 20, Tricycle 10, Poetry Foundation 30, Hyperallergic 15, and Bandcamp Daily 37. MUBI Notebook timed out on this second fetch despite its earlier successful response; retry before activation. This is a basic structural check, not a review of every article, rate or accuracy of source attribution. No GitHub Actions collection has been tested for these additions.
