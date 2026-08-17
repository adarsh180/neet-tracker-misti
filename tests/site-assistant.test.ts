import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_WAKE_NAMES, detectAssistantPersona, findAssistantEntity, parseSiteAssistantIntent, stripAssistantAddress } from "../src/lib/site-assistant";

test("parses addressed topic creation without treating the wake phrase as content", () => {
  assert.equal(stripAssistantAddress("Hey Bubu, please open physics"), "open physics");
  assert.deepEqual(parseSiteAssistantIntent("Hey Shona create Torque topic in Rotational Motion"), {
    kind: "CREATE_TOPIC",
    topicName: "Torque",
    chapterName: "Rotational Motion",
    subjectHint: null,
  });
  assert.deepEqual(parseSiteAssistantIntent("please add hybridisation under Chemical Bonding in chemistry"), {
    kind: "CREATE_TOPIC",
    topicName: "hybridisation",
    chapterName: "Chemical Bonding",
    subjectHint: "chemistry",
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
