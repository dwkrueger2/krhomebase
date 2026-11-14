// file: packages/tool-sdk/src/toolIcon.testdata.ts
// Sample icons for toolIcon.test.ts and contractSync.test.ts. Test data only: the kit build leaves it out (tsconfig.build.json).

/** Sample icons used here and by contractSync.test.ts (the KR Homebase copy must agree on every one). */
export const ICON_SAMPLES: string[] = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h10"/><circle cx="17" cy="16" r="3"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"/></g></svg>',
  '<svg viewBox="0 0 24 24"><polygon points="12 2 22 22 2 22" fill="currentColor" fill-rule="evenodd"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M0 0" fill="red"/></svg>',
  '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>',
  '<svg viewBox="0 0 24 24" onload="alert(1)"><path d="M0 0"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M0 0" style="fill:red"/></svg>',
  '<svg viewBox="0 0 24 24"><image href="https://example.com/x.png"/></svg>',
  '<svg viewBox="0 0 16 16"><path d="M0 0"/></svg>',
  '<svg viewBox="0 0 24 24"><text>Hi</text></svg>',
  '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg><path d="M1 1"/>',
  '<!-- x --><svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M0 0&#x41;"/></svg>',
  "<svg viewBox='0 0 24 24'><path d='M0 0'/></svg>",
  '<svg viewBox="0 0 24 24"><g><path d="M0 0"/></svg>',
  '<svg viewBox="0 0 24 24"></svg>',
  '<svg viewBox="0 0 24 24"><path d="url(#x)"/></svg>',
  '',
]
