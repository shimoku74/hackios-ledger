// Everything the site trusts by default lives in this one file.
// Numbers are never written here: they are read from the chain at runtime.
window.LEDGER = {
  token: '0x5be8dca38cff485d3a80809195284c7f74c77777',
  pool: '0xb405110399037df298051f99a53b9751aed9030a',
  quote: '0x3f53de71c126bdabae20f9cd64848d317f6c3238',
  vault: '0x4b1a623abb557c6df113938f98692d3edc2e1d4f',
  taxProcessor: '0x244122c9af9d0d2cdb836a0f382b6f6aaa0436ff',
  dividend: '0x3dfa61d53a5a7d767523f3dca2aed96ffad18534',
  flapFee: '0x8a08d98cbb218fceb318ecf3abc1ba43d8a7ab0e',
  implementation: '0x024f18294970b5c76c0691b87f138a0317156422',
  dead: '0x000000000000000000000000000000000000dead',

  rpcs: [
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-dataseed1.ninicoin.io',
  ],

  links: {
    site: 'https://hackios-web.vercel.app/en',
    github: 'https://github.com/oosexgang',
    kernel: 'https://github.com/oosexgang/hakios-xnu-kernel',
    telegram: 'https://t.me/oosexgangdevs',
    x: 'https://x.com/hacki_os',
    flap: 'https://flap.sh/bnb/0x5be8dca38cff485d3a80809195284c7f74c77777',
    dex: 'https://dexscreener.com/bsc/0xb405110399037df298051f99a53b9751aed9030a',
    sourcify: 'https://repo.sourcify.dev/56/0x024f18294970b5c76c0691b87f138a0317156422',
  },

  // Telegram blocks browser reads, so this one number is updated by hand.
  telegramSubscribers: 20200,

  repos: ['hakios-xnu-kernel', 'hakios-sm7325', 'hakios-mt6768', 'hakios-uefi', 'hackios-web'],

  // Tokens that use the project's name but are not the one on the official site.
  // The list on the page is also searched live; these stay flagged even if a search misses them.
  knownLookalikes: ['0x82b81253b611fb7ace74b4bf95f5e6f6e06b7777'],

  // Public promises about the token. Empty on purpose: nothing has been signed.
  // Format: { date: '2026-11-05', text: { en, ru, ua, zh }, proof: 'https://t.me/...', status: 'open' | 'done' | 'missed' }
  commitments: [],

  // What the tax money pays for, in the team's own words. Stays null until the team states it.
  // Format: { en, ru, ua, zh }
  taxUse: null,

  // Releases already announced in the public channel.
  shipped: [
    { date: '2026-11-05', title: 'HakiOS 2.3.4', url: 'https://hackios-web.vercel.app/en/changelog',
      text: { en: 'Per-port Metal settings, graphics fixes, finger lift in about 5 ms instead of up to 169 ms.',
              ru: 'Настройки Metal для каждого порта, правки графики, отпускание пальца за 5 мс вместо 169 мс.',
              ua: 'Налаштування Metal для кожного порту, правки графіки, відпускання пальця за 5 мс замість 169 мс.',
              zh: '每个移植版独立的 Metal 设置、图形修复,抬指检测从最高 169 毫秒降到约 5 毫秒。' } },
    { date: '2026-10-30', title: 'Dual boot', url: 'https://hackios-web.vercel.app/en/changelog',
      text: { en: 'Dual boot pushed, plus a redesign and new step-by-step guides.',
              ru: 'Dual boot в репозитории, новый дизайн и пошаговые гайды.',
              ua: 'Dual boot у репозиторії, новий дизайн і покрокові гайди.',
              zh: '双系统启动已推送,并带来新设计和分步指南。' } },
  ],
};
