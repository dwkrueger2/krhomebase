/** Bidirectional nickname roots used to compare common name variants. */
export const NICKNAME_ROOTS: Record<string, string> = {
  bill: 'william',
  billy: 'william',
  will: 'william',
  willie: 'william',
  kathy: 'katherine',
  kathie: 'katherine',
  katherine: 'katherine',
  kathryn: 'katherine',
  kate: 'katherine',
  cathy: 'catherine',
  catherine: 'catherine',
  bob: 'robert',
  bobby: 'robert',
  rob: 'robert',
  robert: 'robert',
  jim: 'james',
  jimmy: 'james',
  james: 'james',
  jack: 'john',
  johnny: 'john',
  john: 'john',
  liz: 'elizabeth',
  beth: 'elizabeth',
  betty: 'elizabeth',
  elizabeth: 'elizabeth',
  sue: 'susan',
  susie: 'susan',
  susan: 'susan',
  mike: 'michael',
  michael: 'michael',
  dan: 'daniel',
  danny: 'daniel',
  daniel: 'daniel',
}

/** Returns a canonical nickname root, or the normalized input itself. */
export function nicknameRoot(value: string): string {
  return NICKNAME_ROOTS[value] || value
}
