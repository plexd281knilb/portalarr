export interface StreamTelemetry {
    sessionKey?: string;
    sessionId?: string;
    title: string;
    year?: string;
    mediaType: "movie" | "episode" | "track" | "unknown";
    player: string;
    platform: string;
    deviceType?: string;
    ipAddress?: string;
    videoResolution?: string;
    sourceResolution?: string;
    videoCodec?: string;
    audioCodec?: string;
    streamAudioCodec?: string;
    streamBitrate?: number;
    transcodeDecision: "direct play" | "direct stream" | "transcode" | "copy" | "unknown";
    transcodeSpeed?: string;
    transcodeHwRequested?: boolean;
    transcodeReason?: string;
    subtitleDecision?: string;
    subtitleCodec?: string;
    percentComplete?: number;
    state?: "playing" | "paused" | "buffering";
    serverName?: string;
}

export interface DetectedIssue {
    id: string;
    type: "roku_auto_adjust" | "bandwidth_cap_720p" | "subtitle_burn" | "audio_transcode" | "slow_transcode" | "indirect_relay" | "browser_limit";
    severity: "error" | "warning" | "info";
    title: string;
    summary: string;
    deviceAffected: string;
    quickFix: string;
    fixGuideId?: "roku" | "appletv" | "firetv" | "smarttv" | "googletv" | "web" | "mobile";
    steps: string[];
}

export interface StreamPatternInsight {
    patternType: "roku_auto_adjust_chronic" | "bandwidth_cap_720p_chronic" | "subtitle_burn_chronic" | "browser_transcode_chronic" | "transcode_buffer_chronic" | "optimal";
    severity: "info" | "warning" | "error";
    title: string;
    description: string;
    affectedDevices: string[];
    occurrenceCount: number;
    remedy: string;
    fixGuideId?: "roku" | "appletv" | "firetv" | "smarttv" | "googletv" | "web" | "mobile";
}

export interface AudioTrackInfo {
    id: number;
    codec: string;
    channels: number;
    channelLayout?: string;
    audioChannelLayout?: string;
    bitrate?: string;
    language: string;
    languageCode?: string;
    title?: string;
    displayTitle?: string;
    selected: boolean;
    default: boolean;
}

export interface SubtitleTrackInfo {
    id: number;
    codec: string;
    language: string;
    languageCode?: string;
    title?: string;
    forced: boolean;
    selected: boolean;
    default: boolean;
}

export interface MediaFilePart {
    id: number;
    file: string;
    sizeGb: number;
    container: string;
}

export interface MediaStreamInspection {
    mediaType: "movie" | "episode" | "book" | "unknown";
    title: string;
    year?: string;
    ratingKey?: string;
    serverName?: string;
    files: MediaFilePart[];
    audioTracks: AudioTrackInfo[];
    subtitleTracks: SubtitleTrackInfo[];
    hasEnglishAudio: boolean;
    hasSpanishAudio: boolean;
    activeAudioTrack?: AudioTrackInfo;
    hasEnglishSubtitles: boolean;
    verdict: "AUDIO_EXISTS_CLIENT_FIX" | "MISSING_LANGUAGE_TRACK" | "FILE_CORRUPT" | "NOT_IN_LIBRARY" | "OK";
    diagnosisSummary: string;
    recommendedClientSteps?: string[];
}

export interface AgentActionReport {
    action: "INSPECT_MEDIA" | "RADARR_SEARCH_GRAB" | "SONARR_SEARCH_GRAB" | "REDOWNLOAD_BOOK" | "ESCALATE_ADMIN_TICKET" | "STREAM_PATTERN_DIAGNOSTIC";
    status: "SUCCESS" | "FAILED" | "SKIPPED" | "ESCALATED";
    target: string;
    summary: string;
    details?: any;
    ticketId?: string;
    timestamp: string;
}

export interface UserDiagnosticSnapshot {
    username: string;
    email?: string;
    role: string;
    activeStreamsCount: number;
    primaryActiveStream?: StreamTelemetry | null;
    activeStreams: StreamTelemetry[];
    recentDevices: string[];
    recentWatchHistory: Array<{
        title: string;
        fullTitle: string;
        player: string;
        date: string;
        percentComplete: number;
        mediaType: string;
    }>;
    serversOnlineCount: number;
    detectedIssues: DetectedIssue[];
    patternInsights?: StreamPatternInsight[];
    generatedAt: string;
}

export interface AiChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
    diagnosticsSnapshot?: Partial<UserDiagnosticSnapshot>;
    providerUsed?: string;
    actionsTaken?: AgentActionReport[];
    mediaInspection?: MediaStreamInspection;
    playbackProbe?: any;
}

export interface AiAssistantResponse {
    success: boolean;
    answer?: string;
    diagnostics?: UserDiagnosticSnapshot;
    providerUsed?: string;
    actionsTaken?: AgentActionReport[];
    mediaInspection?: MediaStreamInspection;
    playbackProbe?: any;
    error?: string;
}
