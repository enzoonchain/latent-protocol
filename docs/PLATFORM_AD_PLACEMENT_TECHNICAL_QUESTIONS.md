# Platform-Specific Ad Placement — Technical Questions

> Automatikus, nem zavaró, de platform-specifikus ad placementek nyitott kérdései.

---

## 1. Frequency & Throttling

### Kérdések:
- **Milyen gyakran jelenjen meg hirdetés?** — Alapból 5 üzenetenként, de platformonként eltérő lehet?
- **Per-session vs per-day limit?** — Jelenleg `MAX_IMPRESSIONS_PER_SESSION=20`, `MAX_IMPRESSIONS_PER_USER_PER_DAY=100`
- **User control?** — Engedélyezzük a felhasználónak a frequency módosítását? (`/ads frequency 3`)
- **Dynamic frequency?** — Hosszabb session-ökben csökkentsük a frequency-t, hogy ne legyen tolakodó?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A `transform_llm_output` hook minden válaszra fut — frequency counter a plugin-ban van, de mi van ha több session is fut? |
| **Claude Code** | A `Stop` hook sessionenként fut — frequency tracking hol tárolódik? |
| **Telegram** | Per-user frequency tracking kell — de mi van ha egyszerre 1000 user küld üzenetet? |
| **CLI** | Process-specific — frequency resetálódik minden indításkor? |

---

## 2. Content Relevance & Targeting

### Kérdések:
- **Context-alapú targeting?** — A `context` paramétert a user üzenetéből nyerjük — de mi van ha a user privát adatokat oszt meg?
- **User profiling?** — Tároljuk-e a user üzeneteit a jobb targetingért? (GDPR kockázat)
- **Category filtering?** — A `categories` config `all` — de mi van ha a user nem akar kripto hirdetéseket?
- **Negative targeting?** — Lehet-e kizárni bizonyos témákat? (pl. "nem akarok szerencsejáték hirdetéseket")

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A `context` az egész conversation history — túl sok adat, vagy jó a targeting? |
| **Claude Code** | Code-focused context — hirdetünk-e fejlesztői eszközöket? |
| **Telegram** | User ID alapú targeting — de mi van ha a bot publikus? |
| **Aeon** | Skill chain context — hirdetünk-e a skill-ek között? |

---

## 3. UX & Non-Intrusiveness

### Kérdések:
- **Footer vs inline?** — A footer a válasz végén jelenik meg — de mi van ha a válasz hosszú?
- **Markdown rendering?** — A footer markdown formátumú — de mi van ha a platform nem támogatja?
- **Click-through rate?** — Mennyire kattintanak a felhasználók a footer linkre?
- **Skip mechanism?** — Van-e mód a hirdetés kihagyására anélkül hogy a user tiltaná?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A footer a TUI-ban jelenik meg — HTML rendering nem elérhető |
| **Claude Code** | Terminal output — ANSI színek, de markdown nem renderelődik |
| **Telegram** | Markdown V2 formátum — speciális escape kell |
| **CLI** | ANSI escape codes — de mi van ha a terminal nem támogatja? |

---

## 4. Impression Tracking & Attribution

### Kérdések:
- **Mi számít impressionnek?** — A footer megjelenése, vagy a user tényleges megtekintése?
- **View duration?** — Jelenleg nincs view tracking — kell-e?
- **Duplicate impression?** — Ugyanaz a hirdetés többször jelenik meg — de mi van ha a user nem látja?
- **Token expiry?** — Az `impression_token` 5 percig érvényes — de mi van ha a user 10 perc múlva kattint?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A `transform_llm_output` fut, de a user nem biztos hogy látja a footert |
| **Claude Code** | A `Stop` hook fut, de a user scrollolhat tovább |
| **Telegram** | A footer a message-ben van — de mi van ha a user nem scrollol le? |
| **CLI** | Terminal output — user-nél scrollolás kérdéses |

---

## 5. Payment & Earnings

### Kérdések:
- **Mikor jóváíródik a kereset?** — Az impression logolásakor, vagy a user kattintásakor?
- **Payout threshold?** — Jelenleg $5 minimum — de mi van ha a user csak $0.01-t keresett?
- **USDC gas fees?** — A payout transfer gas fee-t igényel — ki fizeti?
- **Multi-wallet?** — A user válthat-e pénztárcát? Mi van a régi egyenleggel?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A wallet a config-ban van — de mi van ha a user másik gépen használja? |
| **Claude Code** | MCP config — wallet a `~/.latent-protocol/config.json`-ban van |
| **Telegram** | Per-user wallet — de mi van ha a bot több felhasználót szolgál ki? |
| **CLI** | Local wallet — de mi van ha a user SSH-val csatlakozik? |

