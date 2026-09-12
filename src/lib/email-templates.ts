import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/auth-secret";

export interface TemplateVariableInfo {
    key: string;
    description: string;
    sampleValue: string;
}

export interface EmailTemplateDefinition {
    id: string;
    name: string;
    description: string;
    category: "AUTH" | "REQUESTS" | "SUPPORT" | "KINDLE" | "TRIALS";
    defaultSubject: string;
    defaultBody: string;
    variables: TemplateVariableInfo[];
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
    {
        id: "user_approval",
        name: "User Account Approval Welcome",
        description: "Sent to users when an administrator approves their pending account request.",
        category: "AUTH",
        defaultSubject: "🎉 Your Portalarr Account has been Approved!",
        defaultBody: `<h2>Account Approved! 🎉</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! Your account request for Portalarr has been approved by the administrator.</p>
<p>You can now sign in and explore media libraries, stream audiobooks, read books in your browser, and submit media requests.</p>
<div style="text-align: center; margin: 28px 0;">
    <a href="{loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Log in to Portalarr</a>
</div>
<p style="font-size: 13px; color: #64748b;">If you need any assistance getting started, feel free to submit a support ticket inside the dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the approved user", sampleValue: "alex_reader" },
            { key: "{email}", description: "Email address of the approved user", sampleValue: "alex@example.com" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "admin_new_user",
        name: "New User Registration Alert (Admins)",
        description: "Sent to server administrators whenever a new user registers a pending account.",
        category: "AUTH",
        defaultSubject: "👤 New Account Request: {username}",
        defaultBody: `<h2>New Account Request</h2>
<p>A new user has registered a temporary account and is awaiting administrator approval to access Portalarr.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 130px; color: #64748b;">Username:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{username}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Email:</td>
            <td style="padding: 6px 0; color: #0f172a;">{email}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Status:</td>
            <td style="padding: 6px 0; color: #d97706; font-weight: bold;">{status}</td>
        </tr>
    </table>
</div>

<p>You can review, approve, or reject this user request directly in the dashboard.</p>
<div style="text-align: center; margin: 24px 0;">
    <a href="{accessUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Manage User Access</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of the applicant", sampleValue: "samuel_g" },
            { key: "{email}", description: "Email address of the applicant", sampleValue: "samuel@example.com" },
            { key: "{status}", description: "Account status (e.g. PENDING APPROVAL)", sampleValue: "PENDING APPROVAL" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" },
            { key: "{accessUrl}", description: "URL to the Access Control management page", sampleValue: "https://portal.example.com/settings/access" }
        ]
    },
    {
        id: "password_reset",
        name: "Password Reset & Temp Password",
        description: "Sent to users when they request a password reset or when an admin resets their password.",
        category: "AUTH",
        defaultSubject: "🔑 Temporary Password for Portalarr",
        defaultBody: `<h2>Temporary Password Request</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>We received a password reset request for your Portalarr account. Here is your temporary password:</p>

<div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 18px; border-radius: 8px; font-family: monospace; font-size: 22px; font-weight: bold; text-align: center; letter-spacing: 2px; color: #0f172a; margin: 24px 0;">
    {tempPassword}
</div>

<p>Please log in using this temporary password and immediately update your password to a permanent one in your profile settings.</p>
<div style="text-align: center; margin: 24px 0;">
    <a href="{loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Log in Now</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of recipient", sampleValue: "jordan_k" },
            { key: "{email}", description: "Email address of recipient", sampleValue: "jordan@example.com" },
            { key: "{tempPassword}", description: "The newly generated temporary password", sampleValue: "Portalarr-9k2x1!" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "media_ready",
        name: "Media Request Ready & Complete",
        description: "Sent to users when their requested book or audiobook is successfully downloaded and added to the library.",
        category: "REQUESTS",
        defaultSubject: "🎉 Your {mediaLabel} is Ready: {title}",
        defaultBody: `<h2>Your {mediaLabel} is Ready! 🎉</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! The {mediaLabel} you requested has been downloaded and is now ready in the Portalarr library.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 15px;"><strong>Title:</strong> {title}</p>
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569;"><strong>Author:</strong> {author}</p>
    <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Format:</strong> {mediaLabel}</p>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{actionUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
        {actionText}
    </a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "emily_w" },
            { key: "{title}", description: "Title of the requested book/audiobook", sampleValue: "Project Hail Mary" },
            { key: "{author}", description: "Author of the book/audiobook", sampleValue: "Andy Weir" },
            { key: "{mediaLabel}", description: "Format name ('Ebook' or 'Audiobook')", sampleValue: "Audiobook" },
            { key: "{mediaType}", description: "Media type identifier ('ebook' or 'audiobook')", sampleValue: "audiobook" },
            { key: "{actionUrl}", description: "Direct player or reader link", sampleValue: "https://portal.example.com/library?tab=audiobooks" },
            { key: "{actionText}", description: "Call-to-action button text", sampleValue: "🎧 Listen in Player" },
            { key: "{coverUrl}", description: "Cover image URL if available", sampleValue: "https://portal.example.com/api/cover?..." },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "media_request_admin",
        name: "New Media Request Alert (Admins)",
        description: "Sent to administrators whenever a user submits a new book or audiobook request.",
        category: "REQUESTS",
        defaultSubject: "{mediaLabel} Request: {title}",
        defaultBody: `<h2>New {mediaLabel} Request 📚</h2>
<p>A new media request has been submitted by <strong>{requestedBy}</strong>:</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
    <tr style="background-color: #f8fafc;">
        <td style="padding: 10px; font-weight: bold; width: 130px; border: 1px solid #e2e8f0;">Title:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>{title}</strong></td>
    </tr>
    <tr>
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Author:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">{author}</td>
    </tr>
    <tr style="background-color: #f8fafc;">
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Format:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">{mediaLabel}</td>
    </tr>
    <tr>
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Requested By:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><code>{requestedBy}</code></td>
    </tr>
</table>

<div style="margin-top: 24px; text-align: center;">
    <a href="{manageUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Manage Requests</a>
</div>`,
        variables: [
            { key: "{title}", description: "Title of requested media", sampleValue: "Dune" },
            { key: "{author}", description: "Author name", sampleValue: "Frank Herbert" },
            { key: "{mediaLabel}", description: "Format name ('Ebook' or 'Audiobook')", sampleValue: "Ebook" },
            { key: "{requestedBy}", description: "Username who made the request", sampleValue: "marcus_t" },
            { key: "{manageUrl}", description: "URL to the Library Requests management tab", sampleValue: "https://portal.example.com/library?tab=requests" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "ticket_update",
        name: "Support Ticket Update & Admin Reply",
        description: "Sent to the user when an admin updates their support ticket status or leaves a response.",
        category: "SUPPORT",
        defaultSubject: "Support Ticket Update: {status}",
        defaultBody: `<h2>Support Ticket Update</h2>
<p>Hi <strong>{name}</strong>,</p>
<p>Your support ticket status has been updated to: <strong>{status}</strong>.</p>

{adminCommentBlock}

<div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px; margin: 18px 0; border-radius: 4px;">
    <h4 style="margin: 0 0 6px 0; color: #475569;">Original Issue:</h4>
    <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #334155;">{issue}</p>
</div>

<p style="font-size: 13px; color: #64748b;">Thanks for using Portalarr Support!</p>`,
        variables: [
            { key: "{name}", description: "Name or username of user who opened the ticket", sampleValue: "David" },
            { key: "{email}", description: "Email of the ticket creator", sampleValue: "david@example.com" },
            { key: "{status}", description: "Updated status (e.g. Acknowledged, Completed)", sampleValue: "Completed" },
            { key: "{adminComment}", description: "Admin reply comment text", sampleValue: "Your requested library has been refreshed." },
            { key: "{adminCommentBlock}", description: "Formatted admin reply block with styling", sampleValue: "<div ...>...</div>" },
            { key: "{issue}", description: "The original issue text submitted by user", sampleValue: "Cannot stream chapter 4 of Harry Potter." },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "ticket_error_alert",
        name: "System Error & Ticket Alert (Admins)",
        description: "Sent to administrators when a user submits a ticket or an automated system error report is logged.",
        category: "SUPPORT",
        defaultSubject: "🚨 [{errorTitle}] Reported by {name}",
        defaultBody: `<h2 style="color: #dc2626; margin-top: 0;">🚨 Automated Error Report Ticket</h2>
<p><strong>User:</strong> {name} ({email})</p>
<p><strong>Page:</strong> <code>{pageUrl}</code></p>

<div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0; border-radius: 4px;">
    <h4 style="margin-top: 0; color: #991b1b;">Error Details:</h4>
    <pre style="white-space: pre-wrap; word-break: break-all; color: #7f1d1d; font-family: monospace; font-size: 13px; margin: 0;">{errorMessage}</pre>
    {userNoteBlock}
</div>

<div style="text-align: center; margin: 20px 0;">
    <a href="{ticketsUrl}" style="background-color: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Tickets Dashboard</a>
</div>`,
        variables: [
            { key: "{name}", description: "Name or username reporting the error", sampleValue: "Rachel" },
            { key: "{email}", description: "Email address", sampleValue: "rachel@example.com" },
            { key: "{pageUrl}", description: "Page or route where error occurred", sampleValue: "/library?tab=audiobooks" },
            { key: "{errorTitle}", description: "Short error title", sampleValue: "Audio Stream Range Error" },
            { key: "{errorMessage}", description: "Full technical error stack trace or description", sampleValue: "ESTREAM: audio file lock failed" },
            { key: "{ticketsUrl}", description: "Link to Admin Tickets panel", sampleValue: "https://portal.example.com/admin/tickets" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "kindle_failed",
        name: "Send-to-Kindle Delivery Failure Guide",
        description: "Sent to the user's personal email when delivery of an ebook to their Kindle email fails.",
        category: "KINDLE",
        defaultSubject: "❌ Failed to Deliver Ebook to Kindle: {title}",
        defaultBody: `<h2 style="color: #dc2626; margin-top: 0;">Kindle Delivery Failed</h2>
<p>We attempted to send <strong>{title}</strong> to your Kindle address (<code>{kindleEmail}</code>), but the SMTP server rejected the delivery.</p>

<div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 12px; margin: 18px 0; font-family: monospace; font-size: 13px; color: #b91c1c;">
    <strong>Error:</strong> {errorMessage}
</div>

<h3 style="color: #0f172a; margin-bottom: 8px;">Troubleshooting Checklist:</h3>
<ol style="line-height: 1.6; padding-left: 20px;">
    <li>
        <strong>Approve Sender Address:</strong> Amazon will reject emails from addresses they don't recognize. Add our server address:
        <br />
        <code style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block; margin-top: 4px; color: #0f172a;">{senderEmail}</code>
        <br />
        <span style="font-size: 12px; color: #64748b;">(Amazon.com &rarr; Preferences &rarr; Personal Document Settings &rarr; Approved Personal Document E-mail List)</span>
    </li>
    <li style="margin-top: 8px;">
        <strong>File Size:</strong> Kindle has a 50MB email file size limit. Your book size is <code>{fileSizeMb} MB</code>.
    </li>
    <li style="margin-top: 8px;">
        <strong>Verify Kindle Address:</strong> Make sure <code>{kindleEmail}</code> matches the address in your Amazon Kindle device settings.
    </li>
</ol>`,
        variables: [
            { key: "{title}", description: "Book title", sampleValue: "Mistborn: The Final Empire" },
            { key: "{kindleEmail}", description: "User's Send-to-Kindle email address", sampleValue: "alex_kindle@kindle.com" },
            { key: "{senderEmail}", description: "Server SMTP sender email address", sampleValue: "portalarr@example.com" },
            { key: "{errorMessage}", description: "SMTP error message", sampleValue: "550 5.1.1 Recipient rejected by Amazon" },
            { key: "{fileSizeMb}", description: "File size in Megabytes", sampleValue: "3.2" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "library_access_request",
        name: "Library Access Request (Admins)",
        description: "Sent to administrators when a user requests access to a book or audiobook library.",
        category: "REQUESTS",
        defaultSubject: "🚨 Library Access Request from {username}",
        defaultBody: `<h2>Library Access Request</h2>
<p>The user <strong>{username}</strong> has requested access to the Book & Audiobook Library.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #64748b;">Username:</td>
            <td style="padding: 6px 0;"><code>{username}</code></td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Personal Email:</td>
            <td style="padding: 6px 0;"><code>{email}</code></td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Send-to-Kindle:</td>
            <td style="padding: 6px 0;"><code>{kindleEmail}</code></td>
        </tr>
    </table>
</div>

<h3 style="color: #0f172a; margin-bottom: 8px;">How to Approve:</h3>
<p style="line-height: 1.6;">
    To grant access to this user, log into Portalarr and open the Book Library Manage tab. 
    Edit the library you want them to access and add <strong><code>{username}</code></strong> to the Allowed Users list.
</p>
<div style="text-align: center; margin: 24px 0;">
    <a href="{accessUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Open Access Settings</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username requesting access", sampleValue: "clara_b" },
            { key: "{email}", description: "User's personal email", sampleValue: "clara@example.com" },
            { key: "{kindleEmail}", description: "User's Kindle email", sampleValue: "clara_kindle@kindle.com" },
            { key: "{accessUrl}", description: "URL to Access Control page", sampleValue: "https://portal.example.com/settings/access" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "trial_welcome",
        name: "Free Trial Welcome & Activation",
        description: "Sent to users when their free trial account is created or approved, detailing trial duration, expiration date, and library access.",
        category: "TRIALS",
        defaultSubject: "🌟 Welcome to your {trialDays}-Day Free Trial on Portalarr!",
        defaultBody: `<h2>Welcome to Your Free Trial! 🌟</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your <strong>{trialDays}-Day Free Trial</strong> has been activated for Portalarr. You now have full access to our media collections, audiobooks, ebooks, and request features!</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #64748b;">Username:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{username}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Trial Duration:</td>
            <td style="padding: 6px 0; color: #4f46e5; font-weight: bold;">{trialDays} Days</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Expiration Date:</td>
            <td style="padding: 6px 0; color: #0f172a;">{expirationDate}</td>
        </tr>
    </table>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Start Exploring Portalarr</a>
</div>
<p style="font-size: 13px; color: #64748b;">Need help or have questions during your trial? Submit a support ticket or request media directly from your dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the trial user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{trialDays}", description: "Number of trial days granted", sampleValue: "14" },
            { key: "{expirationDate}", description: "Date when trial will expire", sampleValue: "October 15, 2026" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "trial_expiring_soon",
        name: "Trial Expiring Soon Reminder",
        description: "Sent to trial users a few days before their trial expires reminding them to renew or upgrade their access.",
        category: "TRIALS",
        defaultSubject: "⏳ Your Portalarr Trial Ends Soon ({daysRemaining} days left)",
        defaultBody: `<h2>Your Free Trial is Ending Soon ⏳</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>We hope you've been enjoying Portalarr! Just a quick heads up that your free trial access is scheduled to expire on <strong>{expirationDate}</strong> (in {daysRemaining} days).</p>

<div style="background-color: #fefce8; border: 1px solid #fef08a; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #854d0e;">
        To maintain uninterrupted access to your Plex media libraries, book collections, and request queue, please renew or upgrade your account.
    </p>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{renewUrl}" style="background-color: #d97706; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Renew or Upgrade Access</a>
</div>
<p style="font-size: 13px; color: #64748b;">If you have any questions or need an extension, feel free to reach out to the server admin.</p>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{daysRemaining}", description: "Number of days remaining in trial", sampleValue: "3" },
            { key: "{expirationDate}", description: "Date when trial expires", sampleValue: "October 15, 2026" },
            { key: "{renewUrl}", description: "URL to renewal or profile page", sampleValue: "https://portal.example.com/settings" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "trial_expired",
        name: "Trial Period Expired Notice",
        description: "Sent to users when their trial period has concluded and their library access has paused.",
        category: "TRIALS",
        defaultSubject: "⚠️ Your Portalarr Trial Has Ended",
        defaultBody: `<h2>Your Trial Period Has Ended ⚠️</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your free trial access for Portalarr concluded on <strong>{expirationDate}</strong>. Your media and Plex library access has been temporarily paused.</p>

<p>Your account, bookmarks, and request history remain saved. You can reactivate your account at any time by upgrading to full access.</p>

<div style="text-align: center; margin: 28px 0;">
    <a href="{renewUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Reactivate Account</a>
</div>
<p style="font-size: 13px; color: #64748b;">Thank you for trying Portalarr! If you have any feedback or questions, let us know.</p>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{expirationDate}", description: "Date when trial concluded", sampleValue: "October 15, 2026" },
            { key: "{renewUrl}", description: "URL to renewal page", sampleValue: "https://portal.example.com/settings" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "subscription_activated",
        name: "Subscription / VIP Pass Activated",
        description: "Sent to users when their ongoing subscription, yearly pass, or VIP status is enabled.",
        category: "TRIALS",
        defaultSubject: "✨ Your Portalarr Full Access is Active!",
        defaultBody: `<h2>Full Access Activated! ✨</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! Your account has been upgraded to <strong>{planName}</strong>. You now have uninterrupted access to all libraries, players, and download services.</p>

<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #166534;">Plan / Pass:</td>
            <td style="padding: 6px 0; color: #15803d; font-weight: 700;">{planName}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Active Until:</td>
            <td style="padding: 6px 0; color: #0f172a;">{validUntil}</td>
        </tr>
    </table>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{appUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Open Media Hub</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{planName}", description: "Plan or membership name", sampleValue: "Annual Pass" },
            { key: "{validUntil}", description: "Expiration or renewal date", sampleValue: "December 31, 2026" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "kindle_success",
        name: "Send-to-Kindle Delivery Confirmation",
        description: "Sent to user's personal email when an ebook is successfully dispatched to their Kindle device.",
        category: "KINDLE",
        defaultSubject: "📚 Ebook Delivered to Kindle: {title}",
        defaultBody: `<h2>Ebook Sent to Kindle! 📚</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your requested ebook <strong>{title}</strong> by <em>{author}</em> has been successfully sent to your Kindle address (<code>{kindleEmail}</code>).</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>Title:</strong> {title}</p>
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569;"><strong>Author:</strong> {author}</p>
    <p style="margin: 0; font-size: 14px; color: #475569;"><strong>File Size:</strong> {fileSizeMb} MB</p>
</div>

<p style="font-size: 13px; color: #64748b;">It usually takes 1-5 minutes for Amazon Whispernet to sync the ebook to your Kindle device or Kindle app.</p>`,
        variables: [
            { key: "{username}", description: "Username of recipient", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of book sent", sampleValue: "The Way of Kings" },
            { key: "{author}", description: "Author of book", sampleValue: "Brandon Sanderson" },
            { key: "{kindleEmail}", description: "Kindle delivery email address", sampleValue: "alex@kindle.com" },
            { key: "{fileSizeMb}", description: "File size in MB", sampleValue: "2.4" },
            { key: "{appUrl}", description: "Base URL of Portalarr", sampleValue: "https://portal.example.com" }
        ]
    }
];

export function getDefaultEmailTemplate(id: string): EmailTemplateDefinition | undefined {
    return DEFAULT_EMAIL_TEMPLATES.find(t => t.id === id);
}

/**
 * Standard Portalarr Responsive Email Container Layout
 */
export function wrapInPortalarrEmailLayout(options: {
    title: string;
    contentHtml: string;
    appUrl?: string;
    actionButton?: { text: string; url: string; color?: string };
}): string {
    const appUrl = options.appUrl || "https://portalarr.local";
    const currentYear = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
    <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-radius: 12px 12px 0 0; padding: 24px; border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: none; text-align: center;">
            <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                    PORTAL<span style="color: #6366f1;">ARR</span>
                </span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">
                Unified Media Hub & Management
            </div>
        </div>

        <!-- Main Card Body -->
        <div style="background-color: #ffffff; padding: 32px 28px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
            <div style="font-size: 15px; line-height: 1.65; color: #334155;">
                ${options.contentHtml}
            </div>

            ${options.actionButton ? `
                <div style="text-align: center; margin: 32px 0 16px 0;">
                    <a href="${options.actionButton.url}" style="background-color: ${options.actionButton.color || '#4f46e5'}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                        ${options.actionButton.text}
                    </a>
                </div>
            ` : ""}

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0 20px 0;" />

            <!-- Footer -->
            <div style="text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                <p style="margin: 0;">Portalarr Server • <a href="${appUrl}" style="color: #6366f1; text-decoration: none; font-weight: 500;">Open Dashboard</a></p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #cbd5e1;">© ${currentYear} Portalarr Ecosystem. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Loads a template from DB (or fallback default), performs variable replacement, and returns rendered subject and HTML.
 */
export async function renderEmailTemplate(
    templateId: string,
    variables: Record<string, string | number | undefined | null>,
    options?: {
        wrapInLayout?: boolean;
        actionButton?: { text: string; url: string; color?: string };
    }
): Promise<{ subject: string; html: string }> {
    const defaultDef = getDefaultEmailTemplate(templateId);
    let subject = defaultDef?.defaultSubject || "Portalarr Notification";
    let body = defaultDef?.defaultBody || "<p>Notification from Portalarr</p>";

    try {
        const custom = await prisma.emailTemplate.findUnique({
            where: { id: templateId }
        });
        if (custom) {
            if (custom.subject && custom.subject.trim()) {
                subject = custom.subject;
            }
            if (custom.body && custom.body.trim()) {
                body = custom.body;
            }
        }
    } catch (e) {
        // Fall back to default
    }

    const appUrl = (variables.appUrl as string) || (await getAppUrl());
    const allVars: Record<string, string> = {
        appUrl,
        portalName: "Portalarr",
        ...Object.fromEntries(
            Object.entries(variables).map(([k, v]) => [k, v !== undefined && v !== null ? String(v) : ""])
        )
    };

    // Replace all {key} placeholders
    for (const [key, val] of Object.entries(allVars)) {
        const regex = new RegExp(`\\{${key}\\}`, "g");
        subject = subject.replace(regex, val);
        body = body.replace(regex, val);
    }

    // Wrap in standard layout if requested or if body isn't a full HTML document
    const shouldWrap = options?.wrapInLayout !== false && !body.includes("<html") && !body.includes("<!DOCTYPE");
    const finalHtml = shouldWrap
        ? wrapInPortalarrEmailLayout({
              title: subject,
              contentHtml: body,
              appUrl,
              actionButton: options?.actionButton
          })
        : body;

    return { subject, html: finalHtml };
}
