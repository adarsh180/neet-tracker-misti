"""Generate private, local voice-clone previews without sending audio to an app API."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torchaudio
from chatterbox.tts_turbo import ChatterboxTurboTTS
from huggingface_hub import snapshot_download


PREVIEWS = {
    "wake": "Hey Bubu, I'm here. Tell me what you want to do.",
    "action": "Sure Bubu. I've created Torque inside Rotational Motion. It's ready for you.",
    "daily": "Hey Shona, how many hours did you study Physics today?",
}

LIBRARY = {
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
    "assistant-ready-warm": "I'm here, my love. What would you like me to take care of?",
    "assistant-ready-mentor": "I'm here, Misti. What shall we focus on?",
    "assistant-ready-buddy": "I'm here, Bubu. What's up?",
    "assistant-working-warm": "Of course, my love. I'm checking that for you.",
    "assistant-working-mentor": "Absolutely, Misti. I'm checking the exact details.",
    "assistant-working-buddy": "You got it, Bubu. I'm checking that now.",
    "assistant-done-warm": "Done, my love. It's ready for you.",
    "assistant-done-mentor": "Done, Misti. Your study workspace is updated.",
    "assistant-done-buddy": "Done, Bubu. You're all set.",
    "assistant-clarify-warm": "My love, I found more than one match. Choose the right one for me.",
    "assistant-clarify-mentor": "Misti, I found more than one match. Choose the exact one to continue.",
    "assistant-error-warm": "It's okay, my love. I didn't change anything uncertain. Please try once more.",
    "assistant-error-mentor": "Nothing uncertain was changed, Misti. Please try the command once more.",
}

for subject in ("physics", "chemistry", "botany", "zoology"):
    title = subject.title()
    for nickname in ("bubu", "shona"):
        LIBRARY[f"study-{subject}-{nickname}"] = (
            f"{nickname.title()}, what did you study in {title} today? Name the chapter or topic and say whether it was new learning, practice, or revision. You can say skip."
        )
    LIBRARY[f"hours-{subject}"] = f"How much time did you give to {title} for this work?"
    LIBRARY[f"questions-{subject}"] = f"How many {title} questions did you solve?"
    LIBRARY[f"intensity-{subject}"] = f"What was the {title} intensity from one to five?"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--checkpoint-dir", type=Path, help="Use an already downloaded local checkpoint directory")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--turbo", action="store_true", help="Use Turbo instead of the lower-memory Nano model")
    parser.add_argument("--temperature", type=float, default=0.72)
    parser.add_argument("--top-p", type=float, default=0.92)
    parser.add_argument("--repetition-penalty", type=float, default=1.2)
    parser.add_argument("--library", action="store_true", help="Generate the complete authenticated application voice library")
    args = parser.parse_args()

    if not args.reference.is_file():
        raise SystemExit(f"Reference audio does not exist: {args.reference}")
    device = "cuda" if args.device == "auto" and torch.cuda.is_available() else ("cpu" if args.device == "auto" else args.device)
    if device == "cuda" and not torch.cuda.is_available():
        raise SystemExit("CUDA was requested but is not available in this Python environment")

    args.output.mkdir(parents=True, exist_ok=True)
    nano = not args.turbo
    checkpoint_dir = str(args.checkpoint_dir) if args.checkpoint_dir else snapshot_download(
        repo_id="ResembleAI/chatterbox-turbo" if args.turbo else "ResembleAI/chatterbox-nano",
        allow_patterns=[
            "ve.safetensors",
            "t3_turbo_v1.safetensors" if args.turbo else "t3_nano_v1.safetensors",
            "s3gen_meanflow.safetensors",
            "*.json",
            "*.txt",
            "*.pt",
        ],
    )
    model = ChatterboxTurboTTS.from_local(checkpoint_dir, device=device, nano=nano)
    model.prepare_conditionals(str(args.reference), norm_loudness=True)
    generated = []
    source_texts = LIBRARY if args.library else PREVIEWS
    for clip_id, text in source_texts.items():
        torch.manual_seed(20260817)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(20260817)
        waveform = model.generate(
            text,
            temperature=args.temperature,
            top_p=args.top_p,
            repetition_penalty=args.repetition_penalty,
            norm_loudness=True,
        )
        output_path = args.output / f"{clip_id}.wav"
        torchaudio.save(str(output_path), waveform.cpu(), model.sr)
        generated.append({"id": clip_id, "text": text, "path": str(output_path), "sampleRate": model.sr})

    report = {
        "model": "chatterbox-turbo" if args.turbo else "chatterbox-nano",
        "device": device,
        "reference": str(args.reference),
        "temperature": args.temperature,
        "topP": args.top_p,
        "repetitionPenalty": args.repetition_penalty,
        "library": args.library,
        "clips": generated,
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
