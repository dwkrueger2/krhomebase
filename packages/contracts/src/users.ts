// file: packages/contracts/src/users.ts
/**
 * Users and Invites (Settings and Dashboard plan, stage 4d). Who may sign in to KR Homebase, their account status,
 * their role sets, and the invitations sent to them. These are sign-in accounts (`user`), not employees; an account
 * may have an `employee` row.
 *
 *   GET    /v1/users                               every user, every invitation not accepted, and the role sets (super admin)
 *   POST   /v1/users                               create a user, by invitation (emailed) or active at once (super admin)
 *   PUT    /v1/users/{userId}                      change a user's status, staff code and role sets (super admin)
 *   POST   /v1/users/{userId}/employee             enroll a user as an employee (super admin)
 *   POST   /v1/user-invites/{inviteId}/resend      send a new invitation, replacing this one (super admin)
 *   POST   /v1/user-invites/{inviteId}/cancel      cancel a pending invitation (super admin)
 *   DELETE /v1/user-invites/{inviteId}             delete an invitation that is no longer pending (super admin)
 *
 * Stage 4d-2: the same PUT also saves the professional title, the attorney flag and the bar admissions
 * (`employee_certification`), and the list carries the person's names, phone and Google sign-in identities.
 *
 * Old routes: `GET`/`POST`/`PATCH /krhomebase/api/kr-api-v1/users`, `GET`/`PATCH`/`DELETE /krhomebase/api/kr-api-v1/user-invites`
 * and `PUT /krhomebase/api/admin/users/{userId}/role-sets`.
 */

import { z } from 'zod'
import { RoleSet } from './roleSets.ts'

export const ACCOUNT_STATUSES = ['active', 'pending', 'deactivated'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const WORKER_CLASSIFICATIONS = ['employee', 'vendor', 'unspecified'] as const
export type WorkerClassification = (typeof WORKER_CLASSIFICATIONS)[number]

/** How an invitation reads on screen: `revoked` shows as cancelled, and a pending one past its end as expired. */
export const INVITE_DISPLAY_STATUSES = ['pending', 'accepted', 'cancelled', 'expired'] as const

export const UserInvite = z.object({
  id: z.string().describe('Invitation id (`uinv_<uuid>`).'),
  email: z.string().describe('Address the invitation was sent to.'),
  roleSetLabel: z.string().nullable().describe('The role set the person will get, when known.'),
  workerClassification: z.enum(WORKER_CLASSIFICATIONS).describe('Employee, vendor (1099) or neither.'),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).describe('As stored.'),
  displayStatus: z.enum(INVITE_DISPLAY_STATUSES).describe('As shown: revoked reads cancelled, and a pending one past its end reads expired.'),
  invitedUserId: z.string().nullable().describe('The user created with the invitation, when one was.'),
  expiresAt: z.string().describe('When the link stops working (ISO time).'),
  sentAt: z.string().nullable().describe('When the email was sent; empty when it was not.'),
  createdAt: z.string().describe('When the invitation was made.'),
})
export type UserInvite = z.infer<typeof UserInvite>

export const BAR_ADMISSION_STATUSES = ['active', 'inactive', 'pending', 'expired', 'revoked'] as const

const DateOrEmpty = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD.')

/** One bar admission (an `employee_certification` row of type law license). */
export const BarAdmission = z.object({
  id: z.string().max(100).nullable().describe('Stored id (`cert_<uuid>`); empty for a new admission.'),
  jurisdiction: z.string().trim().min(1).max(60).describe('Where the person is admitted, such as Texas.'),
  registrationNumber: z.string().trim().max(60).describe('Bar or admission number; may be blank.'),
  admittedOn: DateOrEmpty.describe('Admission date (YYYY-MM-DD) or blank.'),
  expiresOn: DateOrEmpty.describe('Expiration date (YYYY-MM-DD) or blank.'),
  status: z.enum(BAR_ADMISSION_STATUSES).describe('Active, inactive, pending, expired or revoked.'),
})
export type BarAdmission = z.infer<typeof BarAdmission>

/** A sign-in identity linked to the account (Google today). */
export const UserSsoIdentity = z.object({
  provider: z.string().describe('google, microsoft, apple, saml or sso.'),
  email: z.string().describe('The email the provider reports.'),
  lastLoginAt: z.string().nullable().describe('Last sign-in through this identity.'),
})
export type UserSsoIdentity = z.infer<typeof UserSsoIdentity>

export const UserEmployee = z.object({
  id: z.string().describe('Employee id.'),
  employeeNumber: z.string().nullable().describe('Employee number.'),
  staffCode: z.string().nullable().describe('Staff code (up to 4 characters); required while the person holds the Staff role set.'),
  employmentStatus: z.string().describe('Employment status as stored.'),
  isVendor: z.boolean().describe('Paid as a 1099 vendor.'),
  jobTitle: z.string().nullable().describe('Professional title.'),
  barAdmissions: z.array(BarAdmission).describe('Bar admissions on file (law licenses).'),
})
export type UserEmployee = z.infer<typeof UserEmployee>

