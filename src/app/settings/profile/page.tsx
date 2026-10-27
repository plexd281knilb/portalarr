"use client";

import { useState, useEffect, useRef } from "react";
import { UnsavedChangesPrompt } from "@/components/ui/unsaved-changes-prompt";
import { getCurrentUser, changeUserPassword } from "@/app/auth-actions";
import { 
    getUserProfileBootstrapAction,
    getUserReferralInfo, 
    getPublicJoinConfig, 
    updateCurrentUserKindleEmail, updateCurrentUserPrimaryEmail,
    getUserNotificationPreferencesAction,
    updateUserNotificationPreferencesAction,
    getUserContentPreferencesAction,
    updateUserContentPreferencesAction,
    requestTierUpgradeAction,
    getUserAllowedPlexLibrariesAction,
    updateUserSelectedPlexLibrariesAction,
    getUserSubAccountsAction,
    createOrUpdateSubAccountAction,
    deleteSubAccountAction,
    getAvailableAddonsAction,
    toggleFreeAddonAction,
    getUserKidsLibraryAccessAction,
    updateUserKidsLibraryAccessAction,
    getUserAudiobooksLibraryAccessAction,
    updateUserAudiobooksLibraryAccessAction
} from "@/app/actions";
import { recheckUserAccessAndPaymentAction } from "@/app/payment-actions";
import { calculateProratedBilling } from "@/lib/prorated-billing";
import { 
    linkMyDiscordAccountAction, 
    unlinkMyDiscordAccountAction, 
    syncMyDiscordRoleAction,
    getDiscordServerInviteUrlAction
} from "@/app/discord-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
    User, Mail, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, 
    MailCheck, Zap, BookOpen, Gift, Copy, Check, Timer, DollarSign, Users, Sparkles, ExternalLink,
    CreditCard, Calendar, AlertCircle, Trash2, RefreshCw, Bell, Shield, Crown, Tv, Film,
    Flame, MessageSquare, Send, CheckCheck, Sliders, Volume2, Lock, Baby, Monitor, FolderCheck,
    CheckSquare, Square, Plus, Edit2, AlertTriangle, Save, Music, Eye, EyeOff, Gamepad2, Link as LinkIcon, Headphones, Server
} from "lucide-react";
import { MediaServerSetupGuideModal } from "@/components/profile/media-server-setup-guide-modal";
import ServerSpeedTest from "@/components/server-speed-test";
import FeatureGuideModal from "@/components/feature-guide-modal";
import PlexSetupGuides from "@/components/plex-setup-guides";
import SuperUserCard from "@/components/super-user-card";
import { PaymentMethodsGrid } from "@/components/payment-methods-grid";
import { UserMediaServersManager } from "@/components/profile/user-media-servers-manager";
import { format, differenceInDays } from "date-fns";

function safeFormatDate(dateVal: any, formatPattern: string, fallback = ""): string {
    if (!dateVal) return fallback;
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return fallback;
        return format(d, formatPattern);
    } catch {
        return fallback;
    }
}

