"use strict";

const { Window, Monitor } = require("node-screenshots");
const {
  getWindowPid,
  getClientOffset,
  matchesProcessName
} = require("../lib/native-helper");

module.exports = function (RED) {
  // =========================================================================
  // NODE 1: window-list
  // =========================================================================
  function WindowListNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      const t0 = Date.now();

      try {
        const wins = Window.all();
        const list = wins.map((w) => ({
          id: w.id(),
          title: w.title(),
          process: w.appName(),
          pid: getWindowPid(w),
          x: w.x(),
          y: w.y(),
          width: w.width(),
          height: w.height(),
          minimized: Boolean(w.isMinimized())
        }));

        const elapsed = Date.now() - t0;
        msg.payload = list;
        node.status({
          fill: "green",
          shape: "dot",
          text: `${list.length} windows (${elapsed}ms)`
        });

        send(msg);
        if (done) done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "enumeration failed" });
        node.error(err.message || String(err), msg);
        if (done) done();
      }
    });
  }

  RED.nodes.registerType("window-list", WindowListNode);

  // =========================================================================
  // NODE 2: window-capture
  // =========================================================================
  function WindowCaptureNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.targetType = config.targetType || "window";
    node.targetValue = config.targetValue || "";
    node.origin = config.origin || "client";
    node.regionX = config.regionX;
    node.regionY = config.regionY;
    node.regionWidth = config.regionWidth;
    node.regionHeight = config.regionHeight;
    node.format = config.format || "png";

    function fail(statusText, msg) {
      node.status({ fill: "red", shape: "ring", text: statusText });
      // Passing msg as the 2nd argument ensures Node-RED Catch nodes handle it
      node.error(statusText, msg);
    }

    function parseOptionalInt(val) {
      if (val === undefined || val === null || val === "") return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? Math.trunc(n) : undefined;
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      const t0 = Date.now();

      try {
        // 1. Resolve Target (msg overrides node config)
        let targetType = node.targetType;
        let targetValue = node.targetValue;

        if (msg.target !== undefined) {
          if (typeof msg.target === "object" && msg.target !== null) {
            targetType = msg.target.type || targetType;
            if (msg.target.value !== undefined) targetValue = msg.target.value;
          } else if (msg.target === "all") {
            targetType = "all";
            targetValue = "";
          } else if (typeof msg.target === "string") {
            targetValue = msg.target;
          }
        }
        if (msg.targetType !== undefined) targetType = msg.targetType;
        if (msg.targetValue !== undefined) targetValue = msg.targetValue;
        if (msg.window !== undefined) {
          targetType = "window";
          targetValue = msg.window;
        } else if (msg.process !== undefined) {
          targetType = "process";
          targetValue = msg.process;
        } else if (msg.id !== undefined) {
          targetType = "id";
          targetValue = msg.id;
        }

        // 2. Resolve Region & Origin (msg.region overrides node config)
        const msgRegion = (typeof msg.region === "object" && msg.region !== null) ? msg.region : {};
        const origin = msgRegion.origin || msg.origin || node.origin || "client";

        const rawX = msgRegion.x !== undefined ? msgRegion.x : node.regionX;
        const rawY = msgRegion.y !== undefined ? msgRegion.y : node.regionY;
        const rawW = msgRegion.width !== undefined ? msgRegion.width : node.regionWidth;
        const rawH = msgRegion.height !== undefined ? msgRegion.height : node.regionHeight;

        const rx = parseOptionalInt(rawX);
        const ry = parseOptionalInt(rawY);
        const rw = parseOptionalInt(rawW);
        const rh = parseOptionalInt(rawH);

        const hasRegion =
          rx !== undefined &&
          ry !== undefined &&
          rw !== undefined &&
          rh !== undefined;

        // 3. Resolve Format
        const format = String(msg.format || node.format || "png").toLowerCase();

        // 4. Locate & Capture Source Image
        let img = null;
        let selectedWin = null;
        let resolvedTargetMeta = { type: targetType, value: targetValue };

        if (targetType === "all") {
          const monitors = Monitor.all();
          if (!monitors || monitors.length === 0) {
            fail("window not found", msg);
            if (done) done();
            return;
          }
          const monitorIdx = parseOptionalInt(targetValue) || 0;
          const mon = monitors[monitorIdx] || monitors[0];
          img = mon.captureImageSync();
          resolvedTargetMeta = { type: "all", monitorId: mon.id() };
        } else {
          const wins = Window.all();
          if (targetType === "id") {
            const targetId = Number(targetValue);
            selectedWin = wins.find((w) => Number(w.id()) === targetId);
          } else if (targetType === "process") {
            selectedWin = wins.find((w) => matchesProcessName(w.appName(), targetValue));
          } else {
            // Default: "window" (matches part of a title, case-insensitive)
            const needle = String(targetValue || "").toLowerCase();
            selectedWin = wins.find((w) =>
              String(w.title() || "").toLowerCase().includes(needle)
            );
          }

          if (!selectedWin) {
            fail("window not found", msg);
            if (done) done();
            return;
          }

          if (selectedWin.isMinimized()) {
            fail("minimized", msg);
            if (done) done();
            return;
          }

          img = selectedWin.captureImageSync();
          resolvedTargetMeta = {
            type: targetType,
            value: targetValue,
            id: selectedWin.id(),
            title: selectedWin.title(),
            process: selectedWin.appName()
          };
        }

        // 5. Optional Region Cropping
        let regionMeta = null;

        if (hasRegion) {
          const { offsetX, offsetY } =
            targetType === "all"
              ? { offsetX: 0, offsetY: 0 }
              : getClientOffset(selectedWin, origin);

          const cropX = rx + offsetX;
          const cropY = ry + offsetY;

          if (
            rx < 0 ||
            ry < 0 ||
            rw <= 0 ||
            rh <= 0 ||
            cropX < 0 ||
            cropY < 0 ||
            cropX + rw > img.width ||
            cropY + rh > img.height
          ) {
            fail("region outside window", msg);
            if (done) done();
            return;
          }

          img = img.cropSync(cropX, cropY, rw, rh);
          regionMeta = {
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            origin: targetType === "all" ? "window" : origin
          };
        }

        // 6. Encode Output Format
        const outWidth = img.width;
        const outHeight = img.height;

        if (format === "jpeg" || format === "jpg") {
          msg.payload = img.toJpegSync();
        } else if (format === "raw") {
          msg.payload = {
            data: img.toRawSync(),
            width: outWidth,
            height: outHeight
          };
        } else {
          msg.payload = img.toPngSync();
        }

        const ms = Date.now() - t0;

        // 7. Attach Capture Metadata
        msg.capture = {
          target: resolvedTargetMeta,
          region: regionMeta,
          width: outWidth,
          height: outHeight,
          ms: ms
        };

        node.status({
          fill: "green",
          shape: "dot",
          text: `${outWidth}x${outHeight} ${format} (${ms}ms)`
        });

        send(msg);
        if (done) done();
      } catch (err) {
        node.status({
          fill: "red",
          shape: "ring",
          text: err.message || "capture error"
        });
        node.error(err.message || String(err), msg);
        if (done) done();
      }
    });
  }

  RED.nodes.registerType("window-capture", WindowCaptureNode);
};