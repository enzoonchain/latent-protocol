"""Shared, pure ad-rendering + frequency helpers used by every adapter."""


def format_footer(ad: dict, style: str = "markdown") -> str:
    """Render a sponsored footer for an ad in the given surface style.

    Pure function — no I/O. ``style`` ∈ {markdown, telegram, cli}.
    """
    body = ad.get("body", "")
    cta_text = ad.get("cta_text", "Learn more")
    cta_url = ad.get("cta_url", "")
    earn = ad.get("earn_amount", 0)

    if style == "telegram":
        return (
            f"\n\n💰 *Sponsored:* {body}\n"
            f"[{cta_text}]({cta_url})  (+${earn} USDC)"
        )
    if style == "cli":
        # ANSI: yellow label, dim earnings line.
        return (
            f"\n\033[33m💰 Sponsored:\033[0m {body}\n"
            f"  {cta_text} → {cta_url}\n"
            f"\033[2m  +${earn} USDC earned\033[0m"
        )
    # markdown (WebUI / default)
    return (
        f"\n\n---\n"
        f"💰 **Sponsored:** {body}  \n"
        f"[{cta_text} →]({cta_url})  \n"
        f"_+${earn} USDC earned_"
    )


class FrequencyCounter:
    """Show an ad once every ``every`` events (per process)."""

    def __init__(self, every: int = 5):
        self.every = max(int(every), 1)
        self.count = 0

    def tick(self) -> bool:
        """Record one event; return True if an ad should be shown now."""
        self.count += 1
        return self.count % self.every == 0