export const UserAccount = z.object({
  id: z.string().describe('User id.'),
  email: z.string().describe('Sign-in email.'),
  name: z.string().describe('Display name: "First Last (Preferred)", else the email.'),
  individualId: z.string().nullable().describe('The person record, when linked.'),
  firstName: z.string().nullable().describe('First name of the linked person.'),
  lastName: z.string().nullable().describe('Last name of the linked person.'),
  preferredName: z.string().nullable().describe('Preferred name of the linked person.'),
  phone: z.string().nullable().describe("The person's primary phone, when on file."),
  isAttorney: z.boolean().describe('The linked person is an attorney (shows Bar Admissions).'),
  ssoIdentities: z.array(UserSsoIdentity).describe('Sign-in identities linked to the account.'),
  icid: z.string().nullable().describe("The person's ICID code, when set."),
  role: z.string().describe('The single stored role (`user.role`); the role sets below decide access.'),
  accountStatus: z.enum(ACCOUNT_STATUSES).describe('Active, pending (invited, not signed in yet) or deactivated.'),
  lastLogin: z.string().nullable().describe('Last sign-in time.'),
  roleSetIds: z.array(z.string()).describe('Role sets the person holds now (active assignments).'),
  primaryRoleSetId: z.string().nullable().describe('The primary role set (also `user.role_set_id`).'),
  employee: UserEmployee.nullable().describe('The employee record, when the person is enrolled.'),
  inviteId: z.string().nullable().describe('The newest invitation for this email that was not accepted, if any.'),
})
export type UserAccount = z.infer<typeof UserAccount>

export const UsersData = z.object({
  users: z.array(UserAccount).describe('Every user, by name.'),
  invites: z.array(UserInvite).describe('Every invitation not accepted, newest first.'),
  roleSets: z.array(RoleSet).describe('The active role sets, for the role choices and the effective permissions.'),
  viewerUserId: z.string().describe('The signed-in super admin (their own status and Super Admin role set cannot be changed here).'),
})
export type UsersData = z.infer<typeof UsersData>

export const CreateUserBody = z.object({
  firstName: z.string().trim().min(1).max(100).describe('First name.'),
  lastName: z.string().trim().min(1).max(100).describe('Last name.'),
  email: z.string().trim().toLowerCase().email().max(254).describe('Sign-in email (a Google account).'),
  phone: z.string().trim().max(40).optional().describe('Phone, saved on the person record.'),
  roleSetId: z.string().trim().min(1).max(100).nullable().describe('The role set to give; empty means "Do Not Assign a Role" (invitations only).'),
  workerClassification: z.enum(WORKER_CLASSIFICATIONS).default('employee').describe('Employee and vendor get an employee record; unspecified does not.'),
  activation: z.enum(['invite', 'activate']).describe('Send an invitation email, or make the account active at once.'),
  inviteExpirationDays: z.number().int().min(1).max(30).default(7).describe('Days the invitation link works (1 to 30).'),
})
export type CreateUserBody = z.infer<typeof CreateUserBody>

export const InvitationResult = z.object({
  inviteId: z.string().describe('The invitation made.'),
  expiresAt: z.string().describe('When its link stops working.'),
  emailSent: z.boolean().describe('True when the email went out.'),
  reason: z.string().nullable().describe('Why the email was not sent.'),
  inviteUrl: z.string().nullable().describe('The link, returned only when the email was not sent, so it can be passed on by hand.'),
})
export type InvitationResult = z.infer<typeof InvitationResult>

export const UserSavedData = z.object({
  userId: z.string().nullable().describe('The user created or changed (empty for an invitation action).'),
  invitation: InvitationResult.nullable().describe('The invitation made, when one was.'),
  users: UsersData.describe('Every user, invitation and role set after the change.'),
})
export type UserSavedData = z.infer<typeof UserSavedData>

export const UpdateUserBody = z.object({
  accountStatus: z.enum(ACCOUNT_STATUSES).describe('Account status. Your own and a Super Admin\'s cannot leave active here.'),
  staffCode: z.string().trim().toUpperCase().max(4).nullable().describe('Staff code for the employee record (up to 4 characters); required with the Staff role set.'),
  roleSetIds: z.array(z.string().trim().min(1).max(100)).max(50).describe('Every role set the person should hold; the rest are ended.'),
  primaryRoleSetId: z.string().trim().min(1).max(100).nullable().describe('The primary role set; must be in the list (empty when the list is).'),
  jobTitle: z.string().trim().max(120).nullable().optional().describe('Professional title on the employee record; left out keeps it.'),
  isAttorney: z.boolean().optional().describe('Attorney flag on the person record; turning it off clears the bar admissions. Left out keeps it.'),
  barAdmissions: z.array(BarAdmission).max(20).optional().describe('Every bar admission the person should have; the rest are cleared. Left out keeps them.'),
})
export type UpdateUserBody = z.infer<typeof UpdateUserBody>

export const UserParams = z.object({ userId: z.string().min(1).max(200).describe('User id.') })
export type UserParams = z.infer<typeof UserParams>

export const InviteParams = z.object({ inviteId: z.string().min(1).max(200).describe('Invitation id.') })
export type InviteParams = z.infer<typeof InviteParams>

export const ResendInviteBody = z.object({
  expirationDays: z.number().int().min(1).max(30).default(7).describe('Days the new link works (1 to 30).'),
})
export type ResendInviteBody = z.infer<typeof ResendInviteBody>
