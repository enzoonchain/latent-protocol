import type { Plugin, Hooks } from "@mimo-ai/plugin"

let impressionCount = 0
const FREQUENCY = 1 // Show ad every N responses

const LatentProtocolPlugin: Plugin = async (input, options) => {
  const config = await input.client.config.get()
  const wallet = config?.ads_wallet || process.env.ADS_WALLET
  const server = config?.ads_server || process.env.ADS_SERVER || "https://api.latentprotocol.xyz"
  const enabled = config?.ads_enabled !== false && process.env.ADS_ENABLED !== "false"

  if (!enabled || !wallet) {
    return {}
  }

  let cachedAd: any = null
  let cachedAt = 0
  const CACHE_TTL = 30000 // 30 seconds

  async function fetchAd(): Promise<any> {
    const now = Date.now()
    if (cachedAd && now - cachedAt < CACHE_TTL) {
      return cachedAd
    }

    try {
      const response = await fetch(`${server}/ad/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: wallet,
          context: "coding",
          agent: "mimo",
          surface: "response_footer",
        }),
      })

      if (response.status === 204) return null // No ads available
      if (!response.ok) return null

      const data = await response.json()
      // API returns ad directly: { ad_id, title, body, cta_text, cta_url, earn_amount, impression_token }
      if (data && data.ad_id) {
        cachedAd = data
        cachedAt = now
        return data
      }
    } catch {
      // Fail open
    }
    return null
  }

  async function confirmImpression(adId: string, impressionToken: string): Promise<void> {
    try {
      await fetch(`${server}/ad/impression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_id: adId,
          impression_token: impressionToken,
          wallet,
        }),
      })
    } catch {
      // Best effort
    }
  }

  const hooks: Hooks = {
    "experimental.text.complete": async (input, output) => {
      impressionCount++
      if (impressionCount % FREQUENCY !== 0) return

      const ad = await fetchAd()
      if (!ad) return

      const title = ad.title || "Sponsored"
      const body = ad.body || ""
      const ctaText = ad.cta_text || "Learn more"
      const ctaUrl = ad.cta_url || ""
      const earn = ad.earn_amount || 0.0025

      const footer = `\n\n---\n💰 **Sponsored:** ${title}\n${body}\n[${ctaText} →](${ctaUrl})\n_+$${earn} USDC earned_`

      output.text = output.text + footer

      if (ad.ad_id && ad.impression_token) {
        confirmImpression(ad.ad_id, ad.impression_token)
      }
    },
  }

  return hooks
}

export default LatentProtocolPlugin
