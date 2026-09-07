export type AudioInputChannel = "auto" | "left" | "right";

export type AudioInputPreference = {
  deviceId: string | null;
  label: string | null;
  channel: AudioInputChannel;
};

export type AudioInputDevice = {
  deviceId: string;
  groupId: string;
  label: string;
};

const STORAGE_KEY = "cathedral_audio_input_v1";

const DEFAULT_PREFERENCE: AudioInputPreference = {
  deviceId: null,
  label: null,
  channel: "auto",
};

export function loadAudioInputPreference(): AudioInputPreference {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFERENCE };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<AudioInputPreference> | null;
    const channel = parsed?.channel;
    return {
      deviceId: typeof parsed?.deviceId === "string" && parsed.deviceId ? parsed.deviceId : null,
      label: typeof parsed?.label === "string" && parsed.label ? parsed.label : null,
      channel: channel === "left" || channel === "right" ? channel : "auto",
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function saveAudioInputPreference(preference: AudioInputPreference): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preference)); } catch {}
}

export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" && !!device.deviceId)
    .map((device, index) => ({
      deviceId: device.deviceId,
      groupId: device.groupId,
      label: device.label || `Audio input ${index + 1}`,
    }));
}

/** Device ids can rotate when browser permissions/site data change. Recover a
 * remembered interface by its post-permission label before falling back to the
 * system default. */
export function resolveRememberedAudioInput(
  devices: AudioInputDevice[],
  deviceId?: string | null,
  label?: string | null,
): { deviceId: string | null; recoveredByLabel: boolean; found: boolean } {
  if (!deviceId) return { deviceId: null, recoveredByLabel: false, found: true };
  const exact = devices.find((device) => device.deviceId === deviceId);
  if (exact) return { deviceId: exact.deviceId, recoveredByLabel: false, found: true };
  const wanted = label?.trim().toLocaleLowerCase();
  const byLabel = wanted
    ? devices.find((device) => device.label.trim().toLocaleLowerCase() === wanted)
    : undefined;
  return byLabel
    ? { deviceId: byLabel.deviceId, recoveredByLabel: true, found: true }
    : { deviceId: null, recoveredByLabel: false, found: false };
}

function isRetryableConstraintError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === "OverconstrainedError"
    || e?.name === "ConstraintNotSatisfiedError"
    || e?.name === "NotFoundError"
    || e?.name === "DevicesNotFoundError"
    || e?.name === "TypeError"
    || /constraint/i.test(e?.message || "");
}

export type MicrophoneStreamResult = {
  stream: MediaStream;
  requestedDeviceFound: boolean;
  recoveredByLabel: boolean;
};

/** Request a raw interface feed while retaining fallbacks for Safari, older
 * Chromium builds, mobile browsers, and interfaces that reject stereo/rate
 * hints. Permission and hardware-busy errors are never swallowed. */
export async function requestMicrophoneStream(
  preference: Pick<AudioInputPreference, "deviceId" | "label">,
): Promise<MicrophoneStreamResult> {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported in this browser");

  let devices: AudioInputDevice[] = [];
  try { devices = await listAudioInputs(); } catch {}
  const resolved = resolveRememberedAudioInput(devices, preference.deviceId, preference.label);
  // If enumeration itself was blocked, the remembered id is still worth trying.
  const preferredId = resolved.deviceId || preference.deviceId;
  // Disabling all three keeps Chromium off the Android "voice communication"
  // capture path (and gives Safari the least exclusive recording session it
  // can pick) — a plain mic capture with processing left on is what makes
  // the OS reroute Bluetooth from its media (A2DP) profile to a phone-call
  // one and pause whatever else is playing through it. Every attempt below,
  // including every fallback, keeps this triple; only device/channel/rate
  // hints are ever relaxed.
  const noProcessing: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  const raw: MediaTrackConstraints = {
    ...noProcessing,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
  };

  const attempts: Array<{ constraints: MediaStreamConstraints; preferred: boolean }> = preferredId ? [
    { constraints: { audio: { ...raw, deviceId: { exact: preferredId } }, video: false }, preferred: true },
    { constraints: { audio: { ...noProcessing, deviceId: { exact: preferredId } }, video: false }, preferred: true },
    { constraints: { audio: raw, video: false }, preferred: false },
    { constraints: { audio: noProcessing, video: false }, preferred: false },
  ] : [
    { constraints: { audio: raw, video: false }, preferred: false },
    { constraints: { audio: noProcessing, video: false }, preferred: false },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return {
        stream: await mediaDevices.getUserMedia(attempts[i].constraints),
        requestedDeviceFound: !preference.deviceId || attempts[i].preferred,
        recoveredByLabel: resolved.recoveredByLabel,
      };
    } catch (error) {
      lastError = error;
      if (i === attempts.length - 1 || !isRetryableConstraintError(error)) throw error;
    }
  }
  throw lastError;
}
