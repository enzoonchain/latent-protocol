export function Footer() {
  return (
    <footer className="section py-16 border-t border-ivory-faint">
      <div className="wrap">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="font-script text-2xl text-ivory mb-3">Latent</div>
            <p className="text-ivory-dim text-sm">
              An open-source ad marketplace for AI agents. Get paid to wait.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-ivory mb-4 text-sm">Product</h4>
            <ul className="space-y-2">
              {[
                ["#how", "How it works"],
                ["#surfaces", "Surfaces"],
                ["#economics", "Economics"],
                ["#protocol", "Protocol"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-ivory-dim text-sm no-underline hover:text-bronze transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-ivory mb-4 text-sm">Build</h4>
            <ul className="space-y-2">
              {[
                ["https://github.com/enzoonchain/latent-protocol", "GitHub"],
                ["#opensource", "Plugin"],
                ["#protocol", "x402"],
                ["#install", "Spec"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-ivory-dim text-sm no-underline hover:text-bronze transition-colors"
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-ivory mb-4 text-sm">Network</h4>
            <ul className="space-y-2">
              {[
                ["https://base.org", "Base L2"],
                ["https://x402.org", "x402"],
                ["#economics", "USDC"],
                ["#install", "Coinbase CDP"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-ivory-dim text-sm no-underline hover:text-bronze transition-colors"
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-ivory-faint text-ivory-dim text-sm">
          <span>© 2026 Latent Protocol · Apache-2.0</span>
          <span className="mt-2 md:mt-0 italic">
            The value is there, latent, waiting to be extracted.
          </span>
        </div>
      </div>
    </footer>
  );
}
