# WhatsApp Campaign Manager — User Guide

A self-hosted platform for sending WhatsApp campaigns and running a shared team
inbox, built on the Meta WhatsApp Business Cloud API.

This guide is written for the people who actually use the product: **agents**,
**managers**, and **administrators**. It explains how to sign in, what each
screen does, and how to complete everyday tasks.

---

## 1. Signing in

Open the app URL your administrator gave you (for example `https://whatsapp.example.com`)
and enter the email and password you were issued.

- After your first login, change your password from the **Change password**
  entry in the user menu (top-right corner).
- Sessions stay active for a while and renew automatically; you can sign out at
  any time from the same menu.
- If you are locked out, ask an administrator to reset your password.

The interface is available in **Arabic** (right-to-left, the default) and
**English**. Switch the language from the menu in the top bar — your choice is
remembered on your device.

---

## 2. Roles and permissions

Every account has one of three roles. What you see in the side menu depends on
your role:

| Capability | AGENT | MANAGER | ADMIN |
|---|---|---|---|
| Dashboard, Contacts, Lists, Tags, Campaigns, Inbox | ✅ | ✅ | ✅ |
| Reports | | ✅ | ✅ |
| Contact imports | | ✅ | ✅ |
| Manage users | | ✅ | ✅ |
| WhatsApp accounts & templates, Integration logs, Audit log, Operations, Settings | | | ✅ |

Guards in the product also enforce **who** can act on what:

- An **AGENT** can view and edit only their own profile and quick replies, and
  only handle inbox work.
- A **MANAGER** can manage other agents (but not other managers or admins).
- An **ADMIN** can do everything, including suspending accounts and changing roles.

---

## 3. The side menu

| Section | Purpose |
|---|---|
| **Dashboard** | At-a-glance KPIs: contacts, conversations, messages, delivery status. |
| **Contacts** | Your audience: search, filter, view, edit, archive, export. |
| **Lists** | Reusable contact lists (segments) that campaigns are sent to. |
| **Tags** | Labels you can attach to contacts for filtering. |
| **Campaigns** | Create, schedule, and track WhatsApp template campaigns. |
| **Inbox** | The shared team inbox for customer conversations. |
| **Reports** | Campaign performance and failure analysis *(Manager/Admin)*. |
| **Imports** | Upload a CSV/XLSX file to bulk-create contacts *(Manager/Admin)*. |
| **Users** | Create and manage accounts *(Manager/Admin)*. |
| **WhatsApp** | Connect WhatsApp Business accounts and manage message templates *(Admin)*. |
| **Integration logs** | Incoming webhook activity *(Admin)*. |
| **Audit log** | A history of who did what in the system *(Admin)*. |
| **Operations** | Queue/cache health and maintenance *(Admin)*. |
| **Settings** | Platform-level settings *(Admin)*. |

---

## 4. Everyday workflows

### 4.1 Import contacts (Manager/Admin)

1. Open **Imports** → **Upload** and choose a CSV or Excel file.
2. Review the preview. Map your columns to contact fields (at least **phone**
   is required) and pick options like *skip duplicates*.
3. Review the validation summary — rows with errors are listed so you can fix
   the file and re-upload.
4. Start the import. It runs in the background; completed rows are marked
   *created*, *updated*, or *skipped*.
5. You can download the rejected rows as a CSV to fix and re-import.

### 4.2 Send a campaign (Manager/Admin)

1. Open **Campaigns** → **New campaign**.
2. Choose a **message template** (WhatsApp templates are managed under
   **WhatsApp → Templates**; a template must be *approved* by Meta before you
   can send it).
3. Fill in the template variables (e.g. `{{1}}` → the contact's name).
4. Pick the audience: an existing **list**, or filter contacts directly.
5. Choose **Send now** or schedule a date/time.
6. Review and launch. The system sends to each recipient, handles opt-outs and
   retries automatically, and records delivery status per recipient.
7. Track progress on the campaign detail screen and in **Reports**.

> **Good to know:** sending a message costs Meta per message and is subject to
> WhatsApp's business messaging policies. Only send to contacts who have opted
> in.

### 4.3 Work the team inbox

1. Open **Inbox**. Conversations appear in a list on the left; open one to read
   the thread.
2. **Reply** to the customer with a free-form message. If the customer has not
   messaged recently, a **service-window notice** may appear.
3. Use **quick replies** to insert frequently used answers (your own or
   team-shared ones).
4. Add **internal notes** to collaborate with teammates — these are never sent
   to the customer.
5. **Assign** the conversation to yourself or a teammate so everyone knows who
   owns it.
6. New messages, delivery status, notes, and assignments update **live** on
   the screen — no manual refresh needed.

### 4.4 Respect opt-outs

When a customer replies with a stop word (e.g. **stop**), the platform
automatically:

- removes them from the campaign recipient pool, and
- records them as opted out so future campaigns skip them.

Please do not manually message opted-out customers.

---

## 5. Admin tasks

Only for **Administrators**:

- **WhatsApp** — register WhatsApp Business accounts and phone numbers, review
  connected accounts, and manage **message templates** (create drafts, submit
  for approval, sync template status from Meta).
- **Users** — create accounts, assign roles, suspend/activate, archive,
  reset passwords, and revoke sessions.
- **Audit log** — a read-only history of security-relevant actions.
- **Integration logs** — inspect raw webhook deliveries for troubleshooting.
- **Operations** — queue sizes and cache status.
- **Settings** — platform defaults (e.g. upload size limits).

---

## 6. Frequently asked questions

**I can't sign in.**
Check your email/password with an administrator. Accounts that are suspended or
archived cannot sign in.

**I don't see some menu items.**
Your role limits what you can access. Ask your administrator for the right role.

**My campaign shows failed recipients.**
Delivery to some numbers can fail (invalid number, user blocked you, user
outside the 24-hour window without an approved template, etc.). Open the
campaign's recipient list to see the reason for each failure.

**A template isn't available in a campaign.**
Only templates **approved by Meta** can be sent. Drafts and rejected templates
cannot be used.

**Replies to my campaign aren't in the inbox.**
Incoming messages from customers are stored in the **Inbox**. Make sure your
WhatsApp account and webhook are configured correctly (Admin) and that the
customer's message arrived in the 24-hour customer-service window.

**Is my data safe?**
All API access is authenticated and role-checked, Meta credentials are
encrypted at rest, and every sensitive action is recorded in the audit log.

---

## 7. Getting help

- Report bugs or feature requests to your system administrator.
- Deployment, backups, and operational troubleshooting are covered in
  [`DEPLOYMENT.md`](../DEPLOYMENT.md).
