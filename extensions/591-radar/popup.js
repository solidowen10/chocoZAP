"use strict";

const scanButton = document.getElementById("scanButton");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const sendSheetButton = document.getElementById("sendSheetButton");
const sheetWebhookUrl = document.getElementById("sheetWebhookUrl");
const sheetSecret = document.getElementById("sheetSecret");
const foundCount = document.getElementById("foundCount");
const parsedCount = document.getElementById("parsedCount");
const failedCount = document.getElementById("failedCount");
const statusText = document.getElementById("status");
const jsonOutput = document.getElementById("jsonOutput");

let latestJson = "";
let latestPayload = null;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  scanButton.disabled = isBusy;
  sendSheetButton.disabled = isBusy || !latestPayload?.listings?.length;
  scanButton.textContent = isBusy ? "Scanning..." : "Scan Current Page";
}

function setCounts(stats = {}) {
  foundCount.textContent = String(stats.unique_listing_ids ?? stats.found_listings ?? 0);
  parsedCount.textContent = String(stats.parsed_successfully ?? 0);
  failedCount.textContent = String(stats.failed ?? 0);
}

function setJson(payload) {
  latestPayload = payload || null;
  latestJson = payload ? JSON.stringify(payload, null, 2) : "";
  jsonOutput.value = latestJson;
  copyButton.disabled = !latestJson;
  downloadButton.disabled = !latestJson;
  sendSheetButton.disabled = !payload?.listings?.length;
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function setStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs[0] || null);
    });
  });
}

function sendScanMessage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "SCAN_591_PAGE" }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function injectContentScript(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

function isSupported591Url(url) {
  return /^https?:\/\/(?:rent|business)\.591\.com\.tw\//i.test(url || "");
}

async function scanCurrentPage() {
  setBusy(true);
  setStatus("Scanning current page...");
  setJson(null);
  setCounts();

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    if (!isSupported591Url(tab.url)) {
      throw new Error("Please open a supported 591 search results page first.");
    }

    let response;
    try {
      response = await sendScanMessage(tab.id);
    } catch (firstError) {
      await injectContentScript(tab.id);
      response = await sendScanMessage(tab.id);
    }

    if (!response || !response.ok) {
      throw new Error(response?.error || "The page scanner did not respond.");
    }

    setCounts(response.payload.stats);
    setJson(response.payload);
    setStatus(`Done. Parsed ${response.payload.stats.parsed_successfully} listing(s).`);
  } catch (error) {
    setStatus(error.message || "Scan failed.", true);
  } finally {
    setBusy(false);
  }
}

async function loadSheetSettings() {
  const settings = await getStorage(["sheetWebhookUrl", "sheetSecret"]);
  sheetWebhookUrl.value = settings.sheetWebhookUrl || "";
  sheetSecret.value = settings.sheetSecret || "";
}

async function saveSheetSettings() {
  await setStorage({
    sheetWebhookUrl: sheetWebhookUrl.value.trim(),
    sheetSecret: sheetSecret.value,
  });
}

async function sendToGoogleSheet() {
  if (!latestPayload?.listings?.length) {
    setStatus("Scan the current page before sending.", true);
    return;
  }

  const webhookUrl = sheetWebhookUrl.value.trim();
  if (!webhookUrl) {
    setStatus("Add the Google Sheet webhook URL first.", true);
    return;
  }

  sendSheetButton.disabled = true;
  sendSheetButton.textContent = "Sending...";
  setStatus("Sending listings to Google Sheet...");

  try {
    await saveSheetSettings();
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        source: "591-radar-extension",
        secret: sheetSecret.value || undefined,
        scanned_at: latestPayload.scanned_at,
        page_url: latestPayload.page_url,
        stats: latestPayload.stats,
        listings: latestPayload.listings,
      }),
    });

    const text = await response.text();
    let result = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch (error) {
      result = { ok: response.ok, message: text };
    }

    if (!response.ok || result.ok === false) {
      throw new Error(result.error || result.message || `HTTP ${response.status}`);
    }

    setStatus(
      `Sent ${result.upserted || latestPayload.listings.length} listing(s). Updated ${result.updated || 0}, created ${result.created || 0}.`,
    );
  } catch (error) {
    setStatus(error.message || "Google Sheet send failed.", true);
  } finally {
    sendSheetButton.disabled = !latestPayload?.listings?.length;
    sendSheetButton.textContent = "Send to Google Sheet";
  }
}

async function copyJson() {
  if (!latestJson) return;

  await navigator.clipboard.writeText(latestJson);
  setStatus("JSON copied.");
}

function downloadJson() {
  if (!latestJson) return;

  const blob = new Blob([latestJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `591-radar-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("JSON download started.");
}

scanButton.addEventListener("click", scanCurrentPage);
copyButton.addEventListener("click", copyJson);
downloadButton.addEventListener("click", downloadJson);
sendSheetButton.addEventListener("click", sendToGoogleSheet);
sheetWebhookUrl.addEventListener("change", saveSheetSettings);
sheetSecret.addEventListener("change", saveSheetSettings);

loadSheetSettings();
