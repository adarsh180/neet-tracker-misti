import { Atom, Dna, FlaskConical, Leaf, type LucideIcon } from "lucide-react";

const marks: Record<string, LucideIcon> = { physics: Atom, chemistry: FlaskConical, botany: Leaf, zoology: Dna };
export default function SubjectMark({ subject, size = 24 }: { subject: string; size?: number }) {
  const Mark = marks[subject.toLowerCase()] ?? Atom;
  return <span className="subject-mark" data-subject={subject.toLowerCase()} aria-hidden="true"><Mark size={size} strokeWidth={1.5} /></span>;
}