export default function UserProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [referralInfo, setReferralInfo] = useState<any>(null);
    const [paymentConfig, setPaymentConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

    // Check Access & Payment Status State
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [statusSyncMsg, setStatusSyncMsg] = useState("");
    const [statusSyncErr, setStatusSyncErr] = useState("");

    // Change Password State
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passConfirm, setPassConfirm] = useState("");
    const [showPassCurrent, setShowPassCurrent] = useState(false);
    const [showPassNew, setShowPassNew] = useState(false);
    const [showPassConfirm, setShowPassConfirm] = useState(false);
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    // Send-to-Kindle State
    const [kindleEmail, setKindleEmail] = useState("");
    const [bypassKindle, setBypassKindle] = useState(false);
    const [kindleSaving, setKindleSaving] = useState(false);
    const [showEditEmailModal, setShowEditEmailModal] = useState(false);
    const [editEmailInput, setEditEmailInput] = useState("");
    const [editEmailLoading, setEditEmailLoading] = useState(false);
    const [editEmailMsg, setEditEmailMsg] = useState("");
    const [editEmailErr, setEditEmailErr] = useState("");
    const [kindleMsg, setKindleMsg] = useState("");
    const [kindleErr, setKindleErr] = useState("");
    const [isMediaServersDirty, setIsMediaServersDirty] = useState(false);

    // Notification Preferences State
    const [notifPrefs, setNotifPrefs] = useState({
        emailRequestApproved: true,
        emailMediaReady: true,
        emailNewContent: true,
        emailAnnouncements: true,
        emailSupportTickets: true,
        emailSubscriptionReminders: true,
        emailReferralRewards: true,
        discordMediaReady: false,
        discordAnnouncements: false,
        discordWebhookUrl: ""
    });
    const [savingNotif, setSavingNotif] = useState(false);
    const [notifMsg, setNotifMsg] = useState("");
    const [notifErr, setNotifErr] = useState("");

    // Content Safety Preferences State
    const [selectedSafetyUserId, setSelectedSafetyUserId] = useState<string>("");
    const [loadingSafetyPrefs, setLoadingSafetyPrefs] = useState(false);
    const [contentPrefs, setContentPrefs] = useState({
        maxContentRating: "ALL",
        hideLeavingSoon: false,
        hideHorror: false,
        hideNsfw: false,
        hideGore: false,
        excludedGenresList: [] as string[],
        excludedTagsList: [] as string[]
    });
    const [savingContent, setSavingContent] = useState(false);
    const [contentMsg, setContentMsg] = useState("");
    const [contentErr, setContentErr] = useState("");

    // Membership Upgrade Modal State
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [targetTier, setTargetTier] = useState("TIER_2_VIP");
    const [upgradeNote, setUpgradeNote] = useState("");
    const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
    const [upgradeSuccessMsg, setUpgradeSuccessMsg] = useState("");
    const [upgradeErrMsg, setUpgradeErrMsg] = useState("");

    // Shared Plex Libraries State
    const [allowedLibraries, setAllowedLibraries] = useState<string[]>([]);
    const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
    const [serverLibraries, setServerLibraries] = useState<any[]>([]);
    const [savingLibraries, setSavingLibraries] = useState(false);
    const [libMsg, setLibMsg] = useState("");
    const [libErr, setLibErr] = useState("");

    // Household Sub-Accounts State
    const [subAccounts, setSubAccounts] = useState<any[]>([]);
    const [subLimits, setSubLimits] = useState({ includedLivingRooms: 1, includedKids: 1, totalActive: 0 });
    const [subModalOpen, setSubModalOpen] = useState(false);
    const [subEditingId, setSubEditingId] = useState<string | null>(null);
    const [subType, setSubType] = useState<"LIVING_ROOM" | "KID">("LIVING_ROOM");
    const [subLabel, setSubLabel] = useState("");
    const [subPlexHandle, setSubPlexHandle] = useState("");
    const [savingSub, setSavingSub] = useState(false);
    const [subModalMsg, setSubModalMsg] = useState("");
    const [subModalErr, setSubModalErr] = useState("");
    const [deleteSubConfirmId, setDeleteSubConfirmId] = useState<string | null>(null);
    const [deletingSub, setDeletingSub] = useState(false);
    const [deleteSubErr, setDeleteSubErr] = useState("");

    // Account Add-Ons State
    const [addonsCatalog, setAddonsCatalog] = useState<any[]>([]);
    const [userEnabledAddons, setUserEnabledAddons] = useState<string[]>([]);
    const [togglingAddonId, setTogglingAddonId] = useState<string | null>(null);
    const [addonGuideModalOpen, setAddonGuideModalOpen] = useState(false);
    const [addonGuideType, setAddonGuideType] = useState<"JELLYFIN" | "EMBY">("JELLYFIN");
    const [addonMsg, setAddonMsg] = useState("");
    const [addonErr, setAddonErr] = useState("");

    // Kids Library Access State
    const [hasKidsAccess, setHasKidsAccess] = useState(false);
    const [kidsLibraries, setKidsLibraries] = useState<any[]>([]);
    const [savingKidsAccess, setSavingKidsAccess] = useState(false);
    const [kidsAccessMsg, setKidsAccessMsg] = useState("");
    const [kidsAccessErr, setKidsAccessErr] = useState("");

    // Audiobooks Library Access State
    const [hasAudiobooksAccess, setHasAudiobooksAccess] = useState(false);
    const [audiobookLibraries, setAudiobookLibraries] = useState<any[]>([]);
    const [savingAudiobooksAccess, setSavingAudiobooksAccess] = useState(false);
    const [audiobooksAccessMsg, setAudiobooksAccessMsg] = useState("");
    const [audiobooksAccessErr, setAudiobooksAccessErr] = useState("");

    // Discord Integration State
    const [discordInput, setDiscordInput] = useState("");
    const [discordInviteUrl, setDiscordInviteUrl] = useState("");
    const [discordLoading, setDiscordLoading] = useState(false);
    const [discordSuccessMsg, setDiscordSuccessMsg] = useState("");
    const [discordErrMsg, setDiscordErrMsg] = useState("");

    const isTrial = (user?.status === "TRIAL" || user?.membershipTier === "TRIAL") && user?.status !== "APPROVED" && user?.role !== "ADMIN";

    const initialProfileRef = useRef<{
        kindleEmail: string;
        bypassKindle: boolean;
        notifPrefs: typeof notifPrefs;
        contentPrefs: typeof contentPrefs;
        selectedLibraries: string[];
    } | null>(null);

    const initialSafetyPrefsRef = useRef<{
        targetUserId: string;
        prefs: typeof contentPrefs;
    } | null>(null);

    const areProfileArraysEqual = (a: string[] = [], b: string[] = []) => {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, idx) => val === sortedB[idx]);
    };

    const isKindleDirty = Boolean(initialProfileRef.current && (
        bypassKindle !== initialProfileRef.current.bypassKindle ||
        (!bypassKindle && kindleEmail.trim() !== initialProfileRef.current.kindleEmail.trim())
    ));

    const isNotifDirty = Boolean(initialProfileRef.current && (
        notifPrefs.emailRequestApproved !== initialProfileRef.current.notifPrefs.emailRequestApproved ||
        notifPrefs.emailMediaReady !== initialProfileRef.current.notifPrefs.emailMediaReady ||
        notifPrefs.emailSubscriptionReminders !== initialProfileRef.current.notifPrefs.emailSubscriptionReminders ||
        notifPrefs.emailAnnouncements !== initialProfileRef.current.notifPrefs.emailAnnouncements ||
        notifPrefs.emailSupportTickets !== initialProfileRef.current.notifPrefs.emailSupportTickets ||
        notifPrefs.emailReferralRewards !== initialProfileRef.current.notifPrefs.emailReferralRewards
    ));

    const isContentDirty = false;

    const isSectionAllowed = (sec: any, server?: any) => {
        if (isTrial) {
            const sName = (server?.serverName || "").toLowerCase();
            const secTitle = (sec?.title || "").toLowerCase();
            if (sName.includes("kid") || sName.includes("backup") || secTitle.includes("kid")) {
                return false;
            }
        }
        if (user?.role === "ADMIN") return true;
        if (!allowedLibraries || allowedLibraries.length === 0) return true;
        const secId = String(sec?.id ?? "");
        const secKey = String(sec?.key ?? "");
        const uniqueKey = sec?.uniqueKey || (server?.serverId ? `${server.serverId}:${secId}` : "");
        const uniqueServerKey = server?.serverId && secKey ? `${server.serverId}:${secKey}` : "";
        const title = String(sec?.title ?? "").toLowerCase().trim();

        return (
            allowedLibraries.includes(uniqueKey) ||
            allowedLibraries.includes(uniqueServerKey) ||
            allowedLibraries.includes(secId) ||
            allowedLibraries.includes(secKey) ||
            allowedLibraries.some(ak => {
                const akClean = String(ak).trim();
                return (
                    akClean === secId ||
                    akClean === secKey ||
                    akClean.endsWith(`:${secId}`) ||
                    akClean.endsWith(`:${secKey}`) ||
                    akClean.toLowerCase() === title
                );
            })
        );
    };

    const isSectionSelected = (sec: any, server?: any) => {
        const secId = String(sec?.id ?? "");
        const secKey = String(sec?.key ?? "");
        const uniqueKey = sec?.uniqueKey || (server?.serverId ? `${server.serverId}:${secId}` : "");
        const uniqueServerKey = server?.serverId && secKey ? `${server.serverId}:${secKey}` : "";
        const title = String(sec?.title ?? "").toLowerCase().trim();

        return (
            selectedLibraries.includes(uniqueKey) ||
            selectedLibraries.includes(uniqueServerKey) ||
            selectedLibraries.includes(secId) ||
            selectedLibraries.includes(secKey) ||
            selectedLibraries.some(sk => {
                const skClean = String(sk).trim();
                return (
                    skClean === secId ||
                    skClean === secKey ||
                    skClean.endsWith(`:${secId}`) ||
                    skClean.endsWith(`:${secKey}`) ||
                    skClean.toLowerCase() === title
                );
            })
        );
    };

    const isInitialSectionSelected = (sec: any, server?: any) => {
        if (!initialProfileRef.current) return false;
        const initKeys = initialProfileRef.current.selectedLibraries;
        const secId = String(sec?.id ?? "");
        const secKey = String(sec?.key ?? "");
        const uniqueKey = sec?.uniqueKey || (server?.serverId ? `${server.serverId}:${secId}` : "");
        const uniqueServerKey = server?.serverId && secKey ? `${server.serverId}:${secKey}` : "";
        const title = String(sec?.title ?? "").toLowerCase().trim();

        return (
            initKeys.includes(uniqueKey) ||
            initKeys.includes(uniqueServerKey) ||
            initKeys.includes(secId) ||
            initKeys.includes(secKey) ||
            initKeys.some(sk => {
                const skClean = String(sk).trim();
                return (
                    skClean === secId ||
                    skClean === secKey ||
                    skClean.endsWith(`:${secId}`) ||
                    skClean.endsWith(`:${secKey}`) ||
                    skClean.toLowerCase() === title
                );
            })
        );
    };

    const isLibrariesDirty = Boolean(
        initialProfileRef.current && (
            serverLibraries.length > 0
                ? serverLibraries.some(srv => {
                    if (isTrial) {
                        const sName = (srv.serverName || "").toLowerCase();
                        if (sName.includes("kid") || sName.includes("backup")) return false;
                    }
                    return (srv.sections || []).some((sec: any) => {
                        if (!isSectionAllowed(sec, srv)) return false;
                        return isSectionSelected(sec, srv) !== isInitialSectionSelected(sec, srv);
                    });
                })
                : !areProfileArraysEqual(selectedLibraries, initialProfileRef.current.selectedLibraries)
        )
    );

    const unsavedSections: string[] = [];
    if (isKindleDirty) unsavedSections.push("Send-to-Kindle");
    if (isLibrariesDirty) unsavedSections.push("Shared Plex Libraries");
    if (isNotifDirty) unsavedSections.push("Notification Preferences");
    if (isContentDirty) unsavedSections.push("Content Safety");
    if (isMediaServersDirty) unsavedSections.push("Media Servers & Allowed Libraries");

    const hasUnsavedChanges = unsavedSections.length > 0;

    const handleDiscardAll = () => {
        if (!initialProfileRef.current) return;
        const init = initialProfileRef.current;
        setKindleEmail(init.kindleEmail);
        setBypassKindle(init.bypassKindle);
        setNotifPrefs({ ...init.notifPrefs });
        if (initialSafetyPrefsRef.current) {
            setContentPrefs({
                ...initialSafetyPrefsRef.current.prefs,
                excludedGenresList: [...initialSafetyPrefsRef.current.prefs.excludedGenresList],
                excludedTagsList: [...initialSafetyPrefsRef.current.prefs.excludedTagsList]
            });
        } else {
            setContentPrefs({
                ...init.contentPrefs,
                excludedGenresList: [...init.contentPrefs.excludedGenresList],
                excludedTagsList: [...init.contentPrefs.excludedTagsList]
            });
        }
        setSelectedLibraries([...init.selectedLibraries]);
    };

    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedHandle(key);
        setTimeout(() => setCopiedHandle(null), 2000);
    };

    const handleRecheckStatus = async () => {
        setCheckingStatus(true);
        setStatusSyncMsg("");
        setStatusSyncErr("");
        try {
            const res = await recheckUserAccessAndPaymentAction();
            if (res.success) {
                if (res.user) setUser(res.user);
                setStatusSyncMsg(res.message || "Payment status and access verification complete!");
                const [ref, libRes, subRes, addRes, kidsLibRes, audioLibRes] = await Promise.all([
                    getUserReferralInfo(),
                    getUserAllowedPlexLibrariesAction(),
                    getUserSubAccountsAction(),
                    getAvailableAddonsAction(),
                    getUserKidsLibraryAccessAction(),
                    getUserAudiobooksLibraryAccessAction()
                ]);
                if (ref?.success) setReferralInfo(ref);
                if (libRes?.success) {
                    setAllowedLibraries(libRes.allowedKeys || []);
                    setSelectedLibraries(libRes.selectedKeys || []);
                    setServerLibraries(libRes.servers || []);
                    if (initialProfileRef.current) {
                        initialProfileRef.current.selectedLibraries = libRes.selectedKeys || [];
                    }
                }
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }
                if (addRes?.success) {
                    setAddonsCatalog(addRes.catalog || []);
                    setUserEnabledAddons(addRes.userEnabledAddons || []);
                }
                if (kidsLibRes?.success) {
                    setHasKidsAccess(Boolean(kidsLibRes.hasKidsAccess));
                    setKidsLibraries(kidsLibRes.kidsLibraries || []);
                }
                if (audioLibRes?.success) {
                    setHasAudiobooksAccess(Boolean(audioLibRes.hasAudiobooksAccess));
                    setAudiobookLibraries(audioLibRes.audiobookLibraries || []);
                }
                setTimeout(() => setStatusSyncMsg(""), 6000);
            } else {
                setStatusSyncErr(res.error || "Failed to sync payment status.");
            }
        } catch (err: any) {
            setStatusSyncErr(err.message || "Error checking access status");
        } finally {
            setCheckingStatus(false);
        }
    };

    useEffect(() => {
        async function fetchProfile() {
            setLoading(true);
            try {
                const bootstrap = await getUserProfileBootstrapAction();
                if (!bootstrap || !bootstrap.success || !bootstrap.data) {
                    const u = await getCurrentUser();
                    if (!u) {
                        window.location.href = "/login";
                        return;
                    }
                    setUser(u);
                    return;
                }

                const d = bootstrap.data;
                const u = d.user;
                if (!u) {
                    window.location.href = "/login";
                    return;
                }
                if (u && u.role !== "ADMIN" && (u.status === "EXPIRED" || u.status === "PENDING" || u.status === "REJECTED" || u.status === "SUSPENDED")) {
                    window.location.href = "/pending";
                    return;
                }
                setUser(u);
                if (u?.kindleEmail) {
                    if (u.kindleEmail === "DIRECT_DOWNLOAD") {
                        setBypassKindle(true);
                        setKindleEmail("");
                    } else {
                        setKindleEmail(u.kindleEmail);
                    }
                }
                if (d.referralInfo) {
                    setReferralInfo(d.referralInfo);
                }
                if (d.paymentConfig) {
                    setPaymentConfig(d.paymentConfig);
                    if (d.paymentConfig.discordInviteUrl) {
                        setDiscordInviteUrl(d.paymentConfig.discordInviteUrl);
                    }
                }
                if (d.discordInviteUrl) {
                    setDiscordInviteUrl(d.discordInviteUrl);
                }

                // Load Notification Preferences
                if (d.notifPrefs) {
                    setNotifPrefs({
                        emailRequestApproved: Boolean(d.notifPrefs.emailRequestApproved ?? true),
                        emailMediaReady: Boolean(d.notifPrefs.emailMediaReady ?? true),
                        emailNewContent: Boolean(d.notifPrefs.emailNewContent ?? true),
                        emailAnnouncements: Boolean(d.notifPrefs.emailAnnouncements ?? true),
                        emailSupportTickets: Boolean(d.notifPrefs.emailSupportTickets ?? true),
                        emailSubscriptionReminders: Boolean(d.notifPrefs.emailSubscriptionReminders ?? true),
                        emailReferralRewards: Boolean(d.notifPrefs.emailReferralRewards ?? true),
                        discordMediaReady: Boolean(d.notifPrefs.discordMediaReady),
                        discordAnnouncements: Boolean(d.notifPrefs.discordAnnouncements),
                        discordWebhookUrl: d.notifPrefs.discordWebhookUrl || ""
                    });
                }

                // Load Content Preferences
                if (d.contentPrefs) {
                    setContentPrefs({
                        maxContentRating: d.contentPrefs.maxContentRating || "ALL",
                        hideLeavingSoon: Boolean(d.contentPrefs.hideLeavingSoon),
                        hideHorror: Boolean(d.contentPrefs.hideHorror),
                        hideNsfw: Boolean(d.contentPrefs.hideNsfw),
                        hideGore: Boolean(d.contentPrefs.hideGore),
                        excludedGenresList: d.contentPrefs.excludedGenresList || [],
                        excludedTagsList: d.contentPrefs.excludedTagsList || []
                    });
                }

                // Load Shared Plex Libraries
                setAllowedLibraries(d.allowedLibraries || []);
                setSelectedLibraries(d.selectedLibraries || []);
                setServerLibraries(d.serverLibraries || []);

                // Load Household Sub-Accounts
                setSubAccounts(d.subAccounts || []);
                if (d.subLimits) setSubLimits(d.subLimits);

                // Load Add-ons Catalog
                setAddonsCatalog(d.addonsCatalog || []);
                setUserEnabledAddons(d.userEnabledAddons || []);

                // Load Kids Library Access Status
                setHasKidsAccess(Boolean(d.hasKidsAccess));
                setKidsLibraries(d.kidsLibraries || []);

                // Load Audiobooks Library Access Status
                setHasAudiobooksAccess(Boolean(d.hasAudiobooksAccess));
                setAudiobookLibraries(d.audiobookLibraries || []);

                initialProfileRef.current = {
                    kindleEmail: u?.kindleEmail === "DIRECT_DOWNLOAD" ? "" : (u?.kindleEmail || ""),
                    bypassKindle: u?.kindleEmail === "DIRECT_DOWNLOAD",
                    notifPrefs: {
                        emailRequestApproved: Boolean(d.notifPrefs?.emailRequestApproved ?? true),
                        emailMediaReady: Boolean(d.notifPrefs?.emailMediaReady ?? true),
                        emailNewContent: Boolean(d.notifPrefs?.emailNewContent ?? true),
                        emailAnnouncements: Boolean(d.notifPrefs?.emailAnnouncements ?? true),
                        emailSupportTickets: Boolean(d.notifPrefs?.emailSupportTickets ?? true),
                        emailSubscriptionReminders: Boolean(d.notifPrefs?.emailSubscriptionReminders ?? true),
                        emailReferralRewards: Boolean(d.notifPrefs?.emailReferralRewards ?? true),
                        discordMediaReady: Boolean(d.notifPrefs?.discordMediaReady),
                        discordAnnouncements: Boolean(d.notifPrefs?.discordAnnouncements),
                        discordWebhookUrl: d.notifPrefs?.discordWebhookUrl || ""
                    },
                    contentPrefs: {
                        maxContentRating: d.contentPrefs?.maxContentRating || "ALL",
                        hideLeavingSoon: Boolean(d.contentPrefs?.hideLeavingSoon),
                        hideHorror: Boolean(d.contentPrefs?.hideHorror),
                        hideNsfw: Boolean(d.contentPrefs?.hideNsfw),
                        hideGore: Boolean(d.contentPrefs?.hideGore),
                        excludedGenresList: d.contentPrefs?.excludedGenresList || [],
                        excludedTagsList: d.contentPrefs?.excludedTagsList || []
                    },
                    selectedLibraries: d.selectedLibraries || []
                };

                initialSafetyPrefsRef.current = {
                    targetUserId: u?.id || "",
                    prefs: {
                        maxContentRating: d.contentPrefs?.maxContentRating || "ALL",
                        hideLeavingSoon: Boolean(d.contentPrefs?.hideLeavingSoon),
                        hideHorror: Boolean(d.contentPrefs?.hideHorror),
                        hideNsfw: Boolean(d.contentPrefs?.hideNsfw),
                        hideGore: Boolean(d.contentPrefs?.hideGore),
                        excludedGenresList: d.contentPrefs?.excludedGenresList || [],
                        excludedTagsList: d.contentPrefs?.excludedTagsList || []
                    }
                };
            } catch (e) {
                console.error("fetchProfile error:", e);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    // Scroll to target hash once profile data finishes loading and cards mount into DOM
    useEffect(() => {
        if (!loading && typeof window !== "undefined") {
            const handleHashScroll = () => {
                const hash = window.location.hash;
                if (!hash) return;
                const targetId = hash.replace(/^#/, "");
                const el = document.getElementById(targetId);
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            };

            const t = setTimeout(handleHashScroll, 200);
            window.addEventListener("hashchange", handleHashScroll);
            return () => {
                clearTimeout(t);
                window.removeEventListener("hashchange", handleHashScroll);
            };
        }
    }, [loading]);

    // --- LIBRARY PREFERENCE HANDLERS ---
    const handleToggleLibrary = (sec: any, server?: any) => {
        const isSelected = isSectionSelected(sec, server);
        const secId = String(sec?.id ?? "");
        const secKey = String(sec?.key ?? "");
        const uniqueKey = sec?.uniqueKey || (server?.serverId ? `${server.serverId}:${secId}` : "");
        const uniqueServerKey = server?.serverId && secKey ? `${server.serverId}:${secKey}` : "";
        const targetKey = uniqueKey || secId || secKey;

        if (isSelected) {
            setSelectedLibraries(prev => prev.filter(k => 
                k !== targetKey && 
                k !== uniqueKey && 
                k !== uniqueServerKey && 
                k !== secId && 
                k !== secKey && 
                !k.endsWith(`:${secId}`) && 
                !k.endsWith(`:${secKey}`)
            ));
        } else {
            setSelectedLibraries(prev => Array.from(new Set([...prev, targetKey])));
        }
    };

    const handleSelectAllLibraries = () => {
        const allKeys: string[] = [];
        for (const srv of serverLibraries) {
            for (const sec of srv.sections || []) {
                if (isSectionAllowed(sec, srv)) {
                    allKeys.push(sec.uniqueKey || `${srv.serverId}:${sec.id}`);
                }
            }
        }
        setSelectedLibraries(allKeys);
    };

    const handleDeselectAllLibraries = () => {
        setSelectedLibraries([]);
    };

    const handleSaveLibrariesDirect = async (): Promise<boolean> => {
        setSavingLibraries(true);
        setLibMsg("");
        setLibErr("");
        try {
            const res = await updateUserSelectedPlexLibrariesAction(selectedLibraries);
            if (res.success) {
                setLibMsg(res.message || "Your shared Plex library preferences have been saved and synced to Plex!");
                const keys = res.selectedKeys || [...selectedLibraries];
                setSelectedLibraries(keys);
                if (initialProfileRef.current) {
                    initialProfileRef.current.selectedLibraries = [...keys];
                }
                setTimeout(() => setLibMsg(""), 5000);
                return true;
            } else {
                setLibErr(res.error || "Failed to save library preferences.");
                return false;
            }
        } catch (err: any) {
            setLibErr(err.message || "Error saving library preferences");
            return false;
        } finally {
            setSavingLibraries(false);
        }
    };

    const handleSaveLibraries = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSaveLibrariesDirect();
    };

    // --- SUB-ACCOUNT HANDLERS ---
    const handleOpenAddSubAccount = (type: "LIVING_ROOM" | "KID") => {
        setSubEditingId(null);
        setSubType(type);
        setSubLabel(type === "KID" ? "Kids Account" : "Living Room TV");
        setSubPlexHandle("");
        setSubModalMsg("");
        setSubModalErr("");
        setSubModalOpen(true);
    };

    const handleOpenEditSubAccount = (sub: any) => {
        setSubEditingId(sub.id);
        setSubType(sub.accountType === "KID" ? "KID" : "LIVING_ROOM");
        setSubLabel(sub.subAccountLabel || "");
        setSubPlexHandle(sub.plexUsername || sub.plexEmail || "");
        setSubModalMsg("");
        setSubModalErr("");
        setSubModalOpen(true);
    };

    const handleSaveSubAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSub(true);
        setSubModalMsg("");
        setSubModalErr("");
        try {
            const res = await createOrUpdateSubAccountAction({
                id: subEditingId || undefined,
                type: subType,
                label: subLabel,
                plexUsernameOrEmail: subPlexHandle
            });
            if (res.success) {
                setSubModalMsg(res.message || "Sub-account saved successfully!");
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }
                setTimeout(() => {
                    setSubModalOpen(false);
                    setSubModalMsg("");
                }, 1500);
            } else {
                setSubModalErr(res.error || "Failed to save sub-account");
            }
        } catch (err: any) {
            setSubModalErr(err.message || "Error saving sub-account");
        } finally {
            setSavingSub(false);
        }
    };

    const handleDeleteSubAccount = async (id: string) => {
        setDeletingSub(true);
        setDeleteSubErr("");
        try {
            const res = await deleteSubAccountAction(id);
            if (res.success) {
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }
                if (selectedSafetyUserId === id) {
                    handleSelectSafetyAccount(user?.id);
                }
                setDeleteSubConfirmId(null);
            } else {
                setDeleteSubErr(res.error || "Failed to remove sub-account");
            }
        } catch (err: any) {
            setDeleteSubErr(err.message || "Failed to delete sub-account");
        } finally {
            setDeletingSub(false);
        }
    };

    // --- ADD-ON HANDLER ---
    const handleToggleFreeAddon = async (addonId: string, enabled: boolean) => {
        setTogglingAddonId(addonId);
        setAddonMsg("");
        setAddonErr("");
        try {
            const res = await toggleFreeAddonAction(addonId, enabled);
            if (res.success) {
                setUserEnabledAddons(res.enabledAddons || []);
                setAddonMsg(res.message || "Add-on preference updated!");
                if (enabled && (addonId === "jellyfin_access" || addonId === "emby_access")) {
                    setAddonGuideType(addonId === "jellyfin_access" ? "JELLYFIN" : "EMBY");
                    setAddonGuideModalOpen(true);
                }
                if (addonId === "audiobooks") {
                    const [audioLibRes, libRes] = await Promise.all([
                        getUserAudiobooksLibraryAccessAction(),
                        getUserAllowedPlexLibrariesAction()
                    ]);
                    if (audioLibRes?.success) {
                        setHasAudiobooksAccess(Boolean(audioLibRes.hasAudiobooksAccess));
                        setAudiobookLibraries(audioLibRes.audiobookLibraries || []);
                    }
                    if (libRes?.success) {
                        setAllowedLibraries(libRes.allowedKeys || []);
                        setSelectedLibraries(libRes.selectedKeys || []);
                        setServerLibraries(libRes.servers || []);
                    }
                }
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success && subRes.limits) {
                    setSubLimits(subRes.limits);
                }
                setTimeout(() => setAddonMsg(""), 4000);
            } else {
                setAddonErr(res.error || "Failed to update add-on");
                setTimeout(() => setAddonErr(""), 5000);
            }
        } catch (err: any) {
            setAddonErr(err.message || "Error updating add-on");
            setTimeout(() => setAddonErr(""), 5000);
        } finally {
            setTogglingAddonId(null);
        }
    };

    const handleUpdateKindleEmail = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setKindleSaving(true);
        setKindleMsg("");
        setKindleErr("");

        const targetEmail = bypassKindle ? "DIRECT_DOWNLOAD" : kindleEmail.trim();
        const res = await updateCurrentUserKindleEmail(targetEmail);
        setKindleSaving(false);

        if (res?.error) {
            setKindleErr(res.error);
        } else if (res?.success) {
            setKindleMsg(bypassKindle 
                ? "Direct download & in-browser reading selected! Book Library access granted."
                : (res.message || "Your Send-to-Kindle email address has been updated successfully!"));
            setUser((prev: any) => ({ ...prev, kindleEmail: targetEmail }));
            if (!bypassKindle) {
                setKindleEmail(res.kindleEmail || kindleEmail.trim());
            } else {
                setKindleEmail("");
            }
            if (initialProfileRef.current) {
                initialProfileRef.current.kindleEmail = bypassKindle ? "" : (res.kindleEmail || kindleEmail.trim());
                initialProfileRef.current.bypassKindle = bypassKindle;
            }
            setTimeout(() => setKindleMsg(""), 5000);
        }
    };

    const handleSaveUserPrimaryEmail = async () => {
        if (!editEmailInput || !editEmailInput.includes("@")) {
            setEditEmailErr("Please enter a valid email address.");
            return;
        }
        setEditEmailLoading(true);
        setEditEmailMsg("");
        setEditEmailErr("");
        try {
            const res = await updateCurrentUserPrimaryEmail(editEmailInput);
            if (res.success) {
                setEditEmailMsg(res.message || "Email updated successfully!");
                setUser((prev: any) => ({ ...prev, email: editEmailInput.trim().toLowerCase() }));
                setTimeout(() => {
                    setShowEditEmailModal(false);
                    setEditEmailMsg("");
                }, 1200);
            } else {
                setEditEmailErr(res.error || "Failed to update email.");
            }
        } catch (e: any) {
            setEditEmailErr(e.message || "Failed to update email.");
        } finally {
            setEditEmailLoading(false);
        }
    };

    const handleClearKindleEmail = async () => {
        setKindleSaving(true);
        setKindleMsg("");
        setKindleErr("");

        const res = await updateCurrentUserKindleEmail("");
        setKindleSaving(false);

        if (res?.error) {
            setKindleErr(res.error);
        } else if (res?.success) {
            setKindleMsg(res.message || "Your Send-to-Kindle email address has been cleared.");
            setUser((prev: any) => ({ ...prev, kindleEmail: "" }));
            setKindleEmail("");
            if (initialProfileRef.current) {
                initialProfileRef.current.kindleEmail = "";
                initialProfileRef.current.bypassKindle = false;
            }
        }
    };

    const handleToggleKidsLibraryAccess = async (enable: boolean) => {
        setSavingKidsAccess(true);
        setKidsAccessMsg("");
        setKidsAccessErr("");
        try {
            const res = await updateUserKidsLibraryAccessAction(enable);
            if (res.success) {
                setHasKidsAccess(enable);
                setKidsAccessMsg(res.message || "Kids library access updated successfully.");
                setTimeout(() => setKidsAccessMsg(""), 5000);
                const updated = await getUserKidsLibraryAccessAction();
                if (updated?.success) {
                    setHasKidsAccess(Boolean(updated.hasKidsAccess));
                    setKidsLibraries(updated.kidsLibraries || []);
                }
            } else {
                setKidsAccessErr(res.error || "Failed to update kids library access.");
            }
        } catch (e: any) {
            setKidsAccessErr(e.message || "Error updating kids library access");
        } finally {
            setSavingKidsAccess(false);
        }
    };

    const handleToggleAudiobooksLibraryAccess = async (enable: boolean) => {
        setSavingAudiobooksAccess(true);
        setAudiobooksAccessMsg("");
        setAudiobooksAccessErr("");
        try {
            const res = await updateUserAudiobooksLibraryAccessAction(enable);
            if (res.success) {
                setHasAudiobooksAccess(enable);
                setAudiobooksAccessMsg(res.message || "Audiobooks library access updated successfully.");
                setTimeout(() => setAudiobooksAccessMsg(""), 5000);
                const [updated, addRes, libRes] = await Promise.all([
                    getUserAudiobooksLibraryAccessAction(),
                    getAvailableAddonsAction(),
                    getUserAllowedPlexLibrariesAction()
                ]);
                if (updated?.success) {
                    setHasAudiobooksAccess(Boolean(updated.hasAudiobooksAccess));
                    setAudiobookLibraries(updated.audiobookLibraries || []);
                }
                if (addRes?.success) {
                    setUserEnabledAddons(addRes.userEnabledAddons || []);
                }
                if (libRes?.success) {
                    setAllowedLibraries(libRes.allowedKeys || []);
                    setSelectedLibraries(libRes.selectedKeys || []);
                    setServerLibraries(libRes.servers || []);
                }
            } else {
                setAudiobooksAccessErr(res.error || "Failed to update audiobooks library access.");
            }
        } catch (e: any) {
            setAudiobooksAccessErr(e.message || "Error updating audiobooks library access");
        } finally {
            setSavingAudiobooksAccess(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPassMsg("");
        setPassErr("");

        if (!passCurrent) {
            setPassErr("Please enter your current password.");
            return;
        }
        if (!passNew) {
            setPassErr("Please enter a new password.");
            return;
        }
        if (passNew.length < 6) {
            setPassErr("New password must be at least 6 characters long.");
            return;
        }
        if (passNew !== passConfirm) {
            setPassErr("New passwords do not match. Please re-enter.");
            return;
        }

        setPassLoading(true);
        const formData = new FormData();
        formData.append("currentPassword", passCurrent);
        formData.append("newPassword", passNew);

        const res = await changeUserPassword(formData);
        setPassLoading(false);

        if (res?.error) {
            setPassErr(res.error);
        } else if (res?.success) {
            setPassMsg(res.message || "Your password has been updated successfully!");
            setPassCurrent("");
            setPassNew("");
            setPassConfirm("");
            setTimeout(() => setPassMsg(""), 5000);
        }
    };

    const handleSaveNotificationsDirect = async (): Promise<boolean> => {
        setSavingNotif(true);
        setNotifMsg("");
        setNotifErr("");
        try {
            const res = await updateUserNotificationPreferencesAction(notifPrefs);
            if (res.success) {
                setNotifMsg(res.message || "Notification preferences saved!");
                if (initialProfileRef.current) {
                    initialProfileRef.current.notifPrefs = { ...notifPrefs };
                }
                setNotifPrefs(prev => ({ ...prev }));
                setTimeout(() => setNotifMsg(""), 4000);
                return true;
            } else {
                setNotifErr(res.error || "Failed to save preferences");
                return false;
            }
        } catch (err: any) {
            setNotifErr(err.message || "Error saving preferences");
            return false;
        } finally {
            setSavingNotif(false);
        }
    };

    const handleSaveNotifications = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSaveNotificationsDirect();
    };

    const handleSelectSafetyAccount = async (targetId: string) => {
        const effectiveId = targetId || user?.id || "";
        setSelectedSafetyUserId(effectiveId);
        setLoadingSafetyPrefs(true);
        setContentMsg("");
        setContentErr("");
        try {
            const contentRes = await getUserContentPreferencesAction(effectiveId);
            if (contentRes?.success && contentRes.preferences) {
                const loaded = {
                    maxContentRating: contentRes.preferences.maxContentRating || "ALL",
                    hideLeavingSoon: Boolean(contentRes.preferences.hideLeavingSoon),
                    hideHorror: Boolean(contentRes.preferences.hideHorror),
                    hideNsfw: Boolean(contentRes.preferences.hideNsfw),
                    hideGore: Boolean(contentRes.preferences.hideGore),
                    excludedGenresList: contentRes.preferences.excludedGenresList || [],
                    excludedTagsList: contentRes.preferences.excludedTagsList || []
                };
                setContentPrefs(loaded);
                initialSafetyPrefsRef.current = {
                    targetUserId: effectiveId,
                    prefs: {
                        ...loaded,
                        excludedGenresList: [...loaded.excludedGenresList],
                        excludedTagsList: [...loaded.excludedTagsList]
                    }
                };
            } else if (contentRes?.error) {
                setContentErr(contentRes.error);
            }
        } catch (err: any) {
            setContentErr(err.message || "Failed to load preferences for selected account");
        } finally {
            setLoadingSafetyPrefs(false);
        }
    };

    const handleSaveContentSafetyDirect = async (): Promise<boolean> => {
        setSavingContent(true);
        setContentMsg("");
        setContentErr("");
        try {
            const targetId = selectedSafetyUserId || user?.id;
            const res = await updateUserContentPreferencesAction({
                targetUserId: targetId,
                maxContentRating: contentPrefs.maxContentRating,
                hideLeavingSoon: contentPrefs.hideLeavingSoon,
                hideHorror: contentPrefs.hideHorror,
                hideNsfw: contentPrefs.hideNsfw,
                hideGore: contentPrefs.hideGore,
                excludedGenres: contentPrefs.excludedGenresList,
                excludedTags: contentPrefs.excludedTagsList
            });
            if (res.success) {
                const targetSub = subAccounts.find(s => s.id === targetId);
                const targetName = targetSub 
                    ? `"${targetSub.subAccountLabel || (targetSub.accountType === "KID" ? "Kids Account" : "Living Room")}"`
                    : "Primary Account";
                setContentMsg(`Content safety preferences saved for ${targetName}!`);
                initialSafetyPrefsRef.current = {
                    targetUserId: targetId,
                    prefs: {
                        ...contentPrefs,
                        excludedGenresList: [...contentPrefs.excludedGenresList],
                        excludedTagsList: [...contentPrefs.excludedTagsList]
                    }
                };
                if (initialProfileRef.current && (!selectedSafetyUserId || selectedSafetyUserId === user?.id)) {
                    initialProfileRef.current.contentPrefs = {
                        ...contentPrefs,
                        excludedGenresList: [...contentPrefs.excludedGenresList],
                        excludedTagsList: [...contentPrefs.excludedTagsList]
                    };
                }
                setContentPrefs(prev => ({
                    ...prev,
                    excludedGenresList: [...prev.excludedGenresList],
                    excludedTagsList: [...prev.excludedTagsList]
                }));
                setTimeout(() => setContentMsg(""), 4000);
                return true;
            } else {
                setContentErr(res.error || "Failed to save preferences");
                return false;
            }
        } catch (err: any) {
            setContentErr(err.message || "Error saving preferences");
            return false;
        } finally {
            setSavingContent(false);
        }
    };

    const handleSaveContentSafety = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSaveContentSafetyDirect();
    };

    const [savingAllDirty, setSavingAllDirty] = useState(false);
    const handleSaveAllDirty = async () => {
        setSavingAllDirty(true);
        try {
            const promises: Promise<any>[] = [];
            if (isKindleDirty) promises.push(handleUpdateKindleEmail());
            if (isLibrariesDirty) promises.push(handleSaveLibrariesDirect());
            if (isNotifDirty) promises.push(handleSaveNotificationsDirect());
            if (isContentDirty) promises.push(handleSaveContentSafetyDirect());
            await Promise.all(promises);
        } finally {
            setSavingAllDirty(false);
        }
    };

    const handleSubmitUpgrade = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmittingUpgrade(true);
        setUpgradeSuccessMsg("");
        setUpgradeErrMsg("");
        try {
            const res = await requestTierUpgradeAction(targetTier, upgradeNote);
            if (res.success) {
                setUpgradeSuccessMsg(res.message || "Upgrade request submitted successfully!");
                setTimeout(() => {
                    setUpgradeModalOpen(false);
                    setUpgradeSuccessMsg("");
                    setUpgradeNote("");
                }, 2000);
            } else {
                setUpgradeErrMsg(res.error || "Failed to submit upgrade request");
            }
        } catch (err: any) {
            setUpgradeErrMsg(err.message || "Error submitting request");
        } finally {
            setSubmittingUpgrade(false);
        }
    };

    const handleCopyInviteLink = () => {
        if (!referralInfo?.referralCode) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = referralInfo?.inviteUrl || (paymentConfig?.appUrl ? `${paymentConfig.appUrl}/join?ref=${referralInfo.referralCode}` : `${origin}/join?ref=${referralInfo.referralCode}`);
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleLinkDiscord = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!discordInput.trim()) return;
        setDiscordLoading(true);
        setDiscordSuccessMsg("");
        setDiscordErrMsg("");
        try {
            const res = await linkMyDiscordAccountAction(discordInput.trim());
            if (res.success) {
                setDiscordSuccessMsg(`Discord linked successfully as @${res.discordUsername || discordInput.trim()}! Roles synced.`);
                setDiscordInput("");
                const u = await getCurrentUser();
                if (u) setUser(u);
                setTimeout(() => setDiscordSuccessMsg(""), 6000);
            } else {
                setDiscordErrMsg(res.error || "Failed to link Discord account.");
            }
        } catch (err: any) {
            setDiscordErrMsg(err.message || "Error linking Discord account");
        } finally {
            setDiscordLoading(false);
        }
    };

    const handleUnlinkDiscord = async () => {
        setDiscordLoading(true);
        setDiscordSuccessMsg("");
        setDiscordErrMsg("");
        try {
            const res = await unlinkMyDiscordAccountAction();
            if (res.success) {
                setDiscordSuccessMsg("Discord account unlinked successfully.");
                const u = await getCurrentUser();
                if (u) setUser(u);
                setTimeout(() => setDiscordSuccessMsg(""), 6000);
            } else {
                setDiscordErrMsg(res.error || "Failed to unlink Discord account.");
            }
        } catch (err: any) {
            setDiscordErrMsg(err.message || "Error unlinking Discord account");
        } finally {
            setDiscordLoading(false);
        }
    };

    const handleSyncMyDiscordRole = async () => {
        setDiscordLoading(true);
        setDiscordSuccessMsg("");
        setDiscordErrMsg("");
        try {
            const res = await syncMyDiscordRoleAction();
            if (res.success) {
                setDiscordSuccessMsg(`Discord roles synced successfully! Assigned role: ${res.roleName || "⭐ Member"}.`);
                const u = await getCurrentUser();
                if (u) setUser(u);
                setTimeout(() => setDiscordSuccessMsg(""), 6000);
            } else {
                setDiscordErrMsg(res.error || "Failed to sync Discord roles.");
            }
        } catch (err: any) {
            setDiscordErrMsg(err.message || "Error syncing Discord roles");
        } finally {
            setDiscordLoading(false);
        }
    };


    if (loading || !user) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Loading account profile...</p>
            </div>
        );
    }

    const trialDateValid = Boolean(user?.trialEndsAt && !isNaN(new Date(user.trialEndsAt).getTime()));
    const daysLeft = isTrial && trialDateValid ? Math.max(0, differenceInDays(new Date(user.trialEndsAt), new Date())) : null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = referralInfo?.inviteUrl || (referralInfo?.referralCode ? (paymentConfig?.appUrl ? `${paymentConfig.appUrl}/join?ref=${referralInfo.referralCode}` : `${origin}/join?ref=${referralInfo.referralCode}`) : "");

    const cleanKindleInput = kindleEmail.trim().toLowerCase();
    const isKindleDomain = cleanKindleInput.endsWith("@kindle.com") || cleanKindleInput.endsWith("@free.kindle.com");
    const hasAtSymbol = cleanKindleInput.includes("@");
    const currentEffectiveKindle = bypassKindle ? "DIRECT_DOWNLOAD" : cleanKindleInput;
    const hasChangedKindle = (user?.kindleEmail || "").trim().toLowerCase() !== currentEffectiveKindle.toLowerCase();

    const currentAccountType = user?.accountType || "STANDARD";
    const isTier2 = user?.membershipTier === "TIER_2_VIP";
    const effectiveYearlyPrice = isTier2 
        ? (paymentConfig?.tier2YearlyPrice ?? 240) 
        : (paymentConfig?.yearlyPrice ?? 180);
    const effectiveMonthlyPrice = isTier2 
        ? (paymentConfig?.tier2MonthlyPrice ?? 25) 
        : (paymentConfig?.monthlyPrice ?? 17.50);
    const activeTrialProrated = isTrial
        ? calculateProratedBilling({
              startDate: user?.createdAt || new Date(),
              trialEndDate: user?.trialEndsAt || null,
              yearlyPrice: effectiveYearlyPrice,
              monthlyPrice: effectiveMonthlyPrice
          })
        : paymentConfig?.proratedBilling;
    const userCreditBalance = Math.max(0, Number(user?.accountCredit || 0));
    const profileCadence: "yearly" | "monthly" = user?.subscriptionCadence === "MONTHLY" ? "monthly" : "yearly";
    const rawProfileTargetAmount = isTrial
        ? (activeTrialProrated?.amountDueNow ?? effectiveYearlyPrice)
        : profileCadence === "monthly"
        ? effectiveMonthlyPrice
        : (referralInfo?.renewalSummary?.discountedYearlyPrice ?? effectiveYearlyPrice);
    const profileEffectiveAmountDue = Math.max(0, Math.round((rawProfileTargetAmount - userCreditBalance) * 100) / 100);

    return (
        <div className="space-y-4 sm:space-y-6 max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl mx-auto w-full min-w-0 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 min-w-0">
                <div className="space-y-1 min-w-0 flex-1 max-w-2xl">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                        <User className="h-6 w-6 text-primary shrink-0" /> Account Profile & Settings
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your account credentials, notifications, account status, content safety, and Send-to-Kindle delivery.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRecheckStatus}
                        disabled={checkingStatus}
                        className="h-9 px-3 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs flex-1 sm:flex-initial"
                        title="Ping payment email inboxes to verify new Venmo/PayPal/Zelle payments and refresh access"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? "animate-spin text-emerald-400" : ""}`} />
                        <span>{checkingStatus ? "Checking Payment Emails..." : "Check Access & Payment Status"}</span>
                    </Button>
                    <ServerSpeedTest />
                    <PlexSetupGuides />
                </div>
            </div>

            {/* STATUS SYNC ALERT FEEDBACK */}
            {statusSyncMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{statusSyncMsg}</span>
                </div>
            )}
            {statusSyncErr && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{statusSyncErr}</span>
                </div>
            )}

            {/* REFERRAL & INVITE LINK CARD */}
            <Card id="referral" className="border-purple-500/30 bg-purple-950/10 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Gift className="h-5 w-5 text-purple-400" /> Invite Friends & Community Rewards
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {isTrial 
                                    ? "Full members receive personal invite links to grant friends a free pass and earn 1 free month for every friend who joins."
                                    : `Give your friends a free ${paymentConfig?.defaultTrialDays || 14}-day pass to try out the media server. Track their trial progress and subscription rewards below.`
                                }
                            </CardDescription>
                        </div>
                        {isTrial ? (
                            <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs w-fit flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-purple-300" /> Full Member Perk
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs w-fit">
                                Code: {referralInfo?.referralCode || user?.username}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isTrial ? (
                        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <Sparkles className="h-4 w-4 text-purple-400" /> Earn Free Months by Inviting Friends
                                </p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Upgrade to a full annual or monthly membership to unlock your personal referral link, invite friends, and automatically earn free subscription months when they convert!
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    document.getElementById("billing")?.scrollIntoView({ behavior: "smooth" });
                                }}
                                className="w-full sm:w-auto text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shrink-0 gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                            >
                                <Crown className="h-3.5 w-3.5" /> View Membership Options
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* INVITE URL COPY BOX */}
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                                <div className="relative w-full">
                                    <Input 
                                        readOnly 
                                        value={inviteUrl} 
                                        className="bg-background/80 font-mono text-xs pr-10 text-foreground border-purple-500/30"
                                    />
                                </div>
                                <Button 
                                    type="button" 
                                    onClick={handleCopyInviteLink}
                                    className="w-full sm:w-auto font-bold shrink-0 bg-purple-600 hover:bg-purple-500 text-white gap-2 text-xs h-10 transition-all hover:ring-2 hover:ring-purple-400/40 active:scale-95"
                                >
                                    {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                                    {copied ? "Copied Invite Link!" : "Copy Invite Link"}
                                </Button>
                            </div>

                            {/* REFERRAL METRICS PILLS */}
                            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-purple-500/20 text-center">
                                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-0.5">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Friends Invited</p>
                                    <p className="text-xl font-black text-foreground">{referralInfo?.totalReferrals ?? 0}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-0.5">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Active Trials</p>
                                    <p className="text-xl font-black text-blue-400">{referralInfo?.activeTrials ?? 0}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-0.5">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Subscribed</p>
                                    <p className="text-xl font-black text-emerald-400">{referralInfo?.conversions ?? 0}</p>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ACCOUNT STATUS & ACCESS CARD */}
            <Card className="border-indigo-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Crown className="h-5 w-5 text-indigo-400" /> Account Status & Access Level
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Your account status determines your support level, media requests, and library access.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs font-bold ${
                                isTrial 
                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                                    : user?.role === "ADMIN"
                                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                                        : user?.role === "SUPER_USER"
                                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            }`}>
                                {isTrial ? "Trial User" : (user?.role === "ADMIN" ? "Administrator" : (user?.role === "SUPER_USER" ? "Super User" : "Full Member"))}
                            </Badge>
                            {currentAccountType !== "STANDARD" && (
                                <Badge variant="outline" className="text-xs font-medium bg-muted/40 border-border">
                                    {currentAccountType === "KID" ? "👶 Kid Account" : "📺 Living Room"}
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Account Status</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <ShieldCheck className={`h-4 w-4 ${isTrial ? "text-amber-400" : (user?.role === "ADMIN" ? "text-indigo-400" : (user?.role === "SUPER_USER" ? "text-purple-400" : "text-emerald-400"))}`} />
                                {isTrial ? "Trial User" : (user?.role === "ADMIN" ? "Server Administrator" : (user?.role === "SUPER_USER" ? "Super User" : "Full Member"))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {isTrial ? "Temporary trial access pass." : (user?.role === "ADMIN" ? "Full system & curation administrator." : (user?.role === "SUPER_USER" ? "Super user access privileges." : "Full active membership."))}
                            </p>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Media Quotas</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-amber-400" />
                                {isTrial ? "Trial Requests Active" : (user?.role === "ADMIN" ? "Unlimited Requests" : "Full Library Quotas")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {user?.role === "ADMIN" ? "No daily or monthly quota limits." : "Movie, TV show & book requests."}
                            </p>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Profile Safety</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <Tv className="h-4 w-4 text-emerald-400" />
                                {currentAccountType === "KID" ? "Child Protection Active" : "Full Library Access"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{currentAccountType === "KID" ? "Parental rating & genre filters." : "Standard media server libraries."}</p>
                        </div>
                    </div>

                    {isTrial && (
                        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/40">
                            <p className="text-xs text-muted-foreground">
                                Ready to activate full permanent membership? Annual and monthly billing options are available below.
                            </p>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    document.getElementById("billing")?.scrollIntoView({ behavior: "smooth" });
                                }}
                                className="w-full sm:w-auto text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1.5 shrink-0 transition-all hover:ring-2 hover:ring-emerald-400/40 active:scale-95"
                            >
                                <CreditCard className="h-3.5 w-3.5 text-emerald-400" /> View Subscription Options
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* SUBSCRIPTION & RENEWAL CARD */}
            <Card id="billing" className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm scroll-mt-6">
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <CreditCard className="h-5 w-5 text-emerald-400" /> Subscription & Prorated Billing
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Transparent annual billing renewing on January 1st with prorated first-year rates.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <FeatureGuideModal guideId="referral-rewards" triggerText="Referral & Billing Guide" />
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-bold w-fit">
                                ${effectiveYearlyPrice} / year
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* ACCOUNT CREDIT & PARTIAL PAYMENT NOTICE */}
                    {(user?.accountCredit ?? 0) > 0 && (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-amber-400 flex items-center gap-1.5 text-sm">
                                    <DollarSign className="h-4 w-4 text-amber-400" /> Account Credit Balance: ${(user.accountCredit ?? 0).toFixed(2)}
                                </span>
                                <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-semibold">
                                    Partial Payment Credited
                                </Badge>
                            </div>
                            <p className="text-muted-foreground leading-relaxed text-[11px]">
                                Your latest payment {user.lastPaymentAmount ? <>of <strong>${user.lastPaymentAmount.toFixed(2)}</strong> {user.lastPaymentDate ? `on ${safeFormatDate(user.lastPaymentDate, "MMMM d, yyyy")}` : ""}</> : ""} has been safely credited to your account balance.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                <div className="p-2.5 rounded-lg bg-black/40 border border-amber-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Monthly Plan (${effectiveMonthlyPrice.toFixed(2)}/mo)</span>
                                    <p className="font-semibold text-foreground text-xs">
                                        {(effectiveMonthlyPrice - user.accountCredit) > 0 
                                            ? <>Send <strong className="text-amber-400">${(effectiveMonthlyPrice - user.accountCredit).toFixed(2)}</strong> more to activate</>
                                            : <span className="text-emerald-400 font-bold">Credit covers monthly rate!</span>
                                        }
                                    </p>
                                </div>
                                <div className="p-2.5 rounded-lg bg-black/40 border border-purple-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Annual Discounted Plan (${effectiveYearlyPrice.toFixed(2)}/yr)</span>
                                    <p className="font-semibold text-foreground text-xs">
                                        {(effectiveYearlyPrice - user.accountCredit) > 0 
                                            ? <>Send <strong className="text-purple-400">${(effectiveYearlyPrice - user.accountCredit).toFixed(2)}</strong> more for 1 full year (${(effectiveYearlyPrice / 12).toFixed(0)}/mo)</>
                                            : <span className="text-emerald-400 font-bold">Credit covers yearly rate!</span>
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {user?.lastPaymentAmount && (user?.accountCredit ?? 0) === 0 && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                Last Payment: <strong className="text-emerald-300 font-semibold">${user.lastPaymentAmount.toFixed(2)}</strong>
                                {user.lastPaymentDate ? ` on ${safeFormatDate(user.lastPaymentDate, "MMM d, yyyy")}` : ""}
                                {user.lastPaymentProvider ? ` via ${user.lastPaymentProvider}` : ""}
                            </span>
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                Applied
                            </Badge>
                        </div>
                    )}

                    {user?.role === "ADMIN" ? (
                        <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Access Level</span>
                            <p className="font-bold text-indigo-400 text-sm flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-indigo-400" /> Platform Administrator
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Unrestricted administrator privileges with permanent lifetime access. You are exempt from all subscription plans, renewals, and expiration dates.
                            </p>
                        </div>
                    ) : isTrial && activeTrialProrated ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Trial Status</span>
                                    <p className="font-bold text-blue-400 text-sm">{daysLeft ?? 0} Days Left</p>
                                    <p className="text-[10px] text-muted-foreground">Ends {safeFormatDate(user?.trialEndsAt, "MMM d, yyyy")}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">1st Year Prorated</span>
                                    <p className="font-bold text-emerald-400 text-sm">{activeTrialProrated.amountDueText}</p>
                                    <p className="text-[10px] text-muted-foreground">{activeTrialProrated.remainingMonthsText}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Annual Renewal</span>
                                    <p className="font-bold text-purple-300 text-sm">${effectiveYearlyPrice} / yr</p>
                                    <p className="text-[10px] text-muted-foreground">Renews {activeTrialProrated.nextRenewalDate}</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {activeTrialProrated.breakdownSummary}
                            </p>
                        </div>
                    ) : user?.status === "APPROVED" && user?.subscriptionEndsAt ? (
                        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                                    {user.subscriptionCadence === "MONTHLY" ? "Active Monthly Subscription" : "Active Annual Subscription"}
                                </span>
                                {referralInfo?.renewalSummary?.convertedReferralsCount > 0 && (
                                    <Badge variant="outline" className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-[10px] gap-1 font-semibold">
                                        <Gift className="h-3 w-3 text-purple-400" />
                                        {referralInfo.renewalSummary.convertedReferralsCount} Free Mo Earned
                                    </Badge>
                                )}
                            </div>
                            <p className="font-bold text-emerald-400 text-sm">
                                Valid until {safeFormatDate(user.subscriptionEndsAt, "MMMM d, yyyy", "Active")}
                            </p>

                            {referralInfo?.renewalSummary?.convertedReferralsCount > 0 ? (
                                <div className="p-2.5 rounded-lg bg-black/30 border border-purple-500/25 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-purple-300 flex items-center gap-1">
                                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                            Referral Reward Applied
                                        </span>
                                        <span className="font-bold text-emerald-400">
                                            ${(referralInfo?.renewalSummary?.discountedYearlyPrice ?? 0).toFixed(2)}/yr
                                            <span className="line-through text-muted-foreground ml-1.5 font-normal text-[11px]">
                                                ${(referralInfo?.renewalSummary?.baseYearlyPrice ?? effectiveYearlyPrice).toFixed(2)}
                                            </span>
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        You earned <strong>{referralInfo.renewalSummary.convertedReferralsCount} free month(s)</strong> (${(referralInfo?.renewalSummary?.rewardDiscountAmount ?? 0).toFixed(2)} credit) for inviting friends who joined!
                                        {referralInfo.renewalSummary.delayedMonthlyStartDate && (
                                            <> If switching to monthly billing (${(referralInfo?.renewalSummary?.monthlyRate ?? effectiveMonthlyPrice).toFixed(2)}/mo), your payments are delayed until <strong>{referralInfo.renewalSummary.delayedMonthlyStartDate}</strong>.</>
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">
                                    {user.subscriptionCadence === "MONTHLY" 
                                        ? `Renews at $${effectiveMonthlyPrice}/month.` 
                                        : `Renews at $${effectiveYearlyPrice}/year for the following calendar year.`}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Access Level</span>
                            <p className="font-bold text-foreground">
                                {user?.role === "ADMIN" ? "Server Administrator" : "Permanent Access"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Unrestricted lifetime access with full library and request privileges.
                            </p>
                        </div>
                    )}

                    {/* PAYMENT HANDLES & MODAL */}
                    <div className="pt-2 border-t border-border/40">
                        <PaymentMethodsGrid config={paymentConfig} username={user?.username} amount={profileEffectiveAmountDue > 0 ? profileEffectiveAmountDue : undefined} cadence={profileCadence} />
                    </div>

                    {paymentConfig?.paymentInstructions && (
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-muted-foreground/90 whitespace-pre-wrap">
                            {paymentConfig.paymentInstructions}
                        </div>
                    )}

                    <p className="text-[11px] text-muted-foreground italic pt-1">
                        💡 When making a payment, remember to include your username <strong className="text-foreground">({user?.username})</strong> in the payment memo.
                    </p>
                </CardContent>
            </Card>

            {/* MULTI-PLATFORM MEDIA SERVERS & LIBRARIES (PLEX • JELLYFIN • EMBY) */}
            <UserMediaServersManager 
                userRole={user?.role} 
                userStatus={user?.status} 
                membershipTier={user?.membershipTier} 
                username={user?.username} 
                onDirtyChange={setIsMediaServersDirty} 
            />

            {/* HOUSEHOLD SUB-ACCOUNTS CARD */}
            <Card id="subaccounts" className="border-purple-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Users className="h-5 w-5 text-purple-400" /> Household Sub-Accounts & Profiles
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Create secondary Plex profiles for your Living Room TV or Kids' tablets with zero extra billing.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-purple-500/15 text-purple-300 border-purple-500/40 text-xs w-fit flex items-center gap-1 font-semibold">
                            <Sparkles className="h-3 w-3 text-purple-300" /> Coming Soon • Beta
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[11px] font-semibold">
                                Feature in Active Development
                            </Badge>
                            <span className="text-xs text-muted-foreground">Tagging & Filtering Beta</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Household Sub-Accounts (dedicated Kids tablet profiles and Living Room family screens) are currently coming soon while our automated content safety and IMDb/TMDb metadata tagging engine is calibrated. Once released, you will be able to provision dedicated child-safe and family-friendly profiles nested under your membership with zero extra billing.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Monitor className="h-4 w-4 text-indigo-400 shrink-0" /> Living Room TV Profile
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Shared household viewing that automatically filters out severe nudity and explicit content for living room screens.
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Baby className="h-4 w-4 text-purple-400 shrink-0" /> Kids Tablet Profile
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Dedicated child-safe profile restricted strictly to G/PG ratings and animated kids libraries.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ACCOUNT ADD-ONS & FEATURES CARD */}
            <Card id="addons" className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Zap className="h-5 w-5 text-amber-400" /> Account Add-Ons & Features
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Enable optional features, live streaming channels, and extra household profile slots.
                            </CardDescription>
                        </div>
                        {isTrial ? (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs w-fit flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-amber-300" /> Full Member Perk
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs w-fit">
                                {userEnabledAddons.filter((id) => addonsCatalog.filter((a) => a.isAvailable !== false && !a.comingSoon && a.status !== "coming_soon" && a.id !== "emby_access" && a.id !== "music_streaming" && a.id !== "priority_requests").some((a) => a.id === id)).length} of {addonsCatalog.filter((a) => a.isAvailable !== false && !a.comingSoon && a.status !== "coming_soon" && a.id !== "emby_access" && a.id !== "music_streaming" && a.id !== "priority_requests").length} Enabled
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {addonMsg && (
                        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{addonMsg}</span>
                        </div>
                    )}
                    {addonErr && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{addonErr}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {addonsCatalog
                            .filter((addon) => addon.isAvailable !== false && !addon.comingSoon && addon.status !== "coming_soon" && addon.id !== "emby_access" && addon.id !== "music_streaming" && addon.id !== "priority_requests")
                            .map((addon) => {
                                const isEnabled = userEnabledAddons.includes(addon.id);
                                const isToggling = togglingAddonId === addon.id;
                                const isFree = addon.isFree || addon.price === 0;

                                return (
                                    <div 
                                        key={addon.id}
                                        className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                                            isEnabled 
                                                ? "bg-amber-500/[0.06] border-amber-500/40" 
                                                : "bg-white/[0.02] border-white/[0.06]"
                                        }`}
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {addon.icon === "server" ? (
                                                        <Server className="h-4 w-4 text-purple-400 shrink-0" />
                                                    ) : addon.icon === "tv" ? (
                                                        <Tv className="h-4 w-4 text-cyan-400 shrink-0" />
                                                    ) : addon.icon === "music" ? (
                                                        <Music className="h-4 w-4 text-emerald-400 shrink-0" />
                                                    ) : addon.icon === "book" ? (
                                                        <BookOpen className="h-4 w-4 text-amber-400 shrink-0" />
                                                    ) : addon.icon === "headphones" ? (
                                                        <Headphones className="h-4 w-4 text-purple-400 shrink-0" />
                                                    ) : addon.icon === "baby" ? (
                                                        <Baby className="h-4 w-4 text-purple-400 shrink-0" />
                                                    ) : addon.icon === "monitor" ? (
                                                        <Monitor className="h-4 w-4 text-indigo-400 shrink-0" />
                                                    ) : addon.icon === "sparkles" ? (
                                                        <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                                                    ) : (
                                                        <Zap className="h-4 w-4 text-primary shrink-0" />
                                                    )}
                                                    <span className="font-bold text-xs text-foreground truncate">{addon.name}</span>
                                                </div>
                                                {isFree ? (
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold shrink-0">
                                                        ✨ Free
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shrink-0">
                                                        ${addon.price}/mo
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                {addon.description}
                                            </p>
                                        </div>

                                        <div className="pt-2 flex items-center justify-between border-t border-border/30">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-medium text-muted-foreground">
                                                {isEnabled ? (
                                                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                                        <Check className="h-3 w-3" /> Active
                                                    </span>
                                                ) : (
                                                    <span>Inactive</span>
                                                )}
                                            </span>
                                            {addon.id === "jellyfin_access" && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setAddonGuideType("JELLYFIN");
                                                        setAddonGuideModalOpen(true);
                                                    }}
                                                    className="h-6 text-[10px] px-2 font-semibold gap-1 border-purple-500/40 text-purple-300 hover:bg-purple-500/10 cursor-pointer"
                                                >
                                                    📖 Setup Guide
                                                </Button>
                                            )}
                                            </div>
                                            {isTrial ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        document.getElementById("billing")?.scrollIntoView({ behavior: "smooth" });
                                                    }}
                                                    className="text-[11px] h-7 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1 cursor-pointer transition-all active:scale-95"
                                                >
                                                    <Sparkles className="h-3 w-3 text-amber-400" /> Unlocks with Full Membership
                                                </Button>
                                            ) : isFree ? (
                                                <div className="flex items-center gap-2">
                                                    {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
                                                    <Switch
                                                        checked={isEnabled}
                                                        disabled={isToggling}
                                                        onCheckedChange={(checked) => handleToggleFreeAddon(addon.id, checked)}
                                                    />
                                                </div>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setUpgradeModalOpen(true);
                                                        setTargetTier(addon.id);
                                                        setUpgradeNote(`Interested in activating add-on: ${addon.name}`);
                                                    }}
                                                    className="text-xs h-7 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-pointer"
                                                >
                                                    Request Add-On
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </CardContent>
            </Card>

            {/* NOTIFICATION PREFERENCES CARD */}
            <Card id="notifications" className={`transition-all duration-300 bg-[#121218]/80 backdrop-blur-md relative overflow-hidden scroll-mt-6 ${isNotifDirty ? "border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "border-cyan-500/30 shadow-sm"}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Bell className="h-5 w-5 text-cyan-400" /> Notification & Email Preferences
                                {isNotifDirty && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 font-medium ml-2 animate-in fade-in">
                                        ● Unsaved Changes
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                All server notices are enabled by default. Toggle off any updates you wish to opt out of receiving.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-xs font-semibold gap-1.5 w-fit shrink-0">
                            <Mail className="h-3 w-3" /> Email Notices
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveNotifications} className="space-y-4">
                        {notifMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{notifMsg}</span>
                            </div>
                        )}
                        {notifErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{notifErr}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {/* 1. Media Request Approvals */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailRequestApproved
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-emerald-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-req-approved" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Media Request Approvals
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Notices when your requested movie, series, or book is reviewed and approved by an administrator.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-req-approved"
                                    checked={notifPrefs.emailRequestApproved} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailRequestApproved: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>

                            {/* 2. Media Available & Ready to Stream */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailMediaReady
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-cyan-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Tv className="h-4 w-4 text-cyan-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-media-ready" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Media Available & Ready
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Alerts the moment your requested media finishes downloading and is ready to stream on Plex.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-media-ready"
                                    checked={notifPrefs.emailMediaReady} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailMediaReady: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>

                            {/* 3. Subscription & Renewal Reminders */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailSubscriptionReminders
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-purple-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Calendar className="h-4 w-4 text-purple-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-sub-reminders" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Subscription & Renewal Reminders
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Advance email notices before your monthly or annual subscription passes renew or expire.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-sub-reminders"
                                    checked={notifPrefs.emailSubscriptionReminders} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailSubscriptionReminders: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>

                            {/* 4. Server Announcements & Maintenance */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailAnnouncements
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-amber-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Bell className="h-4 w-4 text-amber-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-announcements" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Server Announcements & Downtime
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Scheduled maintenance downtime notices, domain changes, and important server updates.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-announcements"
                                    checked={notifPrefs.emailAnnouncements} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailAnnouncements: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>

                            {/* 5. Support Ticket Responses */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailSupportTickets
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-rose-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <MessageSquare className="h-4 w-4 text-rose-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-support-tickets" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Support Ticket Updates
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Email updates whenever an administrator replies to or resolves your support tickets.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-support-tickets"
                                    checked={notifPrefs.emailSupportTickets} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailSupportTickets: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>

                            {/* 6. Referral Rewards & Credits */}
                            <div className={`p-3.5 sm:p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                notifPrefs.emailReferralRewards
                                    ? "bg-white/[0.03] border-white/[0.08] hover:border-blue-500/30"
                                    : "bg-white/[0.01] border-white/[0.04] opacity-60"
                            }`}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Sparkles className="h-4 w-4 text-blue-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <Label htmlFor="notif-referral-rewards" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                                            Referral Rewards & Credits
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Alerts when friends join using your referral code or free subscription months are awarded.
                                        </p>
                                    </div>
                                </div>
                                <Switch 
                                    id="notif-referral-rewards"
                                    checked={notifPrefs.emailReferralRewards} 
                                    onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailReferralRewards: val })} 
                                    className="shrink-0 mt-0.5"
                                />
                            </div>
                        </div>

                        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <p className="text-[11px] text-muted-foreground">
                                Preferences update immediately across all automated server dispatch engines.
                            </p>
                            <Button
                                type="submit"
                                disabled={savingNotif}
                                className="w-full sm:w-auto font-bold text-xs h-9 bg-cyan-600 hover:bg-cyan-500 text-white gap-2 transition-all hover:ring-2 hover:ring-cyan-400/40 active:scale-95"
                            >
                                {savingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                                Save Notification Preferences
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* DISCORD COMMUNITY & ROLE SYNC CARD */}
            <Card id="discord" className="border-indigo-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Gamepad2 className="h-5 w-5 text-indigo-400" /> Discord Community & Role Sync
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Link your Discord account to gain automated access to community channels, live announcements, and support.
                            </CardDescription>
                        </div>
                        {user?.discordId ? (
                            <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-xs font-semibold gap-1.5 w-fit">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Linked
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border text-xs w-fit">
                                Not Linked
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {discordSuccessMsg && (
                        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{discordSuccessMsg}</span>
                        </div>
                    )}
                    {discordErrMsg && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{discordErrMsg}</span>
                        </div>
                    )}

                    {user?.discordId ? (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    {user.discordAvatar ? (
                                        <img 
                                            src={user.discordAvatar} 
                                            alt={user.discordUsername || "Discord Avatar"} 
                                            className="w-10 h-10 rounded-full border border-indigo-500/30 object-cover shrink-0" 
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 font-bold">
                                            {(user.discordUsername || "D").charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-bold text-sm text-foreground flex items-center gap-2">
                                            @{user.discordUsername || "Discord User"}
                                            {user.discordDiscriminator && user.discordDiscriminator !== "0" && (
                                                <span className="text-xs text-muted-foreground font-normal">#{user.discordDiscriminator}</span>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <span className="text-[11px] text-muted-foreground">Server Role:</span>
                                            <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                                                {user?.role === "ADMIN" 
                                                    ? "👑 Admin" 
                                                    : isTrial 
                                                        ? "⏱️ Trial Pass" 
                                                        : currentAccountType === "KID" 
                                                            ? "🧒 Kids Profile" 
                                                            : "⭐ Member"
                                                }
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <a
                                        href={discordInviteUrl || paymentConfig?.discordInviteUrl || "https://discord.gg/KNvUSmPtD3"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs h-8 px-2.5 inline-flex items-center rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 gap-1.5 cursor-pointer font-semibold shrink-0"
                                    >
                                        <Gamepad2 className="h-3.5 w-3.5" />
                                        <span>Open Discord</span>
                                        <ExternalLink className="h-3 w-3 opacity-80" />
                                    </a>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={discordLoading}
                                        onClick={handleSyncMyDiscordRole}
                                        className="text-xs h-8 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1.5 cursor-pointer"
                                    >
                                        {discordLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        Sync Role
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={discordLoading}
                                        onClick={handleUnlinkDiscord}
                                        className="text-xs h-8 bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 gap-1.5 cursor-pointer"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Unlink
                                    </Button>
                                </div>
                            </div>

                            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <span>
                                    Linked Discord ID: <code className="text-muted-foreground/80 font-mono text-[10px]">{user.discordId}</code>
                                    {user.discordLinkedAt && ` • Linked on ${safeFormatDate(user.discordLinkedAt, "MMM d, yyyy")}`}
                                </span>
                                <span className="text-emerald-400 flex items-center gap-1 text-[10px]">
                                    <CheckCheck className="h-3 w-3" /> Automatic role sync active
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* STEP 1: JOIN DISCORD INVITE CTA */}
                            <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-indigo-500/5 border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Gamepad2 className="h-4 w-4 text-indigo-400 shrink-0" />
                                        <span className="font-bold text-xs text-foreground">Step 1: Join the Discord Server</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Click below to join our community server. Trial passes and new accounts start in Welcome & Rules until linked.
                                    </p>
                                </div>
                                <a
                                    href={discordInviteUrl || paymentConfig?.discordInviteUrl || "https://discord.gg/KNvUSmPtD3"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm hover:shadow-indigo-500/20 shrink-0 w-full sm:w-auto"
                                >
                                    <Gamepad2 className="h-3.5 w-3.5" />
                                    <span>Join Discord Server</span>
                                    <ExternalLink className="h-3 w-3 opacity-80" />
                                </a>
                            </div>

                            {/* STEP 2: LINK DISCORD HANDLE */}
                            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                                <div>
                                    <span className="font-bold text-xs text-foreground block">Step 2: Link Your Discord Handle</span>
                                    <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
                                        Enter your Discord username below. Linking your account automatically elevates you to <strong className="text-emerald-400">⭐ Member</strong> to unlock all community channels, movie & TV chats, and 4K guides!
                                    </p>
                                </div>
                                <form onSubmit={handleLinkDiscord} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">@</span>
                                        <Input
                                            placeholder="your_discord_username or User ID"
                                            value={discordInput}
                                            onChange={(e) => setDiscordInput(e.target.value)}
                                            className="pl-7 bg-background/80 text-xs"
                                            disabled={discordLoading}
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={discordLoading || !discordInput.trim()}
                                        className="font-bold text-xs h-9 bg-indigo-600 hover:bg-indigo-500 text-white gap-2 transition-all hover:ring-2 hover:ring-indigo-400/40 shrink-0 cursor-pointer"
                                    >
                                        {discordLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
                                        Link Discord Account
                                    </Button>
                                </form>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* CONTENT SAFETY & FAMILY PROFILE CARD */}
            <Card id="safety" className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Shield className="h-5 w-5 text-amber-400" /> Content Safety & Family Profile
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Configure parental rating ceilings, genre exclusions, and child-safe viewing filters.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-xs w-fit flex items-center gap-1 font-semibold">
                            <Sparkles className="h-3 w-3 text-amber-300" /> Coming Soon • Beta
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-semibold">
                                Tagging Engine in Beta
                            </Badge>
                            <span className="text-xs text-muted-foreground">Metadata Calibration</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Content safety controls, rating ceilings, and explicit genre exclusion filters (IMDb &amp; TMDb content advisories) are currently coming soon while our automated library metadata tagging engine is in beta. Once tagging verification is finalized across media servers, you will be able to customize parental ceilings and genre exclusions per profile directly from this panel.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                                <div className="text-xs font-bold text-foreground">
                                    🔞 Rating Ceilings
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Enforce TV-Y, PG, PG-13, or R rating caps that hide titles exceeding your chosen ceiling.
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                                <div className="text-xs font-bold text-foreground">
                                    🚫 Explicit Filtering
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    One-click exclusion filters for severe nudity, extreme gore, and horror genres.
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                                <div className="text-xs font-bold text-foreground">
                                    👥 Per-Profile Safety
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Apply independent safety rules across your primary and household sub-accounts.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* SEND-TO-KINDLE DELIVERY CARD */}
            <Card id="kindle" className={`transition-all duration-300 bg-[#121218]/80 backdrop-blur-md relative overflow-hidden scroll-mt-6 ${isKindleDirty ? "border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "border-amber-500/30 shadow-sm"}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <BookOpen className="h-5 w-5 text-amber-400" /> Send-to-Kindle Delivery
                                {isKindleDirty && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 font-medium ml-2 animate-in fade-in">
                                        ● Unsaved Changes
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Configure your Kindle email address to receive ebooks directly on your Amazon Kindle device or app.
                            </CardDescription>
                        </div>
                        {user?.kindleEmail ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Configured
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> Not Configured
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={handleUpdateKindleEmail} className="space-y-4" autoComplete="off">
                        {kindleMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{kindleMsg}</span>
                            </div>
                        )}
                        {kindleErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{kindleErr}</span>
                            </div>
                        )}

                        {/* BYPASS KINDLE OPTION */}
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="bypassKindleToggle" className="text-xs font-semibold cursor-pointer">
                                    <span>I don't use a Kindle (Direct Download & In-Browser Reader)</span>
                                    <p className="text-[10px] text-muted-foreground">Don't have an Amazon Kindle? Enable this to download books directly or stream audiobooks without a Kindle email.</p>
                                </Label>
                                <Switch 
                                    id="bypassKindleToggle"
                                    checked={bypassKindle}
                                    onCheckedChange={(val) => {
                                        setBypassKindle(val);
                                        if (kindleMsg) setKindleMsg("");
                                        if (kindleErr) setKindleErr("");
                                    }}
                                />
                            </div>
                        </div>

                        {!bypassKindle ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="kindleEmailInput" className="text-xs font-semibold text-foreground">
                                        Send-to-Kindle Email Address
                                    </Label>
                                    {cleanKindleInput && (
                                        isKindleDomain ? (
                                            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                                                <CheckCircle2 className="h-3 w-3" /> Kindle domain recognized
                                            </span>
                                        ) : hasAtSymbol ? (
                                            <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                                                <AlertCircle className="h-3 w-3" /> Kindle addresses typically end with @kindle.com
                                            </span>
                                        ) : null
                                    )}
                                </div>
                                <div className="relative">
                                    <Input
                                        id="kindleEmailInput"
                                        type="email"
                                        value={kindleEmail}
                                        onChange={(e) => {
                                            setKindleEmail(e.target.value);
                                            if (kindleMsg) setKindleMsg("");
                                            if (kindleErr) setKindleErr("");
                                        }}
                                        placeholder="e.g. yourusername@kindle.com"
                                        className="bg-background/80 font-mono text-xs pr-10 border-border/60"
                                        autoComplete="email"
                                    />
                                    <MailCheck className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Find your Kindle email on your device under <strong className="text-foreground">Settings &gt; Your Account &gt; Send-to-Kindle Email</strong>, or on Amazon under <strong className="text-foreground">Manage Your Content and Devices &gt; Preferences</strong>.
                                </p>
                            </div>
                        ) : (
                            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                <span>In-browser reading & direct download selected. Click Save to unlock full Book & Audiobook Library access.</span>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                            <Button
                                type="submit"
                                disabled={kindleSaving || !hasChangedKindle || (!bypassKindle && !cleanKindleInput)}
                                className="w-full sm:w-auto font-semibold gap-2 transition-all hover:ring-2 hover:ring-primary/50 text-xs h-9 cursor-pointer active:scale-95"
                            >
                                {kindleSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                                    </>
                                ) : (
                                    <>
                                        <BookOpen className="h-4 w-4" /> {bypassKindle ? "Save Direct Access" : (user?.kindleEmail ? "Update Kindle Email" : "Save Kindle Email")}
                                    </>
                                )}
                            </Button>
                            {user?.kindleEmail && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={kindleSaving}
                                    onClick={handleClearKindleEmail}
                                    className="w-full sm:w-auto text-xs h-9 text-muted-foreground hover:text-red-400 hover:border-red-500/40 gap-1.5 cursor-pointer"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Remove Address
                                </Button>
                            )}
                        </div>
                    </form>

                    {/* AMAZON WHITELIST & SETUP INSTRUCTIONS */}
                    <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Amazon Approved Sender Whitelist
                            </span>
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 underline underline-offset-2 shrink-0 font-medium"
                            >
                                Amazon Settings <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Amazon requires that you authorize our outbound server email address in your Amazon account. Add the address below to your <strong className="text-foreground">Approved Personal Document E-mail List</strong>:
                        </p>
                        
                        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <span><strong>Sender Email Update:</strong> Deliveries are dispatched from <code className="font-mono font-bold text-amber-200">{paymentConfig?.kindleSenderEmail || "kindle@domshomelab.com"}</code>. If you configured Amazon previously, ensure this exact address is authorized.</span>
                        </div>
                        
                        {paymentConfig?.kindleSenderEmail || paymentConfig?.smtpFrom ? (
                            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                <div className="p-2 rounded-lg bg-background/80 border border-purple-500/30 font-mono text-xs text-foreground flex-1 w-full truncate">
                                    {paymentConfig.kindleSenderEmail || paymentConfig.smtpFrom}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopy(paymentConfig.kindleSenderEmail || paymentConfig.smtpFrom, "smtpFrom")}
                                    className="w-full sm:w-auto font-sans text-xs gap-1.5 shrink-0 border-purple-500/30 hover:bg-purple-500/10"
                                >
                                    {copiedHandle === "smtpFrom" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-purple-400" />}
                                    {copiedHandle === "smtpFrom" ? "Copied Sender!" : "Copy Sender Email"}
                                </Button>
                            </div>
                        ) : (
                            <p className="text-[11px] text-amber-400/90 italic">
                                Note: Inbound server SMTP address will appear once configured by the administrator.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* KIDS & FAMILY LIBRARY ACCESS CARD */}
            <Card id="kids-library" className="border-emerald-500/30 bg-[#121218]/80 backdrop-blur-md relative overflow-hidden shadow-sm scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Baby className="h-5 w-5 text-emerald-400" /> Kids & Family Library Access
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Add age-appropriate children's books, picture books, and family reading shelves to your accessible libraries list.
                            </CardDescription>
                        </div>
                        {isTrial ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <Lock className="h-3.5 w-3.5" /> Full Member Perk
                            </Badge>
                        ) : hasKidsAccess ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Added to Access List
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs font-semibold w-fit flex items-center gap-1">
                                Not Added
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {kidsAccessMsg && (
                        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{kidsAccessMsg}</span>
                        </div>
                    )}
                    {kidsAccessErr && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{kidsAccessErr}</span>
                        </div>
                    )}

                    {isTrial ? (
                        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                            <p className="font-semibold flex items-center gap-1.5 text-amber-400">
                                <Lock className="h-3.5 w-3.5" /> Available with Membership Upgrade
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Dedicated Kids & Family libraries are protected and reserved for active full members. Upgrade your account to enable children's bookshelves and age-filtered reading profiles.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-border/50 gap-4">
                                <div className="space-y-0.5">
                                    <Label htmlFor="kidsLibraryToggle" className="text-xs font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
                                        <span>Include Kids & Family Bookshelf</span>
                                        {savingKidsAccess && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        When enabled, children's books and age-appropriate reading shelves appear in your library and discovery feeds. All requests for kids books require administrator review before downloading.
                                    </p>
                                </div>
                                <Switch
                                    id="kidsLibraryToggle"
                                    checked={hasKidsAccess}
                                    disabled={savingKidsAccess}
                                    onCheckedChange={handleToggleKidsLibraryAccess}
                                />
                            </div>

                            
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* AUDIOBOOKS PLEX LIBRARY ACCESS CARD */}
            <Card id="audiobooks-library" className="border-purple-500/30 bg-[#121218]/80 backdrop-blur-md relative overflow-hidden shadow-sm scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Headphones className="h-5 w-5 text-purple-400" /> Audiobooks Plex Library Access
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Opt in to stream narrated audiobooks, series collections, and spoken word media directly in Plex.
                            </CardDescription>
                        </div>
                        {isTrial ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <Lock className="h-3.5 w-3.5" /> Full Member Perk
                            </Badge>
                        ) : hasAudiobooksAccess ? (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Plex Library Granted
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs font-semibold w-fit flex items-center gap-1">
                                Not Granted
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {audiobooksAccessMsg && (
                        <div className="text-xs text-purple-400 bg-purple-950/40 border border-purple-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{audiobooksAccessMsg}</span>
                        </div>
                    )}
                    {audiobooksAccessErr && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{audiobooksAccessErr}</span>
                        </div>
                    )}

                    {isTrial ? (
                        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                            <p className="font-semibold flex items-center gap-1.5 text-amber-400">
                                <Lock className="h-3.5 w-3.5" /> Available with Membership Upgrade
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Dedicated Audiobook Plex libraries are reserved for active full members. Upgrade your account to enable full narrated audiobook streaming across all your devices.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-border/50 gap-4">
                                <div className="space-y-0.5">
                                    <Label htmlFor="audiobooksLibraryToggle" className="text-xs font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
                                        <span>Grant Audiobooks Plex Library Access</span>
                                        {savingAudiobooksAccess && <Loader2 className="h-3 w-3 animate-spin text-purple-400" />}
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        When enabled, the server automatically updates your Plex account sharing permissions to grant access to the Audiobooks library section. Disabling will remove the Audiobooks library from your Plex dashboard.
                                    </p>
                                </div>
                                <Switch
                                    id="audiobooksLibraryToggle"
                                    checked={hasAudiobooksAccess}
                                    disabled={savingAudiobooksAccess}
                                    onCheckedChange={handleToggleAudiobooksLibraryAccess}
                                />
                            </div>

                            
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* SUPER USER ACCESS CARD */}
            {isTrial ? (
                <Card className="border-border/40 bg-[#121218]/60 backdrop-blur-md opacity-80">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-bold flex items-center gap-2 text-muted-foreground">
                            <Lock className="h-4 w-4" /> Super User Access (Requires Active Membership)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Advanced self-service tools (direct movie & TV release management) are reserved for active full members and are unavailable during the free trial.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <SuperUserCard initialRole={user?.role} />
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* ACCOUNT INFORMATION CARD */}
                <Card id="details" className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm scroll-mt-6">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" /> Account Details
                        </CardTitle>
                        <CardDescription>Your registered profile and access status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground font-semibold">Username</Label>
                            <div className="font-semibold text-base flex items-center gap-2 text-foreground">
                                <span>{user?.username || "Unknown"}</span>
                                <Badge variant={user?.role === "ADMIN" ? "default" : "secondary"} className="text-[10px] font-bold">
                                    {user?.role === "ADMIN" ? "Administrator" : user?.role === "SUPER_USER" ? "Power User" : "Full Member"}
                                </Badge>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs text-muted-foreground font-semibold">Email Address</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setEditEmailInput(user?.email || "");
                                        setEditEmailMsg("");
                                        setEditEmailErr("");
                                        setShowEditEmailModal(true);
                                    }}
                                    className="h-6 text-[11px] px-2 text-primary hover:text-primary hover:bg-primary/10 gap-1 font-semibold"
                                >
                                    <Edit2 className="h-3 w-3" />
                                    <span>Edit</span>
                                </Button>
                            </div>
                            <div className="text-sm font-medium flex items-center gap-2 text-foreground">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{user?.email || "No Email Associated"}</span>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Send-to-Kindle Email</Label>
                            <div className="text-sm font-medium flex items-center justify-between gap-2 text-foreground">
                                <div className="flex items-center gap-2 truncate">
                                    <MailCheck className="h-4 w-4 text-primary shrink-0" />
                                    <span className="truncate">{user?.kindleEmail || "Not Configured"}</span>
                                </div>
                                {user?.kindleEmail ? (
                                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] shrink-0 font-medium">
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border text-[10px] shrink-0">
                                        Disabled
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Account Access Status</Label>
                            <div className="flex items-center gap-2 pt-0.5">
                                {isTrial ? (
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/40 gap-1.5 text-xs font-bold">
                                        <Timer className="h-3.5 w-3.5" /> {paymentConfig?.defaultTrialDays || 14}-Day Free Trial ({daysLeft ?? 0} days remaining)
                                    </Badge>
                                ) : user?.role === "ADMIN" ? (
                                    <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 gap-1.5 text-xs font-bold">
                                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" /> Platform Administrator (Permanent Access)
                                    </Badge>
                                ) : user?.status === "APPROVED" && user?.subscriptionEndsAt ? (
                                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 text-xs font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> {user.subscriptionCadence === "MONTHLY" ? "Monthly Plan" : "Annual Plan"} (Expires {safeFormatDate(user.subscriptionEndsAt, "MMM d, yyyy", "Active")})
                                    </Badge>
                                ) : user?.status === "APPROVED" ? (
                                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 text-xs font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Permanent Access
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1.5 text-xs font-semibold">
                                        {user?.status || "Pending"}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CHANGE PASSWORD CARD */}
                <Card id="password" className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm scroll-mt-6">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary" /> Change Password
                        </CardTitle>
                        <CardDescription>Update your login password for DomsHomeLab.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleChangePassword} className="space-y-4" autoComplete="off">
                            {passMsg && (
                                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{passMsg}</span>
                                </div>
                            )}
                            {passErr && (
                                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{passErr}</span>
                                </div>
                            )}
                            
                            <div className="space-y-1.5">
                                <Label htmlFor="currentPassword" className="text-xs font-semibold">Current or Temporary Password</Label>
                                <div className="relative">
                                    <Input 
                                        id="currentPassword"
                                        type={showPassCurrent ? "text" : "password"} 
                                        required 
                                        value={passCurrent} 
                                        onChange={(e) => setPassCurrent(e.target.value)} 
                                        placeholder="Enter current or temp password"
                                        className="bg-background/60 pr-10"
                                        autoComplete="current-password"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowPassCurrent(!showPassCurrent)}
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground hover:text-foreground cursor-pointer"
                                        tabIndex={-1}
                                    >
                                        {showPassCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="newPassword" className="text-xs font-semibold">New Password</Label>
                                <div className="relative">
                                    <Input 
                                        id="newPassword"
                                        type={showPassNew ? "text" : "password"} 
                                        required 
                                        value={passNew} 
                                        onChange={(e) => setPassNew(e.target.value)} 
                                        placeholder="Minimum 6 characters"
                                        className="bg-background/60 pr-10"
                                        autoComplete="new-password"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowPassNew(!showPassNew)}
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground hover:text-foreground cursor-pointer"
                                        tabIndex={-1}
                                    >
                                        {showPassNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="confirmPassword" className="text-xs font-semibold">Confirm New Password</Label>
                                <div className="relative">
                                    <Input 
                                        id="confirmPassword"
                                        type={showPassConfirm ? "text" : "password"} 
                                        required 
                                        value={passConfirm} 
                                        onChange={(e) => setPassConfirm(e.target.value)} 
                                        placeholder="Re-enter new password"
                                        className="bg-background/60 pr-10"
                                        autoComplete="new-password"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowPassConfirm(!showPassConfirm)}
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground hover:text-foreground cursor-pointer"
                                        tabIndex={-1}
                                    >
                                        {showPassConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <Button type="submit" disabled={passLoading} className="w-full font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98">
                                {passLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating Password...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="h-4 w-4 mr-2" /> Update Password
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* MEMBERSHIP TIER UPGRADE REQUEST MODAL */}
            <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
                <DialogContent className="w-[96vw] sm:max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Sparkles className="h-5 w-5 text-indigo-400" /> Request Feature or Add-On
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Submit a request to the server administrator to enable this feature or add-on for your account.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmitUpgrade} className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0">
                        {upgradeSuccessMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{upgradeSuccessMsg}</span>
                            </div>
                        )}
                        {upgradeErrMsg && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{upgradeErrMsg}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Requested Feature</Label>
                            <Input 
                                readOnly 
                                value={addonsCatalog.find(a => a.id === targetTier)?.name || "Optional Feature"} 
                                className="bg-background/80 text-xs font-medium text-foreground cursor-not-allowed" 
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Note / Special Requests (Optional)</Label>
                            <Textarea 
                                rows={3}
                                placeholder="e.g. Looking for Apple TV 4K HDR playback and Live TV access."
                                value={upgradeNote}
                                onChange={(e) => setUpgradeNote(e.target.value)}
                                className="bg-background/80 text-xs"
                            />
                        </div>

                        <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 shrink-0">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setUpgradeModalOpen(false)}
                                className="text-xs w-full sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                size="sm" 
                                disabled={submittingUpgrade}
                                className="font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 w-full sm:w-auto shrink-0 whitespace-nowrap"
                            >
                                {submittingUpgrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Submit Upgrade Request
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* SUB-ACCOUNT ADD / EDIT MODAL */}
            <Dialog open={subModalOpen} onOpenChange={setSubModalOpen}>
                <DialogContent className="w-[96vw] sm:max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Users className="h-5 w-5 text-purple-400" />
                            {subEditingId ? "Edit Household Sub-Account" : "Add Household Sub-Account"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Set up a nested profile for family members or shared living room devices.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveSubAccount} className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0">
                        {subModalMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{subModalMsg}</span>
                            </div>
                        )}
                        {subModalErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{subModalErr}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Profile Type & Content Policy</Label>
                            <Select value={subType} onValueChange={(val: any) => setSubType(val)}>
                                <SelectTrigger className="bg-background/80 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LIVING_ROOM">📺 Living Room TV (Severe Nudity Excluded)</SelectItem>
                                    <SelectItem value="KID">👶 Kids Account (Kids-Only Server & PG Ceiling)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Profile Name / Device Label</Label>
                            <Input
                                required
                                placeholder={subType === "KID" ? "e.g. Timmy's Tablet" : "e.g. Living Room Apple TV"}
                                value={subLabel}
                                onChange={(e) => setSubLabel(e.target.value)}
                                className="bg-background/80 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Plex Username or Plex Email</Label>
                            <Input
                                required
                                placeholder="e.g. user@gmail.com or PlexUsername"
                                value={subPlexHandle}
                                onChange={(e) => setSubPlexHandle(e.target.value)}
                                className="bg-background/80 text-xs font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                An automated Plex friend invite with curated libraries will be dispatched to this Plex user.
                            </p>
                        </div>

                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-muted-foreground space-y-1">
                            <span className="font-bold text-foreground text-xs block">
                                {subType === "KID" ? "🧸 Kids Protection Policy" : "📺 Living Room Policy"}
                            </span>
                            <p>
                                {subType === "KID"
                                    ? "Restricted to the dedicated Kids library pool with maximum PG rating ceiling and horror/NSFW/gore content automatically hidden."
                                    : "Shares your default library sections with IMDb Severe Nudity tags filtered out by default."
                                }
                            </p>
                        </div>

                        <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSubModalOpen(false)}
                                className="text-xs w-full sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                size="sm" 
                                disabled={savingSub}
                                className="font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white gap-1.5 cursor-pointer w-full sm:w-auto shrink-0 whitespace-nowrap"
                            >
                                {savingSub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                {subEditingId ? "Update Sub-Account" : "Create Sub-Account"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* DELETE SUB-ACCOUNT CONFIRM DIALOG */}
            <Dialog open={Boolean(deleteSubConfirmId)} onOpenChange={(open) => {
                if (!open) {
                    setDeleteSubConfirmId(null);
                    setDeleteSubErr("");
                }
            }}>
                <DialogContent className="w-[96vw] sm:max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                            <AlertTriangle className="h-5 w-5 text-red-400" /> Remove Household Sub-Account?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Are you sure you want to remove this sub-account? This will immediately revoke their Plex server access and delete the sub-profile.
                        </DialogDescription>
                    </DialogHeader>
                    {deleteSubErr && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{deleteSubErr}</span>
                        </div>
                    )}
                    <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 shrink-0">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                                setDeleteSubConfirmId(null);
                                setDeleteSubErr("");
                            }}
                            className="text-xs cursor-pointer w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="button" 
                            size="sm" 
                            variant="destructive"
                            disabled={deletingSub}
                            onClick={() => deleteSubConfirmId && handleDeleteSubAccount(deleteSubConfirmId)}
                            className="font-bold text-xs gap-1.5 cursor-pointer active:scale-95 w-full sm:w-auto shrink-0 whitespace-nowrap"
                        >
                            {deletingSub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Confirm Removal
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* FLOATING SAVE BAR & UNSAVED CHANGES MODAL */}
            <UnsavedChangesPrompt
                hasUnsavedChanges={hasUnsavedChanges}
                unsavedSections={unsavedSections}
                onSave={handleSaveAllDirty}
                onDiscard={handleDiscardAll}
                isSaving={savingAllDirty || savingLibraries || savingNotif || savingContent || kindleSaving}
            />
        

            {/* UPDATE PRIMARY EMAIL MODAL */}
            <Dialog open={showEditEmailModal} onOpenChange={setShowEditEmailModal}>
                <DialogContent className="sm:max-w-[425px] bg-[#121218]/95 border-border/60">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <Mail className="h-5 w-5 text-primary" />
                            Update Primary Email Address
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Your primary email is used for account sign-in, password resets, and automated system alerts.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {editEmailMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{editEmailMsg}</span>
                            </div>
                        )}
                        {editEmailErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-2.5 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{editEmailErr}</span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Primary Email Address</Label>
                            <Input
                                type="email"
                                value={editEmailInput}
                                onChange={(e) => setEditEmailInput(e.target.value)}
                                placeholder="user@example.com"
                                className="font-mono text-xs"
                                autoFocus
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowEditEmailModal(false)}
                            disabled={editEmailLoading}
                            className="text-xs w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveUserPrimaryEmail}
                            disabled={editEmailLoading || !editEmailInput.trim()}
                            className="text-xs font-bold gap-1.5 w-full sm:w-auto shrink-0 whitespace-nowrap"
                        >
                            {editEmailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save Email
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog></div>
    );
}
