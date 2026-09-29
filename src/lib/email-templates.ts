import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";

export interface TemplateVariableInfo {
    key: string;
    description: string;
    sampleValue: string;
}

export interface EmailTemplateDefinition {
    id: string;
    name: string;
    description: string;
    triggerEvent: string;
    category: "AUTH" | "REQUESTS" | "SUPPORT" | "KINDLE" | "TRIALS" | "PAYMENTS" | string;
    defaultSubject: string;
    defaultBody: string;
    variables: TemplateVariableInfo[];
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
    {
        id: "user_approval",
        name: "User Account Approval Welcome",
        description: "Sent to users when an administrator approves their pending account request.",
        triggerEvent: "Triggered immediately when an administrator clicks 'Approve' on a pending account in Access Control (/settings/access) or when Plex friend auto-sync detects a newly approved friend.",
        category: "AUTH",
        defaultSubject: "🎉 Your DomsHomeLab Account has been Approved!",
        defaultBody: `<h2>Account Approved! 🎉</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! Your account request for DomsHomeLab has been approved by the administrator.</p>
<p>You can now sign in and explore media libraries, stream audiobooks, read books in your browser, and submit media requests.</p>
<div style="text-align: center; margin: 28px 0;">
    <a href="{loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Log in to DomsHomeLab</a>
</div>
<p style="font-size: 13px; color: #64748b;">If you need any assistance getting started, feel free to submit a support ticket inside the dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the approved user", sampleValue: "alex_reader" },
            { key: "{email}", description: "Email address of the approved user", sampleValue: "alex@example.com" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "admin_new_user",
        name: "New User Registration Alert (Admins)",
        description: "Sent to server administrators whenever a new user registers a pending account.",
        triggerEvent: "Triggered immediately when a visitor submits a new account registration on /login or /join, alerting all server administrators that approval is pending.",
        category: "AUTH",
        defaultSubject: "👤 New Account Request: {username}",
        defaultBody: `<h2>New Account Request</h2>
<p>A new user has registered a temporary account and is awaiting administrator approval to access DomsHomeLab.</p>

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
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" },
            { key: "{accessUrl}", description: "URL to the Access Control management page", sampleValue: "https://portal.example.com/settings/access" }
        ]
    },
    {
        id: "password_reset",
        name: "Password Reset & Temp Password",
        description: "Sent to users when they request a password reset or when an admin resets their password.",
        triggerEvent: "Triggered on demand when a user clicks 'Forgot password?' on /login or when an administrator clicks 'Reset Password' (🔑) in Access Control.",
        category: "AUTH",
        defaultSubject: "🔑 Temporary Password for DomsHomeLab",
        defaultBody: `<h2>Temporary Password Request</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>We received a password reset request for your DomsHomeLab account. Here is your temporary password:</p>

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
            { key: "{tempPassword}", description: "The newly generated temporary password", sampleValue: "DomsHomeLab-9k2x1!" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "media_ready",
        name: "Media Request Ready & Complete",
        description: "Sent to users when their requested book or audiobook is successfully downloaded and added to the library.",
        triggerEvent: "Triggered automatically when a requested ebook or audiobook finishes downloading, passes scanner import checks, and is committed to the SQLite library database.",
        category: "REQUESTS",
        defaultSubject: "🎉 Your {mediaLabel} is Ready: {title}",
        defaultBody: `<h2>Your {mediaLabel} is Ready! 🎉</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! The {mediaLabel} you requested has been downloaded and is now ready in the DomsHomeLab library.</p>

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
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "media_request_admin",
        name: "New Media Request Alert (Admins)",
        description: "Sent to administrators whenever a user submits a new book or audiobook request.",
        triggerEvent: "Triggered immediately when a user submits a book or audiobook request on /library or /discover, notifying administrators for download tracking.",
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
            { key: "{manageUrl}", description: "URL to the Requests management portal", sampleValue: "https://portal.example.com/requests" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "ticket_update",
        name: "Support Ticket Update & Admin Reply",
        description: "Sent to the user when an admin updates their support ticket status or leaves a response.",
        triggerEvent: "Triggered whenever an administrator submits a reply note or changes the ticket status at /admin/tickets, delivering the update directly to the ticket author.",
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

<p style="font-size: 13px; color: #64748b;">Thanks for using DomsHomeLab Support!</p>`,
        variables: [
            { key: "{name}", description: "Name or username of user who opened the ticket", sampleValue: "David" },
            { key: "{email}", description: "Email of the ticket creator", sampleValue: "david@example.com" },
            { key: "{status}", description: "Updated status (e.g. Acknowledged, Completed)", sampleValue: "Completed" },
            { key: "{adminComment}", description: "Admin reply comment text", sampleValue: "Your requested library has been refreshed." },
            { key: "{adminCommentBlock}", description: "Formatted admin reply block with styling", sampleValue: "<div ...>...</div>" },
            { key: "{issue}", description: "The original issue text submitted by user", sampleValue: "Cannot stream chapter 4 of Harry Potter." },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "ticket_error_alert",
        name: "System Error & Ticket Alert (Admins)",
        description: "Sent to administrators when a user submits a ticket or an automated system error report is logged.",
        triggerEvent: "Triggered automatically when an unhandled server error occurs or when a user clicks 'Report Error' / creates a ticket, providing full stack traces to admins.",
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
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "kindle_failed",
        name: "Send-to-Kindle Delivery Failure Guide",
        description: "Sent to the user's personal email when delivery of an ebook to their Kindle email fails.",
        triggerEvent: "Triggered whenever an outbound SMTP Send-to-Kindle delivery is rejected by Amazon (e.g. sender email not in Amazon's Approved Personal Document list or file exceeds 50MB).",
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
            { key: "{senderEmail}", description: "Server SMTP sender email address", sampleValue: "domshomelab@example.com" },
            { key: "{errorMessage}", description: "SMTP error message", sampleValue: "550 5.1.1 Recipient rejected by Amazon" },
            { key: "{fileSizeMb}", description: "File size in Megabytes", sampleValue: "3.2" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "kindle_success",
        name: "Send-to-Kindle Delivery Confirmation",
        description: "Sent to user's personal email when an ebook is successfully dispatched to their Kindle device.",
        triggerEvent: "Triggered whenever an ebook file is successfully accepted and dispatched by the SMTP server to the user's @kindle.com email address.",
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
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "library_access_request",
        name: "Library Access Request (Admins)",
        description: "Sent to administrators when a user requests access to a book or audiobook library.",
        triggerEvent: "Triggered when a user clicks 'Request Access' on a private or restricted library card from the /library page, alerting admins to update allowed users.",
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
    To grant access to this user, log into DomsHomeLab and open the Book Library Manage tab. 
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
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "trial_welcome",
        name: "Free Trial Welcome & Activation",
        description: "Sent to users when their free trial account is created or approved, detailing trial duration, expiration date, and library access.",
        triggerEvent: "Triggered immediately when a new user finishes the /join invitation wizard or when an administrator grants a trial period in Access Control.",
        category: "TRIALS",
        defaultSubject: "🌟 Welcome to your {trialDays}-Day Free Trial on DomsHomeLab!",
        defaultBody: `<h2>Welcome to Your Free Trial! 🌟</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your <strong>{trialDays}-Day Free Trial</strong> has been activated for DomsHomeLab (Plex server d281knilb). You now have full access to stream our movie and TV show collections on Plex!</p>

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
    <a href="{loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Start Streaming Now</a>
</div>
<p style="font-size: 13px; color: #64748b;">Need help or have questions during your trial? Submit a support ticket or request media directly from your dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the trial user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{trialDays}", description: "Number of trial days granted", sampleValue: "14" },
            { key: "{expirationDate}", description: "Date when trial will expire", sampleValue: "October 15, 2026" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "trial_expiring_soon",
        name: "Trial Expiring Soon Reminder",
        description: "Sent to trial users a few days before their trial expires reminding them to renew or upgrade their access.",
        triggerEvent: "Triggered automatically by the background trial monitoring cron when an active trial has 3 or fewer days remaining before expiration.",
        category: "TRIALS",
        defaultSubject: "⏳ Your DomsHomeLab Trial Ends Soon ({daysRemaining} days left)",
        defaultBody: `<h2>Your Free Trial is Ending Soon ⏳</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>We hope you've been enjoying DomsHomeLab (d281knilb)! Just a quick heads up that your free trial access is scheduled to expire on <strong>{expirationDate}</strong> (in {daysRemaining} days).</p>

<div style="background-color: #fefce8; border: 1px solid #fef08a; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #854d0e;">
        To maintain uninterrupted access to your Plex media libraries and unlock full membership perks (dedicated Kids profiles, full digital Ebook & Audiobook library, and Send-to-Kindle), upgrade your account today!
    </p>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{renewUrl}" style="background-color: #d97706; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Upgrade to Full Membership</a>
</div>
<p style="font-size: 13px; color: #64748b;">If you have any questions or need an extension, feel free to reach out to the server admin.</p>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{daysRemaining}", description: "Number of days remaining in trial", sampleValue: "3" },
            { key: "{expirationDate}", description: "Date when trial expires", sampleValue: "October 15, 2026" },
            { key: "{renewUrl}", description: "URL to renewal or profile page", sampleValue: "https://portal.example.com/settings" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "trial_expired",
        name: "Trial Period Expired Notice",
        description: "Sent to users when their trial period has concluded and their library access has paused.",
        triggerEvent: "Triggered automatically when a user's trial period concludes and grace period expires, pausing active Plex library shares.",
        category: "TRIALS",
        defaultSubject: "⚠️ Your DomsHomeLab Trial Has Ended",
        defaultBody: `<h2>Your Trial Period Has Ended ⚠️</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your free trial access for DomsHomeLab (d281knilb) concluded on <strong>{expirationDate}</strong>. Your media and Plex library access has been temporarily paused.</p>

<p>Your account, bookmarks, and request history remain safely saved. You can reactivate your account at any time by upgrading to full access.</p>

<div style="text-align: center; margin: 28px 0;">
    <a href="{renewUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Reactivate & Upgrade Account</a>
</div>
<p style="font-size: 13px; color: #64748b;">Thank you for trying DomsHomeLab! If you have any feedback or questions, let us know.</p>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{expirationDate}", description: "Date when trial concluded", sampleValue: "October 15, 2026" },
            { key: "{renewUrl}", description: "URL to renewal page", sampleValue: "https://portal.example.com/settings" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "subscription_activated",
        name: "Full Membership / VIP Pass Activated",
        description: "Sent to users when their account is upgraded from trial to Full Membership or when a subscription pass is granted.",
        triggerEvent: "Triggered when a user upgrades from a trial to Full Membership (Annual, Monthly, Rest-of-Year, or Permanent Pass), or when an administrator activates their full membership in Access Control.",
        category: "TRIALS",
        defaultSubject: "👑 Welcome to Full Membership on DomsHomeLab!",
        defaultBody: `<h2>Full Membership Activated! 👑</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Congratulations! Your account has been upgraded to <strong>{planName}</strong>. You now have full, uninterrupted access to all media libraries on d281knilb and all premium perks.</p>

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

<h3 style="color: #0f172a; margin: 20px 0 8px 0;">Your Unlocked Membership Perks:</h3>
<ul style="line-height: 1.7; padding-left: 20px; font-size: 14px; color: #334155;">
    <li>🎬 <strong>Unlimited Streaming:</strong> 100% Direct Play Original Studio Quality (4K HDR, Dolby Atmos).</li>
    <li>🧒 <strong>Dedicated Kids & Living Room Profiles:</strong> Child-safe accounts with custom PIN protection and age rating filters.</li>
    <li>📚 <strong>Digital Ebook & Audiobook Library:</strong> In-browser Kindle Paperwhite reader, floating audio player, & Send-to-Kindle delivery.</li>
    <li>⚡ <strong>Priority Bandwidth:</strong> Dedicated high-priority streaming & transcoding allocation.</li>
    <li>🎁 <strong>Discord VIP & Referral Rewards:</strong> Real-time server status alerts, direct support, and earn +1 free month per friend referred.</li>
</ul>

<div style="text-align: center; margin: 28px 0;">
    <a href="{appUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Open Media Hub</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{planName}", description: "Plan or membership name", sampleValue: "Annual Pass" },
            { key: "{validUntil}", description: "Expiration or renewal date", sampleValue: "December 31, 2026" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "payment_received",
        name: "Payment Receipt & Membership Confirmation",
        description: "Sent to the user anytime a payment is received and processed (via Venmo, PayPal, Cash App, Zelle, or manual attribution), confirming the amount paid, new expiration date, and active membership perks.",
        triggerEvent: "Triggered automatically whenever an incoming payment (Venmo, PayPal, Cash App, Zelle) is matched and fulfilled by the automated IMAP email scraper or manually attributed by an administrator.",
        category: "PAYMENTS",
        defaultSubject: "💳 Payment Received & Membership Confirmed ({amount})",
        defaultBody: `<h2>Payment Received! 💳</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Thank you for your payment! We have received your payment of <strong>{amount}</strong> via <strong>{provider}</strong> and your DomsHomeLab membership has been updated.</p>

<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 150px; color: #166534;">Amount Received:</td>
            <td style="padding: 6px 0; color: #15803d; font-weight: 700; font-size: 16px;">{amount}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Payment Method:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{provider}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Date Received:</td>
            <td style="padding: 6px 0; color: #0f172a;">{paymentDate}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Period Granted:</td>
            <td style="padding: 6px 0; color: #4f46e5; font-weight: 600;">{periodGranted}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Active Until:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{validUntil}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #166534;">Transaction Ref:</td>
            <td style="padding: 6px 0; color: #64748b; font-family: monospace; font-size: 12px;">{transactionId}</td>
        </tr>
    </table>
</div>

<h3 style="color: #0f172a; margin: 20px 0 8px 0;">Your Full Membership Perks:</h3>
<ul style="line-height: 1.7; padding-left: 20px; font-size: 14px; color: #334155;">
    <li>🎬 <strong>Unlimited Streaming:</strong> 100% Direct Play Original Studio Quality (4K HDR, Dolby Atmos).</li>
    <li>🧒 <strong>Dedicated Kids & Living Room Profiles:</strong> Child-safe accounts with custom PIN protection.</li>
    <li>📚 <strong>Digital Ebook & Audiobook Library:</strong> In-browser Kindle Paperwhite mode, audio player, & Send-to-Kindle.</li>
    <li>⚡ <strong>Priority Bandwidth:</strong> Dedicated high-priority streaming & transcoding allocation.</li>
    <li>🎁 <strong>Referral Rewards:</strong> Earn +1 free month for every friend you refer to the server!</li>
</ul>

<div style="text-align: center; margin: 28px 0;">
    <a href="{appUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Open DomsHomeLab Dashboard</a>
</div>
<p style="font-size: 13px; color: #64748b;">If you have any questions regarding your membership or billing, reply to this email or submit a ticket in the dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the payer", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email address of user", sampleValue: "jordan@example.com" },
            { key: "{amount}", description: "Payment amount received (e.g. 15.00 or 40.16)", sampleValue: "40.16" },
            { key: "{provider}", description: "Payment provider (Venmo, PayPal, Cash App, Zelle)", sampleValue: "Venmo" },
            { key: "{paymentDate}", description: "Date payment was received", sampleValue: "October 10, 2026" },
            { key: "{periodGranted}", description: "Subscription period granted", sampleValue: "Rest of Year (through Dec 31, 2026)" },
            { key: "{validUntil}", description: "New membership expiration date", sampleValue: "December 31, 2026" },
            { key: "{transactionId}", description: "External transaction ID or reference", sampleValue: "VENMO-TX-984210" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" },
            { key: "{loginUrl}", description: "Direct login link", sampleValue: "https://portal.example.com/login" }
        ]
    },
    {
        id: "admin_payment_received",
        name: "New Payment Alert (Admins)",
        description: "Sent to administrators whenever an incoming payment is detected and recorded from Venmo, PayPal, Cash App, or Zelle.",
        triggerEvent: "Triggered whenever an incoming payment is detected and recorded from Venmo, PayPal, Cash App, or Zelle, alerting administrators of received funds and whether it was auto-matched or requires manual review.",
        category: "PAYMENTS",
        defaultSubject: "💰 Payment Received: {amount} via {provider} ({matchedUser})",
        defaultBody: `<h2>Incoming Payment Received 💰</h2>
<p>An incoming payment has been processed and logged in DomsHomeLab:</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #64748b;">Amount:</td>
            <td style="padding: 6px 0; color: #15803d; font-weight: 700; font-size: 16px;">{amount}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Provider:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{provider}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Payer:</td>
            <td style="padding: 6px 0; color: #0f172a;">{senderName} ({senderHandle})</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Matched User:</td>
            <td style="padding: 6px 0; color: #2563eb; font-weight: 600;">{matchedUser}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Period Granted:</td>
            <td style="padding: 6px 0; color: #0f172a;">{periodGranted}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Memo / Note:</td>
            <td style="padding: 6px 0; color: #64748b; font-family: monospace;">{note}</td>
        </tr>
    </table>
</div>

<div style="text-align: center; margin: 24px 0;">
    <a href="{accessUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">View Payment Transactions</a>
</div>`,
        variables: [
            { key: "{amount}", description: "Payment amount received", sampleValue: "40.16" },
            { key: "{provider}", description: "Payment provider name", sampleValue: "Venmo" },
            { key: "{senderName}", description: "Name of the sender", sampleValue: "Jordan Miller" },
            { key: "{senderHandle}", description: "Handle or email of sender", sampleValue: "@jordan-miller" },
            { key: "{matchedUser}", description: "Matched username on DomsHomeLab", sampleValue: "jordan_reader" },
            { key: "{periodGranted}", description: "Subscription period granted", sampleValue: "Rest of Year (through Dec 31, 2026)" },
            { key: "{note}", description: "Payment memo or note", sampleValue: "jordan_reader" },
            { key: "{accessUrl}", description: "Link to Access Control payment tab", sampleValue: "https://portal.example.com/settings/access" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_new_admin",
        name: "New Movie/TV Request Alert (Admins)",
        description: "Sent to administrators when a user submits a Movie or TV Show request that requires review.",
        triggerEvent: "Triggered when a user submits a Movie or TV Show request via Discover/Seerr that requires manual administrator approval.",
        category: "REQUESTS",
        defaultSubject: "🎬 New {mediaLabel} Request: {title} ({releaseYear})",
        defaultBody: `<h2>New Media Request 🎬</h2>
<p>A new {mediaLabel} request has been submitted by <strong>{requestedBy}</strong>:</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
    <tr style="background-color: #f8fafc;">
        <td style="padding: 10px; font-weight: bold; width: 130px; border: 1px solid #e2e8f0;">Title:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>{title} ({releaseYear})</strong></td>
    </tr>
    <tr>
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Type & Quality:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">{mediaLabel} • <strong>{quality}</strong> ({section})</td>
    </tr>
    <tr style="background-color: #f8fafc;">
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Content Rating:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><code>{contentRating}</code></td>
    </tr>
    <tr>
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Requested By:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><code>{requestedBy}</code></td>
    </tr>
    <tr style="background-color: #f8fafc;">
        <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Overview:</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569;">{overview}</td>
    </tr>
</table>

<div style="margin-top: 24px; text-align: center;">
    <a href="{manageUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Manage Requests</a>
</div>`,
        variables: [
            { key: "{title}", description: "Title of the requested movie or series", sampleValue: "Dune: Part Two" },
            { key: "{releaseYear}", description: "Release year of media", sampleValue: "2024" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "Movie" },
            { key: "{mediaType}", description: "Media type identifier ('movie' or 'tv')", sampleValue: "movie" },
            { key: "{quality}", description: "Quality resolution ('4K UHD' or '1080p Standard')", sampleValue: "4K UHD" },
            { key: "{section}", description: "Library category ('Main Library' or 'Kids & Family')", sampleValue: "Main Library" },
            { key: "{contentRating}", description: "Age rating certificate", sampleValue: "PG-13" },
            { key: "{requestedBy}", description: "Username who submitted request", sampleValue: "alex_reader" },
            { key: "{overview}", description: "Plot summary", sampleValue: "Paul Atreides unites with Chani and the Fremen..." },
            { key: "{manageUrl}", description: "Link to Request Engine management tab", sampleValue: "https://portal.example.com/requests" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_auto_approved",
        name: "Media Request Auto-Approved Confirmation",
        description: "Sent to the requesting user when their Movie or TV Show request is automatically approved and queued for download.",
        triggerEvent: "Triggered immediately when a user's Movie or TV Show request satisfies auto-approval rules and is automatically dispatched to Radarr / Sonarr.",
        category: "REQUESTS",
        defaultSubject: "🚀 Your Request is Auto-Approved: {title}",
        defaultBody: `<h2>Request Auto-Approved! 🚀</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your request for <strong>{title} ({releaseYear})</strong> has been automatically approved and queued for download.</p>

<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 15px;"><strong>Title:</strong> {title} ({releaseYear})</p>
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #166534;"><strong>Format:</strong> {mediaLabel} • {quality}</p>
    <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Status:</strong> Queued & Downloading</p>
</div>

<p style="font-size: 13px; color: #64748b;">You will receive another notification as soon as the media is ready to stream on Plex!</p>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of requested media", sampleValue: "Oppenheimer" },
            { key: "{releaseYear}", description: "Release year", sampleValue: "2023" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "Movie" },
            { key: "{quality}", description: "Quality resolution", sampleValue: "1080p Standard" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_approved",
        name: "Media Request Approved (Admin Review)",
        description: "Sent to the requesting user when an administrator reviews and approves their pending Movie or TV Show request.",
        triggerEvent: "Triggered when an administrator manually approves a pending Movie or TV Show request in the Request Engine (/requests).",
        category: "REQUESTS",
        defaultSubject: "✅ Media Request Approved: {title}",
        defaultBody: `<h2>Request Approved! ✅</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! Your request for <strong>{title} ({releaseYear})</strong> has been reviewed and approved by the server administrator.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 15px;"><strong>Title:</strong> {title} ({releaseYear})</p>
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569;"><strong>Format:</strong> {mediaLabel} • {quality}</p>
    <p style="margin: 0; font-size: 13px; color: #2563eb;"><strong>Status:</strong> Approved & Downloading</p>
</div>

<p style="font-size: 13px; color: #64748b;">We will email you once it's available to watch on Plex.</p>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of requested media", sampleValue: "House of the Dragon" },
            { key: "{releaseYear}", description: "Release year", sampleValue: "2022" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "TV Series" },
            { key: "{quality}", description: "Quality resolution", sampleValue: "4K UHD" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_declined",
        name: "Media Request Declined Notice",
        description: "Sent to the requesting user when an administrator declines their Movie or TV Show request, including the reason.",
        triggerEvent: "Triggered when an administrator rejects or declines a Movie or TV Show request in the Request Engine, transmitting the decline explanation.",
        category: "REQUESTS",
        defaultSubject: "❌ Media Request Declined: {title}",
        defaultBody: `<h2>Media Request Update</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your request for <strong>{title} ({releaseYear})</strong> could not be fulfilled at this time.</p>

<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 14px; margin: 20px 0;">
    <h4 style="margin: 0 0 6px 0; color: #991b1b;">Reason for Decline:</h4>
    <p style="margin: 0; font-size: 14px; color: #7f1d1d;">{declineReason}</p>
</div>

<p style="font-size: 13px; color: #64748b;">If you have any questions, feel free to submit a support ticket in the dashboard.</p>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of requested media", sampleValue: "The Matrix Resurrections" },
            { key: "{releaseYear}", description: "Release year", sampleValue: "2021" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "Movie" },
            { key: "{declineReason}", description: "Administrator's reason for declining", sampleValue: "Already available under alternate edition in library." },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_available",
        name: "Media Available to Stream (Plex)",
        description: "Sent to the requesting user when their requested Movie or TV Show is downloaded and ready to stream on Plex.",
        triggerEvent: "Triggered when Radarr or Sonarr finishes downloading a requested movie or episode and Plex library scanning detects the new file.",
        category: "REQUESTS",
        defaultSubject: "🎉 Ready to Watch: {title} is Now on Plex!",
        defaultBody: `<h2>Ready to Stream! 🎉</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Great news! The {mediaLabel} you requested is now downloaded and ready to stream on Plex.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: bold; color: #0f172a;">{title} ({releaseYear})</p>
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569;"><strong>Format:</strong> {mediaLabel} • {quality}</p>
    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">{overview}</p>
</div>

<div style="text-align: center; margin: 28px 0;">
    <a href="{plexUrl}" style="background-color: #e5a00d; color: #000000; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 14px; display: inline-block;">
        ▶️ Watch on Plex
    </a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of requested media", sampleValue: "Dune: Part Two" },
            { key: "{releaseYear}", description: "Release year", sampleValue: "2024" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "Movie" },
            { key: "{quality}", description: "Quality resolution ('4K UHD' or '1080p Standard')", sampleValue: "4K UHD" },
            { key: "{overview}", description: "Plot overview", sampleValue: "Paul Atreides unites with Chani and the Fremen..." },
            { key: "{plexUrl}", description: "Direct link to watch on Plex", sampleValue: "https://app.plex.tv/desktop" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "seerr_request_failed",
        name: "Media Request Download Issue Alert",
        description: "Sent when a Movie or TV Show request encounters a download or dispatch error.",
        triggerEvent: "Triggered when a Movie or TV Show download fails, encounters indexer errors, or exceeds retry limits in Radarr / Sonarr.",
        category: "REQUESTS",
        defaultSubject: "⚠️ Media Request Issue: {title}",
        defaultBody: `<h2>Media Request Notice ⚠️</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>We encountered an issue while processing your request for <strong>{title} ({releaseYear})</strong>.</p>

<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; padding: 14px; margin: 20px 0;">
    <h4 style="margin: 0 0 6px 0; color: #991b1b;">Error Details:</h4>
    <p style="margin: 0; font-size: 13px; color: #7f1d1d; font-family: monospace;">{errorMessage}</p>
</div>

<p style="font-size: 13px; color: #64748b;">The system or administrator will retry this request automatically when indexers or sources become available.</p>`,
        variables: [
            { key: "{username}", description: "Username of the requester", sampleValue: "alex_reader" },
            { key: "{title}", description: "Title of requested media", sampleValue: "Fallout" },
            { key: "{releaseYear}", description: "Release year", sampleValue: "2024" },
            { key: "{mediaLabel}", description: "Format name ('Movie' or 'TV Series')", sampleValue: "TV Series" },
            { key: "{errorMessage}", description: "Description of the download or dispatch error", sampleValue: "No indexer release matches custom quality cutoff." },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "admin_user_access_revoked",
        name: "User Role / Access Change Alert (Admins)",
        description: "Sent to server administrators whenever a user's role is demoted or their access is expired, suspended, or revoked.",
        triggerEvent: "Triggered whenever an administrator changes a user's role or status, or when the trial monitor expires or suspends an account.",
        category: "AUTH",
        defaultSubject: "⚠️ User Access / Role Update: {username} ({statusChange})",
        defaultBody: `<h2>User Access / Role Update ⚠️</h2>
<p>An account access or role change has occurred for <strong>{username}</strong>:</p>

<div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #92400e;">User:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{username} ({email})</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #92400e;">Status:</td>
            <td style="padding: 6px 0; color: #b45309; font-weight: bold;">{oldStatus} &rarr; {newStatus}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #92400e;">Role:</td>
            <td style="padding: 6px 0; color: #0f172a;">{oldRole} &rarr; {newRole}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #92400e;">Reason:</td>
            <td style="padding: 6px 0; color: #334155;">{reason}</td>
        </tr>
    </table>
</div>

<p>You can review this user's permissions, restore access, or edit account details in Access Control.</p>
<div style="text-align: center; margin: 24px 0;">
    <a href="{accessUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Open Access Control</a>
</div>`,
        variables: [
            { key: "{username}", description: "Username of the affected user", sampleValue: "jordan_reader" },
            { key: "{email}", description: "Email of the affected user", sampleValue: "jordan@example.com" },
            { key: "{statusChange}", description: "Summary of status transition", sampleValue: "APPROVED -> EXPIRED" },
            { key: "{oldStatus}", description: "Previous account status", sampleValue: "APPROVED" },
            { key: "{newStatus}", description: "New account status", sampleValue: "EXPIRED" },
            { key: "{oldRole}", description: "Previous user role", sampleValue: "USER" },
            { key: "{newRole}", description: "New user role", sampleValue: "USER" },
            { key: "{reason}", description: "Reason for the role or access change", sampleValue: "Trial period elapsed beyond grace period" },
            { key: "{accessUrl}", description: "URL to the Access Control management page", sampleValue: "https://portal.example.com/settings/access" },
        ]
    },
    {
        id: "referral_reward_credited",
        name: "Referral Reward Credited (+1 Free Month)",
        description: "Sent to a member when an invited friend joins or is credited by an admin, confirming their +1 free month credit towards membership renewal.",
        triggerEvent: "Triggered automatically when an invited friend joins and becomes an active member, or when an administrator credits a referral to the member's account.",
        category: "TRIALS",
        defaultSubject: "🎁 You've Earned 1 Free Month! (@{friendUsername} Joined DomsHomeLab)",
        defaultBody: `<h2>You've Earned 1 Free Month! 🎁</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Awesome news! Your friend <strong>@{friendUsername}</strong> has joined DomsHomeLab (d281knilb) as a member.</p>

<div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 150px; color: #5b21b6;">Reward Earned:</td>
            <td style="padding: 6px 0; color: #7c3aed; font-weight: 700; font-size: 15px;">+1 Free Month Credit ($15.00 Value)</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #5b21b6;">Referred Friend:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">@{friendUsername}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #5b21b6;">Total Rewards:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{totalReferralsCount} Friends Referred</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #5b21b6;">Renewal Impact:</td>
            <td style="padding: 6px 0; color: #166534; font-weight: 600;">{renewalImpactText}</td>
        </tr>
    </table>
</div>

<h3 style="color: #0f172a; margin: 20px 0 8px 0;">How Your Reward Applies:</h3>
<ul style="line-height: 1.7; padding-left: 20px; font-size: 14px; color: #334155;">
    <li>⭐ <strong>Annual Pass:</strong> Your next annual renewal will be discounted by $15.00 ({annualDiscountText}).</li>
    <li>🗓️ <strong>Monthly Pass:</strong> Or if you prefer monthly billing, your payments won't start until <strong>{delayedMonthDate}</strong>!</li>
</ul>

<div style="text-align: center; margin: 28px 0;">
    <a href="{appUrl}/profile" style="background-color: #7c3aed; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">View Referral Rewards</a>
</div>
<p style="font-size: 13px; color: #64748b;">Keep sharing your personal invite link! You can earn an unlimited number of free months for each friend you invite.</p>`,
        variables: [
            { key: "{username}", description: "Username of the referring member", sampleValue: "jordan_reader" },
            { key: "{friendUsername}", description: "Username of the friend who joined", sampleValue: "alex_cinephile" },
            { key: "{totalReferralsCount}", description: "Total converted referrals count", sampleValue: "1" },
            { key: "{renewalImpactText}", description: "Summary of renewal discount", sampleValue: "1 Month Off Next Statement ($15.00 discount)" },
            { key: "{annualDiscountText}", description: "Annual discount calculation", sampleValue: "$165.00 instead of $180.00" },
            { key: "{delayedMonthDate}", description: "Delayed monthly payment date", sampleValue: "February 1, 2027" },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    },
    {
        id: "subscription_renewal_reminder",
        name: "Subscription Renewal & Payment Reminder",
        description: "Sent to members before their annual or monthly subscription renews, including any referral reward credits and discounted totals.",
        triggerEvent: "Triggered prior to annual or monthly subscription renewal, detailing renewal amounts, applied referral credits, and payment methods.",
        category: "PAYMENTS",
        defaultSubject: "🔔 Your DomsHomeLab Membership Renewal Notice ({renewalDate})",
        defaultBody: `<h2>Membership Renewal Notice 🔔</h2>
<p>Hi <strong>{username}</strong>,</p>
<p>Your DomsHomeLab (d281knilb) membership is scheduled for renewal on <strong>{renewalDate}</strong>.</p>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 170px; color: #64748b;">Standard Annual Rate:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{basePrice}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Referral Rewards:</td>
            <td style="padding: 6px 0; color: #16a34a; font-weight: 700;">{referralDiscountText}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Annual Amount Due:</td>
            <td style="padding: 6px 0; color: #15803d; font-weight: 800; font-size: 16px;">{amountDue}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Monthly Alternative:</td>
            <td style="padding: 6px 0; color: #4f46e5; font-weight: 600;">{monthlyAlternativeText}</td>
        </tr>
    </table>
</div>

<p style="font-size: 14px; color: #334155; line-height: 1.6;">
    {referralNoticeDetails}
</p>

<div style="text-align: center; margin: 28px 0;">
    <a href="{appUrl}/profile#billing" style="background-color: #16a34a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">View Payment Details & Memo</a>
</div>
<p style="font-size: 13px; color: #64748b;">Thank you for being a valued member of DomsHomeLab!</p>`,
        variables: [
            { key: "{username}", description: "Username of user", sampleValue: "jordan_reader" },
            { key: "{renewalDate}", description: "Expiration or renewal date", sampleValue: "January 1, 2027" },
            { key: "{basePrice}", description: "Standard base annual price", sampleValue: "$180.00 / year" },
            { key: "{referralDiscountText}", description: "Referral discount summary", sampleValue: "-$15.00 (1 friend referred)" },
            { key: "{amountDue}", description: "Net amount due after referral credits", sampleValue: "$165.00" },
            { key: "{monthlyAlternativeText}", description: "Delayed monthly payment terms", sampleValue: "$15/month starting February 1, 2027" },
            { key: "{referralNoticeDetails}", description: "Detailed referral credit explanation", sampleValue: "You earned 1 free month for referring @alex_cinephile! Your next annual payment is discounted by $15.00 ($165.00 total) or your monthly billing is delayed until February 1, 2027." },
            { key: "{appUrl}", description: "Base URL of DomsHomeLab", sampleValue: "https://portal.example.com" }
        ]
    }
];

export function getDefaultEmailTemplate(id: string): EmailTemplateDefinition | undefined {
    return DEFAULT_EMAIL_TEMPLATES.find(t => t.id === id);
}

/**
 * Standard Responsive Email Container Layout
 */
export function wrapInPortalarrEmailLayout(options: {
    title: string;
    contentHtml: string;
    appUrl?: string;
    actionButton?: { text: string; url: string; color?: string };
}): string {
    const appUrl = options.appUrl || "https://home.domshomelab.com";
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
                    DOMS<span style="color: #6366f1;">HOMELAB</span>
                </span>
            </div>
            <div style="font-size: 11px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;">
                d281knilb Media Server & Dashboard
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
                <p style="margin: 0;">DomsHomeLab • d281knilb Media Server • <a href="${appUrl}" style="color: #6366f1; text-decoration: none; font-weight: 500;">Open Dashboard</a></p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #cbd5e1;">© ${currentYear} DomsHomeLab. All rights reserved.</p>
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
    let subject = defaultDef?.defaultSubject || "DomsHomeLab Notification";
    let body = defaultDef?.defaultBody || "<p>Notification from DomsHomeLab (d281knilb)</p>";

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
        portalName: "DomsHomeLab",
        serverName: "d281knilb",
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
