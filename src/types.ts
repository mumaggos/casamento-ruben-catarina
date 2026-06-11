/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Photo {
  id: string;
  author: string;
  category: "cerimonia" | "festa" | "amigos" | "momentos";
  imageUrl: string; // base64 encoded compressed image
  likesCount: number;
  likedBy: string[]; // array of user IDs (anonymous uids)
  createdAt: any; // Firestore Timestamp
  authorId: string; // The anonymous user UID who uploaded it
  favorite?: boolean; // Highlighted/Pinned by admin for Momentia
}

export interface Message {
  id: string;
  author: string;
  text: string;
  audioUrl?: string; // base64 encoded audio
  hasAudio: boolean;
  duration?: number; // duration in seconds
  createdAt: any; // Firestore Timestamp
  authorId: string;
}

export interface MusicRequest {
  id: string;
  title: string;
  artist: string;
  requestedBy: string;
  createdAt: any;
  authorId: string;
}

export interface SpecialMoment {
  id: string;
  momentName: string;
  markedBy: string;
  createdAt: any;
  authorId: string;
}

export type ActiveTab = "home" | "location" | "photos" | "guestbook" | "quiz" | "memoria";
