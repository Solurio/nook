"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rtcConfig, type Signal } from "@/lib/webrtc";

interface Args {
  itemId: string;
  /** userId of whoever is broadcasting, or null. */
  broadcasterId: string | null;
  /** my userId */
  me: string;
  /** other people present (their userIds) */
  peerIds: string[];
  sendSignal: (signal: Signal) => void;
  onSignal: (handler: (signal: Signal) => void) => () => void;
}

export interface Screencast {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** true once display-capture was cancelled/denied. */
  cancelled: boolean;
  /** Opens the browser's share picker; resolves true if a stream was granted. */
  startShare: () => Promise<boolean>;
  stopShare: () => void;
}

/**
 * Runs the WebRTC mesh for one screencast item. The broadcaster adds their
 * captured tracks to a connection per viewer and offers; viewers answer and
 * render the incoming stream. All signalling rides the room channel.
 */
export function useScreencast({
  itemId,
  broadcasterId,
  me,
  peerIds,
  sendSignal,
  onSignal,
}: Args): Screencast {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const localRef = useRef<MediaStream | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const amBroadcaster = broadcasterId === me;

  const closePc = useCallback((peer: string) => {
    const pc = pcs.current.get(peer);
    if (!pc) return;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    try {
      pc.close();
    } catch {
      // Already closed.
    }
    pcs.current.delete(peer);
  }, []);

  const closeAll = useCallback(() => {
    pcs.current.forEach((_, peer) => closePc(peer));
  }, [closePc]);

  const makePc = useCallback(
    (peer: string) => {
      const pc = new RTCPeerConnection(rtcConfig);
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({ kind: "ice", itemId, from: me, to: peer, candidate: event.candidate.toJSON() });
        }
      };
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null);
      };
      pcs.current.set(peer, pc);
      return pc;
    },
    [itemId, me, sendSignal],
  );

  // Broadcaster: build a fresh connection to a viewer and offer.
  const offerTo = useCallback(
    async (peer: string) => {
      const stream = localRef.current;
      if (!stream) return;
      closePc(peer);
      const pc = makePc(peer);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ kind: "offer", itemId, from: me, to: peer, sdp: offer });
    },
    [closePc, itemId, makePc, me, sendSignal],
  );

  // stopShare is referenced by the track "ended" handler, so it lives in a ref.
  const stopShareRef = useRef<() => void>(() => {});
  const stopShare = useCallback(() => {
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
    closeAll();
  }, [closeAll]);
  useEffect(() => {
    stopShareRef.current = stopShare;
  }, [stopShare]);

  const startShare = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      localRef.current = stream;
      setLocalStream(stream);
      setCancelled(false);
      // The browser's own "stop sharing" ends the video track.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopShareRef.current());
      return true;
    } catch {
      setCancelled(true);
      return false;
    }
  }, []);

  // Incoming signalling.
  useEffect(() => {
    const unsub = onSignal((signal) => {
      if (signal.itemId !== itemId) return;

      void (async () => {
        if (amBroadcaster) {
          if (signal.kind === "join" && signal.from !== me) {
            await offerTo(signal.from);
          } else if (signal.kind === "answer" && signal.to === me) {
            const pc = pcs.current.get(signal.from);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (signal.kind === "ice" && signal.to === me) {
            const pc = pcs.current.get(signal.from);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          }
          return;
        }

        if (!broadcasterId || signal.from !== broadcasterId) return;

        if (signal.kind === "offer" && signal.to === me) {
          closePc(signal.from);
          const pc = makePc(signal.from);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ kind: "answer", itemId, from: me, to: signal.from, sdp: answer });
        } else if (signal.kind === "ice" && signal.to === me) {
          const pc = pcs.current.get(signal.from);
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        }
      })();
    });
    return unsub;
  }, [amBroadcaster, broadcasterId, itemId, me, offerTo, closePc, makePc, sendSignal, onSignal]);

  // Viewer: announce readiness so the broadcaster offers (also covers joining
  // after the stream already started).
  useEffect(() => {
    if (!broadcasterId || amBroadcaster) return;
    sendSignal({ kind: "join", itemId, from: me });
    return () => setRemoteStream(null);
  }, [broadcasterId, amBroadcaster, itemId, me, sendSignal]);

  // Broadcaster: keep a connection to each present viewer.
  useEffect(() => {
    if (!amBroadcaster || !localStream) return;
    const present = new Set(peerIds);
    peerIds.forEach((peer) => {
      if (!pcs.current.has(peer)) void offerTo(peer);
    });
    pcs.current.forEach((_, peer) => {
      if (!present.has(peer)) closePc(peer);
    });
  }, [amBroadcaster, localStream, peerIds, offerTo, closePc]);

  // Nobody is broadcasting: tear everything down. Clearing the stream here is
  // the whole point of the effect -- reacting to the broadcaster leaving.
  useEffect(() => {
    if (broadcasterId) return;
    closeAll();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemoteStream(null);
  }, [broadcasterId, closeAll]);

  // Unmount.
  useEffect(() => {
    return () => {
      stopShareRef.current();
      closeAll();
    };
  }, [closeAll]);

  return { localStream, remoteStream, cancelled, startShare, stopShare };
}
