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
    generatedAt: string;
}

export interface AiChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
    diagnosticsSnapshot?: Partial<UserDiagnosticSnapshot>;
    providerUsed?: string;
}

export interface AiAssistantResponse {
    success: boolean;
    answer?: string;
    diagnostics?: UserDiagnosticSnapshot;
    providerUsed?: string;
    error?: string;
}
