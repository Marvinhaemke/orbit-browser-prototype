import assert from "node:assert/strict";
import {test} from "node:test";
import {embeddingPolicy} from "../prototype/focus/embedding-policy.mjs";

test("hosted pages reject mixed content without contacting the endpoint", async () => {
  let requests = 0;
  const result = await embeddingPolicy("http://example.com/", "https://orbit.example", () => { requests++; });
  assert.deepEqual(result, {blocked: true, reason: "mixed-content"}); assert.equal(requests, 0);
});

test("local fixtures skip preflight and localhost development can embed HTTP", async () => {
  let requests = 0;
  const request = async () => { requests++; return {ok: true, json: async () => ({blocked: false})}; };
  assert.equal((await embeddingPolicy("http://localhost:8766/fixtures/notes.html", "http://localhost:8766", request)).reason, "same-origin");
  assert.equal(requests, 0);
  assert.equal((await embeddingPolicy("http://example.com/", "http://localhost:8766", request)).blocked, false);
  assert.equal(requests, 1);
});

test("both page tabs and canvas previews receive the endpoint's embedding rejection", async () => {
  const policy = {blocked: true, reason: "frame-ancestors"};
  const result = await embeddingPolicy("https://example.com/path?q=a b", "https://orbit.example", async (route, options) => {
    assert.equal(route, "/api/frame-policy?url=https%3A%2F%2Fexample.com%2Fpath%3Fq%3Da%2520b");
    assert.ok(options.signal instanceof AbortSignal);
    return {ok: true, json: async () => policy};
  });
  assert.deepEqual(result, policy);
});

test("unavailable advisory endpoints leave enforcement to the browser", async () => {
  for (const request of [async () => ({ok: false}), async () => { throw new Error("offline"); }, async () => ({ok: true, json: async () => { throw new Error("invalid JSON"); }})]) {
    assert.deepEqual(await embeddingPolicy("https://example.com/", "https://orbit.example", request), {blocked: false, reason: "unverified"});
  }
});
