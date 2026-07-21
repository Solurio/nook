// Shared config and message shapes for the live tab/screen share.
//
// Peer-to-peer over WebRTC, signalled through the room's Supabase channel. Only
// STUN is configured -- that connects most home networks directly. A minority
// of stricter NATs need a TURN relay, which is not free; see README for how to
// add one if a connection refuses to come up.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const rtcConfig: RTCConfiguration = { iceServers: ICE_SERVERS };

/** Signalling messages exchanged to set up a peer connection. */
export type Signal =
  | { kind: "join"; itemId: string; from: string }
  | { kind: "offer"; itemId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; itemId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | {
      kind: "ice";
      itemId: string;
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    };