---

## 6. Safety & Anti-Fraud

### Kérdések:
- **Rate limiting?** — Jelenleg `RATE_LIMIT_PER_USER_PER_MINUTE=10` — de mi van ha egy user 100 bot-tal futtatja?
- **Bot detection?** — Hogyan szűrjük ki a botokat, akik csak impression-öket generálnak?
- **Click fraud?** — Mi van ha egy user automatikusan kattintgat?
- **Content moderation?** — A `AD_BLOCKLIST_FILE` de ki tölti fel a blocklistet?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A plugin local — de mi van ha a user módosítja a kódot? |
| **Claude Code** | MCP server — de mi van ha a user proxy-t használ? |
| **Telegram** | Bot API — rate limit a Telegram oldalán is |
| **CLI** | Nincs auth — bárki futtathatja |

---

## 7. Platform Integration Depth

### Kérdések:
- **Deep integration?** — A Hermes plugin `transform_llm_output`-ot használ — de mi van ha a Hermes frissítése eltöri a hook-ot?
- **Fallback mechanism?** — Mi van ha a platform nem támogatja a hook-ot?
- **Version compatibility?** — Melyik Hermes/Claude Code verziókkal működik?
- **Plugin vs MCP?** — MCP univerzális, de nem automatikus — plugin automatikus, de platform-specific?

### Platform-specifikus:
| Platform | Hook | Fallback |
|----------|------|----------|
| **Hermes** | `transform_llm_output` | `post_response` |
| **Claude Code** | `Stop` hook | `PostToolUse` |
| **Telegram** | Bot API wrap | Manual `/ads` command |
| **CLI** | `@adapter.inject` | Manual `adapter.wrap()` |
| **MCP** | — | Nincs (kliensnek kell hívnia) |

---

## 8. Scalability & Performance

### Kérdések:
- **Ad server response time?** — Jelenleg 2s timeout — de mi van ha a szerver lassú?
- **Concurrent users?** — Mennyi user kérhet egyszerre hirdetést?
- **Database performance?** — Az impression tracking DB write-ot igényel — mi van ha 10K user/másodperc?
- **CDN?** — A hirdetés image-ek CDN-en vannak? Vagy inline?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A plugin every-5th-response-ban fut — de mi van ha 100 user egyidejűleg? |
| **Claude Code** | MCP server stdio — single-threaded? |
| **Telegram** | Bot API rate limit — 30 message/second |
| **CLI** | Local process — nincs scaling kérdés |

---

## 9. Privacy & Compliance

### Kérdések:
- **GDPR?** — A user üzeneteit továbbítjuk a szervernek (context) — kell-e consent?
- **Data retention?** — Meddig tároljuk a user üzeneteit? (jelenleg nem tároljuk)
- **Right to be forgotten?** — A user kérheti-e az adatai törlését?
- **Cookie consent?** — A webes landing page cookie-t használ?

### Platform-specifikus:
| Platform | Kérdés |
|----------|--------|
| **Hermes** | A conversation history a plugin-ban van — user consent kell? |
| **Claude Code** | MCP server — a context az user üzenete |
| **Telegram** | Bot API — user data a Telegram-nál van |
| **CLI** | Local — nincs adatmegosztás |

---

## 10. Open Questions (Decision Needed)

| # | Kérdés | Impact | Javaslat |
|---|--------|--------|----------|
| 1 | Frequency legyen-e konfigurálható user-szinten? | UX | Igen, `/ads frequency N` |
| 2 | Kell-e "nem érdekel" gomb a footer-re? | CTR | Igen, feedback loop |
| 3 | Mikor jelenjen meg az első hirdetés? | UX | Azonnal, de frequency=3 az első 10 üzenetben |
| 4 | Kell-e impression cap per session? | Revenue | Igen, 20 max |
| 5 | Auto-payout threshold csökkenthető legyen? | UX | Igen, $1 minimum |
| 6 | Kell-e ad preview before show? | Trust | Nem, zavaró lenne |
| 7 | Platform-specific frequency? | UX | Igen, Hermes=5, Telegram=3, CLI=10 |
| 8 | Kell-e user dashboard? | Trust | Igen, webes earnings page |
| 9 | Content moderation automated? | Safety | Részben, blocklist + manual review |
| 10 | Multi-language support? | Market | Nem most, MVP után |

---

*Last updated: 2026-06-14*
*Status: Technical questions for platform-specific ad placement*
