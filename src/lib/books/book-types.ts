export type MediaType = "ebook" | "audiobook";

export type BookAvailabilityStatus = "AVAILABLE" | "REQUESTED" | "DOWNLOADING" | "NOT_AVAILABLE";

export interface BookDiscoveryItem {
    id?: string;
    title: string;
    author: string;
    series?: string;
    volumeNumber?: string;
    coverUrl?: string;
    publishYear?: string;
    overview?: string;
    mediaType: MediaType;
    isbn?: string;
    asin?: string;
    rating?: number;
    ratingCount?: number;
    genres?: string[];
    availability?: {
        status: BookAvailabilityStatus;
        bookId?: string;
        requestId?: string;
        libraryName?: string;
        libraryId?: string;
        filePath?: string;
        fileType?: string;
    };
}

export interface AuthorInfo {
    id?: string;
    name: string;
    cleanName?: string;
    foreignAuthorId?: string;
    biography?: string;
    photoUrl?: string;
    birthDate?: string;
    deathDate?: string;
    monitored?: boolean;
    booksCount?: number;
    seriesCount?: number;
    books?: BookDiscoveryItem[];
    series?: SeriesSummary[];
}

export interface SeriesSummary {
    id?: string;
    title: string;
    cleanTitle?: string;
    authorName?: string;
    coverUrl?: string;
    totalVolumes?: number;
    ownedVolumes?: number;
    monitored?: boolean;
}

export interface SeriesVolumeItem {
    volumeNumber: string;
    title: string;
    author?: string;
    coverUrl?: string;
    publishYear?: string;
    overview?: string;
    mediaType: MediaType;
    status: "AVAILABLE" | "REQUESTED" | "DOWNLOADING" | "MISSING";
    bookId?: string;
    requestId?: string;
    libraryId?: string;
}

export interface BookSeriesDetail {
    id?: string;
    title: string;
    cleanTitle?: string;
    authorName?: string;
    authorId?: string;
    foreignSeriesId?: string;
    description?: string;
    coverUrl?: string;
    totalVolumes?: number;
    monitored?: boolean;
    volumes: SeriesVolumeItem[];
}

export interface BookRequestInput {
    title: string;
    author?: string;
    series?: string;
    volumeNumber?: string;
    coverUrl?: string;
    publishYear?: string;
    mediaType: MediaType;
    libraryId?: string;
    sendToKindle?: boolean;
    userNotes?: string;
}
