import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_WAKE_NAMES, chooseAssistantTranscript, detectAssistantPersona, findAssistantEntity, parseAssistantClientControl, parseSiteAssistantIntent, stripAssistantAddress } from "../src/lib/site-assistant";

test("parses addressed topic creation without treating the wake phrase as content", () => {
  assert.equal(stripAssistantAddress("Hey Bubu, please open physics"), "open physics");
  assert.deepEqual(parseSiteAssistantIntent("Hey Shona create Torque topic in Rotational Motion"), {
    kind: "CREATE_TOPIC",
    topicName: "Torque",
    chapterName: "Rotational Motion",
    subjectHint: null,
    classLevel: null,
  });
  assert.deepEqual(parseSiteAssistantIntent("please add hybridisation under Chemical Bonding in chemistry"), {
    kind: "CREATE_TOPIC",
    topicName: "hybridisation",
    chapterName: "Chemical Bonding",
    subjectHint: "chemistry",
    classLevel: null,
  });
});

test("parses safe custom chapter creation with explicit subject, class, and first topic", () => {
  assert.deepEqual(parseSiteAssistantIntent("Hey Bubu create chapter Experimental Mechanics in physics class 11 with topic Lab Measurements"), {
    kind: "CREATE_CHAPTER",
    chapterName: "Experimental Mechanics",
    subjectHint: "physics",
    classLevel: "11",
    firstTopicName: "Lab Measurements",
  });
  assert.deepEqual(parseSiteAssistantIntent("add chapter Plant Experiments for botany standard twelve"), {
    kind: "CREATE_CHAPTER",
    chapterName: "Plant Experiments",
    subjectHint: "botany",
    classLevel: "12",
    firstTopicName: null,
  });
});

test("supports every requested wake name and chooses the right relationship tone", () => {
  for (const wakeName of ASSISTANT_WAKE_NAMES) {
    assert.equal(stripAssistantAddress(`Hey ${wakeName}, open physics`), "open physics");
  }
  assert.deepEqual(detectAssistantPersona("Hey mentor open daily goals", "Shona"), {
    wakeName: "mentor",
    mode: "MENTOR",
    replyName: "Misti",
    acknowledgement: "Absolutely, Misti",
  });
  assert.deepEqual(detectAssistantPersona("Hey hubby open daily goals", "Shona"), {
    wakeName: "hubby",
    mode: "WARM",
    replyName: "my love",
    acknowledgement: "I'm here, my love",
  });
});

test("keeps navigation read-only and sends chapter requests through search", () => {
  assert.deepEqual(parseSiteAssistantIntent("Hey Bubu open daily goals"), {
    kind: "NAVIGATE",
    href: "/daily-goals",
    label: "Daily Goals",
  });
  assert.deepEqual(parseSiteAssistantIntent("open molecular basis of inheritance"), {
    kind: "SEARCH",
    query: "molecular basis of inheritance",
  });
  assert.deepEqual(parseSiteAssistantIntent("Hey Bubu, could you please take me to the Physics page for me"), {
    kind: "NAVIGATE",
    href: "/subjects/physics",
    label: "Physics",
  });
  assert.deepEqual(parseSiteAssistantIntent("I want to open my task list now"), {
    kind: "NAVIGATE",
    href: "/todo",
    label: "Todo Deck",
  });
  assert.deepEqual(parseSiteAssistantIntent("rank predictor"), {
    kind: "NAVIGATE",
    href: "/ai-insights/rank-predictor",
    label: "Rank Predictor",
  });
  assert.deepEqual(parseSiteAssistantIntent("Hey mentor where can I see my rank predictor"), {
    kind: "NAVIGATE",
    href: "/ai-insights/rank-predictor",
    label: "Rank Predictor",
  });
  assert.deepEqual(parseSiteAssistantIntent("where can I use the task copilot"), {
    kind: "NAVIGATE",
    href: "/todo?focus=copilot",
    label: "Task Copilot",
  });
});

test("parses confirmation-gated Todo and progress commands", () => {
  assert.deepEqual(parseSiteAssistantIntent("Hey Bubu add a task revise electrostatics tomorrow for two hours"), {
    kind: "CREATE_TASK",
    title: "revise electrostatics",
    subjectHint: null,
    due: "TOMORROW",
    plannedMinutes: 120,
  });
  const progress = parseSiteAssistantIntent("Hey mentor mark Newton laws of motion complete and add 80 questions");
  assert.equal(progress.kind, "UPDATE_STUDY");
  if (progress.kind === "UPDATE_STUDY") {
    assert.match(progress.query, /newton laws motion/i);
    assert.equal(progress.questionsDelta, 80);
    assert.equal(progress.markCompleted, true);
    assert.equal(progress.coverage, "FULL");
  }
});

test("understands local assistant controls without a network request", () => {
  assert.equal(parseAssistantClientControl("Hey Shona go back"), "BACK");
  assert.equal(parseAssistantClientControl("could you please close the assistant"), "CLOSE");
  assert.equal(parseAssistantClientControl("stop talking"), "MUTE");
  assert.equal(parseAssistantClientControl("speak again"), "UNMUTE");
  assert.equal(parseAssistantClientControl("refresh this page"), "REFRESH");
  assert.equal(parseAssistantClientControl("open chemistry"), null);
});

test("prefers a lower-confidence recognition alternative that maps to a real command", () => {
  assert.deepEqual(chooseAssistantTranscript([
    { transcript: "open fiscal page", confidence: 0.92 },
    { transcript: "open physics page", confidence: 0.78 },
    { transcript: "open physicist cage", confidence: 0.64 },
  ]), { transcript: "open physics page", confidence: 0.78 });
});

test("matches small transcription variations but reports true ambiguity", () => {
  const candidates = [
    { id: "physics", label: "Rotational Motion", value: "physics" },
    { id: "chemistry", label: "Chemical Bonding and Molecular Structure", value: "chemistry" },
  ];
  const rotational = findAssistantEntity("rotation motion", candidates);
  assert.equal(rotational.match?.value, "physics");
  const ambiguous = findAssistantEntity("Biomolecules", [
    { id: "chem", label: "Biomolecules", value: "chemistry" },
    { id: "zoo", label: "Biomolecules", value: "zoology" },
  ]);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.match, null);
});
