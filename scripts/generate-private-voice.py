#!/usr/bin/env python3
"""Generate the authenticated Daily Goals prompt library from one voice sample.

This is an offline maintainer tool. The web app serves only the resulting fixed
audio clips and never exposes the reference recording to the browser.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
from pathlib import Path


CLIPS = {
    "onboarding-bubu": "Hey Bubu. I can now help you log each subject, update chapter progress, and prepare tomorrow's tasks without tedious typing.",
    "onboarding-shona": "Hey Shona. I can now help you log each subject, update chapter progress, and prepare tomorrow's tasks without tedious typing.",
    "coverage": "Was that the full chapter end to end, or only a partial section?",
    "subject-completion": "Did you complete this selected topic or the full chapter today? Say yes only if it is genuinely finished.",
    "weakness": "Any weak concept or mistake to remember? Say skip if there was none.",
    "discipline": "What was your overall discipline score out of one hundred?",
    "plan-completion": "What percentage of today's plan did you complete?",
    "tomorrow": "Last question. What are you going to study tomorrow? Say skip if you do not want any to-do tasks.",
    "review-bubu": "Here is your complete review, Bubu. Check every value and tomorrow's to-do tasks. Say yes to save, or edit anything on screen.",
    "review-shona": "Here is your complete review, Shona. Check every value and tomorrow's to-do tasks. Say yes to save, or edit anything on screen.",
    "saved-bubu": "Perfect, Bubu. Your study log and confirmed chapter progress are safely saved.",
    "saved-shona": "Perfect, Shona. Your study log and confirmed chapter progress are safely saved.",
}

for subject in ("physics", "chemistry", "botany", "zoology"):
    title = subject.title()
    for nickname in ("bubu", "shona"):
        CLIPS[f"study-{subject}-{nickname}"] = (
            f"{nickname.title()}, what did you study in {title} today? Name the chapter or topic and say whether it was new learning, practice, or revision. You can say skip."
        )
    CLIPS[f"hours-{subject}"] = f"How much time did you give to {title} for this work?"
    CLIPS[f"questions-{subject}"] = f"How many {title} questions did you solve?"
    CLIPS[f"intensity-{subject}"] = f"What was the {title} intensity from one to five?"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--checkpoints", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--nltk-data", type=Path)
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N clips for a preview")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.nltk_data:
        os.environ["NLTK_DATA"] = str(args.nltk_data)

    # Melo imports unidic even for English. Reuse its bundled lightweight
    # dictionary so this offline tool does not run a network installer.
    import unidic
    import unidic_lite

    unidic.DICDIR = unidic_lite.DICDIR

    import numpy as np
    import soundfile as sf
    import torch
    from melo.api import TTS
    from openvoice.api import ToneColorConverter

    args.output.mkdir(parents=True, exist_ok=True)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    converter_dir = args.checkpoints / "converter"
    converter = ToneColorConverter(
        str(converter_dir / "config.json"),
        device=device,
    )
    # OpenVoice V2's current constructor still forwards unknown keyword
    # arguments to its base class, so disable watermarking after construction.
    converter.watermark_model = None
    converter.load_ckpt(str(converter_dir / "checkpoint.pth"))

    audio, sample_rate = sf.read(str(args.reference), always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Average clean, speech-dense windows instead of asking a VAD/transcription
    # service to process the confidential source recording.
    window = int(sample_rate * 7.5)
    start = int(sample_rate * 4)
    end = max(start, len(audio) - int(sample_rate * 8))
    candidates: list[tuple[float, int, np.ndarray]] = []
    for offset in range(start, end - window + 1, window):
        segment = np.asarray(audio[offset : offset + window], dtype=np.float32)
        rms = float(np.sqrt(np.mean(np.square(segment))))
        peak = float(np.max(np.abs(segment)))
        if rms >= 0.012 and peak <= 1.001:
            candidates.append((rms, offset, segment))
    if not candidates:
        raise RuntimeError("No speech-dense reference windows were found")
    candidates = sorted(candidates, reverse=True)[:16]
    candidates.sort(key=lambda item: item[1])

    with tempfile.TemporaryDirectory(prefix="neet-private-voice-") as tmp_value:
        tmp = Path(tmp_value)
        segment_paths: list[str] = []
        for index, (_, _, segment) in enumerate(candidates):
            path = tmp / f"reference-{index:02d}.wav"
            sf.write(path, segment, sample_rate)
            segment_paths.append(str(path))

        target_se = converter.extract_se(segment_paths, str(args.output / "adarsh-speaker-embedding.pth"))
        tts = TTS(language="EN", device=device)
        speaker_id = tts.hps.data.spk2id["EN_INDIA"]
        source_se = torch.load(
            args.checkpoints / "base_speakers" / "ses" / "en-india.pth",
            map_location=device,
            weights_only=True,
        ).to(device)

        entries = list(CLIPS.items())
        if args.limit > 0:
            entries = entries[: args.limit]

        for index, (clip_id, text) in enumerate(entries, start=1):
            base_path = tmp / f"{clip_id}-base.wav"
            converted_path = tmp / f"{clip_id}-converted.wav"
            output_path = args.output / f"{clip_id}.mp3"
            print(f"[{index}/{len(entries)}] {clip_id}", flush=True)
            tts.tts_to_file(text, speaker_id, str(base_path), speed=1.0, quiet=True)
            converter.convert(
                audio_src_path=str(base_path),
                src_se=source_se,
                tgt_se=target_se,
                output_path=str(converted_path),
                message="@Adarsh",
            )
            subprocess.run(
                [
                    str(args.ffmpeg),
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(converted_path),
                    "-ac",
                    "1",
                    "-ar",
                    "24000",
                    "-af",
                    "loudnorm=I=-18:TP=-1.5:LRA=11",
                    "-codec:a",
                    "libmp3lame",
                    "-b:a",
                    "96k",
                    str(output_path),
                ],
                check=True,
            )

    print(f"Generated {len(entries)} private clips in {args.output}")


if __name__ == "__main__":
    main()
