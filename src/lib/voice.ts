/**
 * Secure voice notes for an incident.
 *
 * Audio lives in the private `voice-notes` bucket under `<alert_id>/<uuid>.webm`,
 * readable only by the incident's patient, responders and admins (storage RLS).
 * The message row in `incident_messages` carries the metadata.
 */
import { supabase } from "@/integrations/supabase/client";

export const VOICE_BUCKET = "voice-notes";
export const MAX_VOICE_SECONDS = 120;

export type VoiceRole = "patient" | "responder" | "dispatcher";

export type Recorder = {
  stop: () => Promise<{ blob: Blob; seconds: number }>;
  cancel: () => void;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Starts recording. Throws a human-readable error when the mic is unavailable. */
export async function startRecording(): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("This device or browser cannot record audio.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("Microphone access was blocked. Allow the microphone in your browser settings, then try again.");
    }
    if (name === "NotFoundError") throw new Error("No microphone was found on this device.");
    throw new Error("Could not start recording.");
  }

  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const startedAt = Date.now();
  rec.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve({
            blob: new Blob(chunks, { type: rec.mimeType || "audio/webm" }),
            seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          });
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
  };
}

type SendArgs = {
  alertId: string;
  blob: Blob;
  seconds: number;
  senderRole: VoiceRole;
  senderLabel: string | null;
  recipientRole: string;
  urgent?: boolean;
};

/** Uploads the audio, then records the message. Never reports success on a failed upload. */
export async function sendVoiceNote({
  alertId, blob, seconds, senderRole, senderLabel, recipientRole, urgent = false,
}: SendArgs) {
  if (blob.size === 0) throw new Error("The recording was empty.");
  if (blob.size > 10 * 1024 * 1024) throw new Error("That recording is too long to send.");

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to send a voice note.");

  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${alertId}/${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from(VOICE_BUCKET).upload(path, blob, {
    contentType: blob.type || "audio/webm",
    upsert: false,
  });
  if (up.error) throw new Error(`Voice note upload failed: ${up.error.message}`);

  const { error } = await supabase.from("incident_messages").insert({
    alert_id: alertId,
    sender_id: u.user.id,
    sender_label: senderLabel ?? u.user.email ?? senderRole,
    sender_role: senderRole,
    recipient_role: recipientRole,
    body: `Voice note · ${seconds}s`,
    kind: "voice",
    media_path: path,
    duration_seconds: seconds,
    urgent,
  } as never);
  if (error) {
    await supabase.storage.from(VOICE_BUCKET).remove([path]);
    throw new Error(`Voice note could not be delivered: ${error.message}`);
  }
  return path;
}

/** Short-lived authenticated playback URL. */
export async function voiceNoteUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error("This recording could not be opened.");
  return data.signedUrl;
}

export async function markListened(messageId: string) {
  await supabase
    .from("incident_messages")
    .update({ listened_at: new Date().toISOString() } as never)
    .eq("id", messageId)
    .is("listened_at", null);
}

export function durationLabel(seconds: number | null | undefined) {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
