/**
 * Who may call a route.
 *  - 'public'    : no sign-in needed.
 *  - 'signed-in' : any signed-in staff user.
 *  - { roles }   : only the listed roles. Role names are ported from the old KrApiV1Role list
 *                  when the first protected feature (Clients) is built.
 */
export type Access = 'public' | 'signed-in' | { roles: readonly string[] }
