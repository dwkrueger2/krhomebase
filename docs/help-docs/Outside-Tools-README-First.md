# Outside Tools: README First

<small>Version 1.1.5</small><br>
<small>Updated Nov 23, 2026 2:04pm</small>

**For:** super admins, before registering an outside tool or changing one (Settings → Outside Tools).

An outside tool is a program KR Homebase did not build. Registering one lets it reach firm data through the KR Homebase API. Once data leaves KR Homebase, KR Homebase cannot see or control what the tool does with it. **Every permission you tick is a decision to hand that data to someone else.** This page tells you what each choice hands over.

## 1. The one rule

Register only tools you trust, from developers you know, and give each tool the fewest permissions that let it do its job. When in doubt, leave a box unticked: the developer can ask again and say why.

## 2. Two ways a tool connects

| | In the frame | Server access |
|---|---|---|
| How | The tool's page opens inside KR Homebase for a signed-in person. | The tool's own server calls KR Homebase with a client id and secret, any time, with nobody signed in. |
| Whose data | **At most what that person may see.** Their role and permissions still apply. | **The whole firm's records in each permitted area.** There is no person, so no person's limits apply. |
| Writes (create, change, delete) | Allowed, as that person. | **Refused.** Every write route is frame-only. |
| Who may use it | Only the **Permitted users** and **Roles** you choose. | Whoever holds the client secret. |

**Server access is the larger decision.** Tick it only when the tool truly needs to work with nobody present (for example, an overnight sync), and then also fill in **Server addresses** (section 4).

## 3. What each permission hands over

"Server" below means what a tool with **Server access** receives with nobody present. In the frame, each permission is further limited to what the signed-in person may see.

| Permission | What it gives | Warning |
|---|---|---|
| `contacts:read` | Every contact and their contact details. One contact at a time **with the full SSN and date of birth**. | **Highest risk.** With Server access, the tool can read **every client's full SSN and date of birth**. |
| `contacts:write` | Create and edit contacts; open, renumber or close client accounts. Frame only. | Changes client records as the signed-in person. |
| `leads:read` | Every lead, with each person's email and phone. | Prospective-client information. |
| `leads:write` | Create, change and convert leads (a conversion makes a client account). Frame only. | |
| `matters:read` | Client accounts and their matters. | |
| `matters:write` | Create, change and delete matters. Frame only. | Deleting needs a super admin as the signed-in person. |
| `tasks:read` | Every task, its assignees and its follow-up notes. | Notes can hold client details. |
| `tasks:write` | Create and change tasks and notes. Frame only. | |
| `workstream:read` | The WorkStream log of every client and lead: subjects, notes, next steps, recorded emails. With Server access, the **whole firm's feed**. | **Client communications.** Treat as confidential and possibly privileged. |
| `workstream:write` | Record, change, move and delete WorkStream entries, and **send email to clients from the firm's mailbox**. Frame only. | The tool can write to clients in the firm's name, as the signed-in person. |
| `timekeeping:read` | Time cards, punches, hours and team status. With Server access, **every employee's time card**. | Employee information. |
| `timekeeping:write` | Clock in and out, change punches, approve and reopen time cards. Frame only. | |
| `billing:read` | A client's billing record (time, fees, invoices, payments, trust, totals), **the stored PDFs** of sent invoices, statements and receipts, pay links, and the recipients' emails. | **Financial records.** Read only, but complete. |
| `homebase-feedback:read` | Feedback requests about KR Homebase, with their screenshots and developer notes. | Screenshots can show client data. |
| `homebase-feedback:write` | Change a request's status or priority and add notes. **Also allowed with Server access.** | |
| `tool-registration:read` | Server only: the permitted users' emails of **this tool's own** registration. | Lets the tool's server check who may sign in to it. |
| `billing:write`, `documents:read`, `documents:write`, `reports:read` | Marked **TBD**: no route uses them yet, so they cannot be ticked. | |

**A tool keeps its permissions as KR Homebase grows.** When a new release opens another route under a permission a tool already holds, the tool can use that route at once, without asking you again. After a release that opens routes to tools, review each tool's permissions.

## 4. The other settings

- **Permitted users.** The exact login emails that may open the tool. **An empty list lets nobody in.** Add only the people who need it.
- **Roles.** Which roles see the tool in their menu. A person must match both the roles and the permitted users.
- **Developers only.** Shows the tool only to Internal Developers, whatever their role.
- **Local development only.** The tool works only in a KR Homebase run on a developer's computer (`pnpm dev`). The deployed app refuses it.
- **A `localhost` tool address in the deployed app.** If you register a tool whose address is `http://localhost:...` in the deployed KR Homebase, any program a permitted person runs on that port of their own computer receives the tool's permissions **against live client data**. Keep such a registration to the developer's own email and the fewest permissions, and turn it off when testing ends.
- **Server access.** See section 2. Leave it off unless the tool needs it.
- **Server addresses.** The IP addresses the tool's server may call from. **Fill this in whenever Server access is on.** Left empty, a stolen client secret works from anywhere in the world until you replace it.
- **The client secret** is shown once, when it is made. Give it to the developer through a safe channel (not plain email or chat), and never keep a copy yourself.
- **New secret.** "Current secret keeps working for" sets how long the old secret still works. Choose **0 hours (ends now, with its tokens)** when a secret may have leaked.
- **Status.** **disabled** hides the tool and refuses every call at once, frame and server, including tokens already handed out. It is the off switch.
- **Check health.** Confirms the tool answers at its address. It says nothing about whether the tool is safe.

## 5. Before you approve: checklist

1. I know who built this tool, and I trust them with the data below.
2. Each ticked permission is needed; I have read its row in section 3.
3. Server access is off, or the tool needs it, and **Server addresses** is filled in.
4. If `contacts:read` and Server access are both ticked, I accept that the tool can read every client's full SSN and date of birth.
5. **Permitted users** lists only the people who need the tool.
6. The tool address is the developer's own domain, not a `localhost` address (unless section 4's limits are in place).
7. I will hand the client secret over safely and keep no copy.

## 6. After approval: Activity

Each tool's **Activity** list records every call KR Homebase **allowed**: when, frame or server, the person (frame), the method, the address and the answer's status. It does **not** record what data was in the answer, and it does not yet record **refused** calls (for example a wrong address or a missing permission), which are often the first sign of misuse. Look at a tool's Activity from time to time, and at once if anything seems wrong.

## 7. If you suspect a leak

1. Set the tool's **Status** to **disabled**. Every call stops at once.
2. Make a new secret with **0 hours** overlap, if the tool has Server access.
3. Read the tool's **Activity** for what was called, when and from which channel.
4. Follow the firm's own steps for a possible data incident.

## 8. Known gaps (being worked on)

- The registration form shows permission names only. Descriptions and warnings like those in section 3 are planned for the form.
- With Server access, `contacts:read` returns the full SSN and date of birth (section 3). A change is planned.
- **Server addresses** is optional; making it required with Server access is planned.
- Refused calls are not yet recorded in **Activity**.
