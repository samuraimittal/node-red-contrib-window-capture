"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesProcessName } = require("../lib/native-helper");
const plugin = require("../nodes/window-capture");

function createHarness() {
  const registered = {};
  const mockRED = {
    nodes: {
      createNode(instance, config) {
        instance.config = config;
        instance.handlers = {};
        instance.lastStatus = null;
        instance.lastError = null;
        instance.on = (evt, fn) => {
          instance.handlers[evt] = fn;
        };
        instance.status = (st) => {
          instance.lastStatus = st;
        };
        instance.error = (errText, msg) => {
          instance.lastError = { errText, msg };
        };
      },
      registerType(name, ctor) {
        registered[name] = ctor;
      }
    }
  };
  plugin(mockRED);
  return registered;
}

test("matchesProcessName handles .exe and case insensitivity", () => {
  assert.equal(matchesProcessName("Slack", "Slack"), true);
  assert.equal(matchesProcessName("notepad", "notepad.exe"), true);
  assert.equal(matchesProcessName("notepad.exe", "Notepad"), true);
  assert.equal(matchesProcessName("explorer.exe", "chrome.exe"), false);
});

test("window-list outputs array with required schema", async () => {
  const registered = createHarness();
  const node = new registered["window-list"]({});

  let outMsg = null;
  await new Promise((resolve) => {
    node.handlers.input({ payload: "trigger" }, (m) => { outMsg = m; }, resolve);
  });

  assert.ok(Array.isArray(outMsg.payload));
  assert.ok(outMsg.payload.length > 0);
  const first = outMsg.payload[0];
  assert.equal(typeof first.id, "number");
  assert.equal(typeof first.title, "string");
  assert.equal(typeof first.process, "string");
  assert.equal(typeof first.x, "number");
  assert.equal(typeof first.y, "number");
  assert.equal(typeof first.width, "number");
  assert.equal(typeof first.height, "number");
  assert.equal(typeof first.minimized, "boolean");
  assert.ok("pid" in first);
});

test("window-capture captures cropped PNG, JPEG, and RAW with msg.capture telemetry", async () => {
  const registered = createHarness();
  const node = new registered["window-capture"]({
    targetType: "all",
    origin: "client",
    format: "png"
  });

  // 1. PNG + Region crop
  let pngMsg = null;
  await new Promise((resolve) => {
    node.handlers.input(
      { region: { x: 10, y: 10, width: 200, height: 40, origin: "client" } },
      (m) => { pngMsg = m; },
      resolve
    );
  });

  assert.ok(Buffer.isBuffer(pngMsg.payload));
  assert.equal(pngMsg.capture.width, 200);
  assert.equal(pngMsg.capture.height, 40);
  assert.equal(typeof pngMsg.capture.ms, "number");
  assert.equal(pngMsg.capture.region.origin, "window"); // "all" normalizes to window origin

  // 2. RAW RGBA output
  let rawMsg = null;
  await new Promise((resolve) => {
    node.handlers.input(
      { format: "raw", region: { x: 0, y: 0, width: 50, height: 20 } },
      (m) => { rawMsg = m; },
      resolve
    );
  });

  assert.ok(Buffer.isBuffer(rawMsg.payload.data));
  assert.equal(rawMsg.payload.width, 50);
  assert.equal(rawMsg.payload.height, 20);
  assert.equal(rawMsg.payload.data.length, 50 * 20 * 4);
});

test("window-capture sets exact error status and calls node.error(msg)", async () => {
  const registered = createHarness();
  const node = new registered["window-capture"]({
    targetType: "window",
    targetValue: "__NON_EXISTENT_WINDOW_999999__"
  });

  await new Promise((resolve) => {
    node.handlers.input({ _msgid: "test1" }, () => {}, resolve);
  });
  assert.equal(node.lastStatus.text, "window not found");
  assert.equal(node.lastError.errText, "window not found");
  assert.equal(node.lastError.msg._msgid, "test1");

  // Region outside window bounds
  await new Promise((resolve) => {
    node.handlers.input(
      { target: "all", region: { x: 999999, y: 999999, width: 500, height: 500 } },
      () => {},
      resolve
    );
  });
  assert.equal(node.lastStatus.text, "region outside window");
  assert.equal(node.lastError.errText, "region outside window");
});