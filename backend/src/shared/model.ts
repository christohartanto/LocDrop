// SHARED (Phase 0a). Database item types and mappers to API types.

import type { Group, MyNote, NoteDetail, NoteStatus, NoteSummary, Visibility } from "./api-types";

export interface UserItem {
  PK: string;
  SK: "PROFILE";
  username: string;
  passwordHash: string;
  activeNoteCount: number;
  createdAt: string;
}

export interface NoteItem {
  PK: string;
  SK: "META";
  id: string;
  authorUsername: string;
  text: string;
  lat: number;
  lng: number;
  geohash: string;
  visibility: Visibility;
  groupId?: string;
  anonymous: boolean;
  burnOnRead: boolean;
  status: NoteStatus;
  createdAt: string;
  consumedBy?: string;
  consumedAt?: string;
  recalledAt?: string;
  gsi1pk?: string; // present only while active
  gsi1sk?: string;
  gsi2pk: string;
  gsi2sk: string;
}

export function toMyNote(n: NoteItem): MyNote {
  return {
    id: n.id,
    text: n.text,
    lat: n.lat,
    lng: n.lng,
    visibility: n.visibility,
    groupId: n.groupId,
    anonymous: n.anonymous,
    burnOnRead: n.burnOnRead,
    status: n.status,
    createdAt: n.createdAt,
    consumedAt: n.consumedAt,
    recalledAt: n.recalledAt,
  };
}

export function toNoteSummary(n: NoteItem, distanceM: number): NoteSummary {
  return {
    id: n.id,
    distanceM: Math.round(distanceM),
    lat: n.lat,
    lng: n.lng,
    authorName: n.anonymous ? null : n.authorUsername,
    visibility: n.visibility,
    burnOnRead: n.burnOnRead,
    createdAt: n.createdAt,
  };
}

export function toNoteDetail(n: NoteItem, distanceM: number, consumedByThisRead: boolean): NoteDetail {
  return { ...toNoteSummary(n, distanceM), text: n.text, consumedByThisRead };
}

// Groups (A-4). Group names never change after creation, so copying the name onto the
// join-code and membership items is safe and saves a read on join and list.

export interface GroupItem {
  PK: string; // GROUP#<groupId>
  SK: "META";
  groupId: string;
  name: string;
  joinCode: string;
  createdBy: string;
  createdAt: string;
}

export interface JoinCodeItem {
  PK: string; // JOINCODE#<code>
  SK: "META";
  joinCode: string;
  groupId: string;
  name: string;
}

export interface MembershipItem {
  PK: string; // USER#<username>
  SK: string; // GROUP#<groupId>
  username: string;
  groupId: string;
  name: string;
  joinCode: string;
  joinedAt: string;
}

export function toGroup(g: { groupId: string; name: string; joinCode: string }): Group {
  return { groupId: g.groupId, name: g.name, joinCode: g.joinCode };
}

// Live pop-ups (A-9).
export interface ConnectionItem {
  PK: string; // CONN#<connectionId>
  SK: "META";
  connectionId: string;
  username: string;
  connectedAt: string;
  expiresAt: number; // epoch seconds; DynamoDB TTL removes connections whose $disconnect never arrived
  lat?: number; // set by the first "location" message
  lng?: number;
  geohash?: string;
  gsi1pk?: string; // WSCELL#<geohash7>, only once the location is known
  gsi1sk?: string; // connectionId
}
