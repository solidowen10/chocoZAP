"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const contentPath = path.join(__dirname, "content.js");
const source = fs.readFileSync(contentPath, "utf8");

class Element {}
class HTMLImageElement extends Element {}

const sandbox = {
  URL,
  URLSearchParams,
  Element,
  HTMLImageElement,
  console: {
    debug() {},
    groupCollapsed() {},
    groupEnd() {},
  },
  window: {},
  document: {
    title: "台北市租屋",
    querySelectorAll() {
      return [];
    },
  },
  chrome: {
    runtime: {
      onMessage: {
        addListener() {},
      },
    },
  },
};

sandbox.window.location = { href: "https://rent.591.com.tw/?region=1" };
sandbox.window.getComputedStyle = () => ({
  display: "block",
  visibility: "visible",
  opacity: "1",
  backgroundImage: "none",
});
sandbox.window.__radar591ContentScriptVersion = undefined;

vm.runInNewContext(source, sandbox, { filename: contentPath });

const result = sandbox.window.__radar591RunParserSelfTests();
if (!result.passed) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result, null, 2));
}
