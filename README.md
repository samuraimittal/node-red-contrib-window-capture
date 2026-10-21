# node-red-contrib-window-capture

[![npm version](https://img.shields.io/npm/v/node-red-contrib-window-capture.svg)](https://www.npmjs.com/package/node-red-contrib-window-capture)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Fast, native desktop window discovery and region screenshot capture for **Node-RED**, powered by [`node-screenshots`](https://github.com/nashaofu/node-screenshots) (XCap Rust bindings).

Designed for low-latency GUI automation, legacy application telemetry extraction, optical character recognition (OCR) pipelines, and visual anomaly detection—capturing targeted windows or cropped regions in milliseconds without spawning external browser or CLI processes.

---

## Features

- **`window-list` Node**: Enumerates all desktop windows with geometry, process name, PID, and minimization state.
- **`window-capture` Node**: Captures an entire screen, a specific window (even when partially occluded in the background on supported OS compositors), or a sub-region.
- **Client vs. Window Coordinate Origin**: Crop regions relative to the interior **client area** (excluding the Windows title bar and border) or the outer **window frame**.
- **Multiple Output Formats**: Output `PNG` buffers, `JPEG` buffers, or zero-compression `raw` RGBA pixel buffers (`{ data, width, height }`) for direct computer-vision ingestion.
- **Catch Node Ready**: Deterministic error states (`"window not found"`, `"minimized"`, `"region outside window"`) update node status and route cleanly to Node-RED **Catch** nodes.

---

## Installation

Run the following command in your Node-RED user directory (typically `~/.node-red`):

```bash
npm install node-red-contrib-window-capture