#!/usr/bin/env python3
"""Derive repeatable musical drop-in cues from the bundled showcase MP3s.

Decodes with macOS afconvert, or with ffmpeg where afconvert does not exist
(Linux, CI, a container), plus NumPy — so the analysis stays local and does
not need an external service. The output is a TypeScript-ready cue map;
review it and commit the selected timestamps to trackPlayer.ts.

    python3 scripts/analyze-track-cues.py             # the whole library
    python3 scripts/analyze-track-cues.py new-song    # just these ids
"""

from __future__ import annotations

import math
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
TRACK_SOURCE = ROOT / "src/engine/trackPlayer.ts"
SAMPLE_RATE = 8_000
HOP_SECONDS = 0.5
WINDOW_SECONDS = 1.0


def showcase_tracks() -> list[tuple[str, Path]]:
    text = TRACK_SOURCE.read_text(encoding="utf-8")
    rows = re.findall(r'\{ id: "([^"]+)", url: "([^"]+\.mp3)"', text)
    # The default/theme row references constants rather than a literal URL.
    return [("theme", ROOT / "public/audio/theme.mp3"), *[
        (track_id, ROOT / "public" / url.lstrip("/")) for track_id, url in rows
    ]]


def decoder_command(path: Path, destination: Path) -> list[str]:
    """afconvert on a Mac, ffmpeg anywhere else. Same 8kHz mono 16-bit WAV
    either way, so cues generated on one machine match the other."""
    if shutil.which("afconvert"):
        return ["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", str(path), str(destination)]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg  # optional, ships a static binary
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            raise SystemExit("Need afconvert (macOS) or ffmpeg on PATH to decode audio")
    return [ffmpeg, "-v", "quiet", "-y", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-c:a", "pcm_s16le", str(destination)]


def decode_mono(path: Path, destination: Path) -> None:
    subprocess.run(
        decoder_command(path, destination),
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def moving_average(values: np.ndarray, radius: int) -> np.ndarray:
    width = radius * 2 + 1
    if len(values) < width:
        return values.copy()
    padded = np.pad(values, (radius, radius), mode="edge")
    return np.convolve(padded, np.ones(width) / width, mode="valid")


def analyze(path: Path) -> tuple[float, list[tuple[float, str]]]:
    with tempfile.TemporaryDirectory(prefix="mosh-track-cues-") as tmp:
        wav_path = Path(tmp) / "track.wav"
        decode_mono(path, wav_path)
        with wave.open(str(wav_path), "rb") as wav_file:
            sample_rate = wav_file.getframerate()
            samples = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype="<i2").astype(np.float32) / 32768.0

    duration = len(samples) / sample_rate
    window = int(sample_rate * WINDOW_SECONDS)
    hop = int(sample_rate * HOP_SECONDS)
    count = max(1, 1 + (len(samples) - window) // hop)
    rms = np.empty(count, dtype=np.float32)
    flux = np.zeros(count, dtype=np.float32)
    previous = None
    taper = np.hanning(window).astype(np.float32)

    for index in range(count):
        frame = samples[index * hop:index * hop + window]
        if len(frame) < window:
            frame = np.pad(frame, (0, window - len(frame)))
        rms[index] = math.sqrt(float(np.mean(frame * frame)) + 1e-12)
        spectrum = np.abs(np.fft.rfft(frame * taper))[1:]
        spectrum /= float(np.sum(spectrum)) + 1e-9
        if previous is not None:
            flux[index] = float(np.sum(np.maximum(0, spectrum - previous)))
        previous = spectrum

    energy_db = 20 * np.log10(np.maximum(rms, 1e-6))
    energy = moving_average(energy_db, 2)
    flux_smooth = moving_average(flux, 1)
    look = max(2, round(4 / HOP_SECONDS))
    shift = np.zeros_like(energy)
    for index in range(look, len(energy) - look):
        shift[index] = float(np.mean(energy[index:index + look]) - np.mean(energy[index - look:index]))

    local = energy - moving_average(energy, max(2, round(8 / HOP_SECONDS)))
    flux_z = (flux_smooth - np.median(flux_smooth)) / (np.std(flux_smooth) + 1e-6)
    energy_z = (energy - np.median(energy)) / (np.std(energy) + 1e-6)
    score = np.abs(shift) * 1.25 + np.maximum(0, flux_z) * 3.0 + np.maximum(0, local) * 0.7 + np.maximum(0, energy_z) * 0.5

    safe_start = min(max(8.0, duration * 0.04), max(0.0, duration - 2.0))
    safe_end = max(safe_start + 1.0, duration - max(10.0, duration * 0.05))
    cue_count = 5 if duration >= 150 else 4 if duration >= 90 else 3 if duration >= 45 else 2
    edges = np.linspace(safe_start, safe_end, cue_count + 1)
    cues: list[tuple[float, str]] = []

    for segment in range(cue_count):
        start_index = max(0, int(edges[segment] / HOP_SECONDS))
        end_index = min(len(score), max(start_index + 1, int(edges[segment + 1] / HOP_SECONDS)))
        candidates = np.arange(start_index, end_index)
        if not len(candidates):
            continue
        # Do not drop into near-silence unless the quiet-to-loud contrast marks
        # an actual break/drop boundary.
        audible = candidates[energy[candidates] > np.percentile(energy, 22)]
        if len(audible):
            candidates = audible
        index = int(candidates[np.argmax(score[candidates])])
        at = round(index * HOP_SECONDS, 1)
        if shift[index] >= 4.0:
            label = "drop"
        elif shift[index] <= -4.0:
            label = "break"
        elif flux_z[index] >= 1.1:
            label = "transition"
        elif energy_z[index] >= 0.75:
            label = "peak"
        else:
            label = "pulse"
        cues.append((at, label))

    return duration, cues


def main() -> None:
    wanted = set(sys.argv[1:])
    print("export const TRACK_CUES = {")
    for track_id, path in showcase_tracks():
        if wanted and track_id not in wanted:
            continue
        duration, cues = analyze(path)
        encoded = ", ".join(f'{{ at: {at:.1f}, label: "{label}" }}' for at, label in cues)
        print(f'  "{track_id}": [{encoded}], // {duration:.1f}s')
    print("} as const;")


if __name__ == "__main__":
    main()
