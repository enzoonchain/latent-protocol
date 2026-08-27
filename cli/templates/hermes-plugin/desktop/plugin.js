// Latent Protocol -- Hermes Desktop plugin (installed by `npx latent init`).
// Lives beside plugin.yaml/__init__.py in the same ~/.hermes/plugins/agent-ads/
// folder -- the desktop app's SDK loader scans this location automatically
// ("one package, both SDKs"). The SERVER/WALLET placeholders a few lines
// down are replaced at install time with JSON-encoded string literals by
// cli/src/surfaces/hermes.ts, never by naive interpolation.
//
// Docs: https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk
//
// This file is loaded as native UTF-8 ESM by Electron/V8 (not run through the
// Python/regex patch pipeline latent_protocol/adapters/hermes_webui.py uses
// for the community hermes-webui project), so literal UTF-8 glyphs are safe.
import {
  host,
  haptic,
  useValue,
  atom,
  STATUSBAR_AREAS,
  PALETTE_AREA,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

var SERVER = __SERVER__
var WALLET = __WALLET__

var MONEY_BAG = '💰'

var $balance = atom(null)
var $loading = atom(false)
var osDoor = null

function fetchBalance() {
  if (!WALLET) return Promise.resolve(null)
  $loading.set(true)
  return fetch(SERVER + '/earnings/' + WALLET)
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (data) {
      var bal = data && typeof data.balance === 'number' ? data.balance : null
      $balance.set(bal)
      return bal
    })
    .catch(function () { return null })
    .finally(function () { $loading.set(false) })
}

function requestPayout() {
  return fetch(SERVER + '/payout/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: WALLET })
  })
    .then(function (r) { return r.ok ? r.json() : null })
    .catch(function () { return null })
}

function formatBalance(balance) {
  return typeof balance === 'number' ? '$' + balance.toFixed(4) : '$--'
}

function AdsPanel() {
  var balance = useValue($balance)
  var loading = useValue($loading)
  var state = useState('')
  var payoutMessage = state[0]
  var setPayoutMessage = state[1]

  return jsxs('div', {
    className: 'flex w-56 flex-col gap-2 p-1 text-sm',
    children: [
      jsx('div', {
        className: 'text-xs font-medium text-(--ui-text-secondary)',
        children: MONEY_BAG + ' Sponsored ads'
      }),
      jsxs('div', {
        className: 'flex items-center justify-between',
        children: [
          jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'Balance' }),
          jsx('span', { className: 'font-medium', children: formatBalance(balance) })
        ]
      }),
      jsxs('div', {
        className: 'flex items-center justify-between text-xs',
        children: [
          jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'Wallet' }),
          jsx('span', {
            className: 'font-mono',
            children: WALLET ? WALLET.slice(0, 6) + '...' + WALLET.slice(-4) : 'not set'
          })
        ]
      }),
      jsx(Button, {
        size: 'sm',
        variant: 'secondary',
        disabled: !WALLET,
        onClick: function () {
          haptic('tap')
          if (WALLET && osDoor) void osDoor.writeClipboard(WALLET)
        },
        children: 'Copy wallet address'
      }),
      jsx(Button, {
        size: 'sm',
        disabled: !WALLET || loading,
        onClick: function () {
          haptic('tap')
          setPayoutMessage('Requesting...')
          requestPayout().then(function (res) {
            if (res && res.tx_hash) {
              setPayoutMessage('Sent: ' + String(res.tx_hash).slice(0, 10) + '...')
              host.notify({ kind: 'success', message: 'Payout requested' })
            } else {
              setPayoutMessage('Payout failed or below minimum.')
            }
            void fetchBalance()
          })
        },
        children: 'Request payout'
      }),
      payoutMessage
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: payoutMessage })
        : null,
      jsx('div', {
        className: 'text-xs text-(--ui-text-quaternary)',
        children: 'Type /ads settings in chat to change wallet, frequency, or turn ads off.'
      })
    ]
  })
}

function StatusChip() {
  var balance = useValue($balance)

  useEffect(function () {
    void fetchBalance()
    var id = setInterval(function () { void fetchBalance() }, 60000)
    return function () { clearInterval(id) }
  }, [])

  return jsxs(Popover, {
    children: [
      jsx(PopoverTrigger, {
        className: 'flex items-center gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
        onClick: function () { haptic('tap') },
        children: MONEY_BAG + ' ' + formatBalance(balance)
      }),
      jsx(PopoverContent, {
        align: 'end',
        className: 'w-64 p-3',
        children: jsx(AdsPanel, {})
      })
    ]
  })
}

export default {
  id: 'agent-ads',
  name: 'Latent Protocol Ads',
  register: function (ctx) {
    osDoor = ctx.os
    // Nothing to contribute without a configured wallet -- mirrors the
    // same early-out the Hermes WebUI patch uses.
    if (!WALLET) return

    ctx.register({
      id: 'balance-chip',
      area: STATUSBAR_AREAS.right,
      order: 140,
      render: function () { return jsx(StatusChip, {}) }
    })

    ctx.register({
      id: 'check-balance',
      area: PALETTE_AREA,
      data: {
        id: 'agent-ads.check-balance',
        label: 'Ads: Check Balance',
        keywords: ['ads', 'earnings', 'balance', 'sponsored', 'latent'],
        run: function () {
          fetchBalance().then(function (bal) {
            host.notify({
              kind: 'info',
              message: typeof bal === 'number' ? 'Balance: ' + formatBalance(bal) : 'Could not fetch balance.'
            })
          })
        }
      }
    })
  }
}
