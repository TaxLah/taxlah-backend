// Azure Document Intelligence has been removed.
// Receipt extraction is now handled by OpenAI via services/ReceiptExtractionService.js

// const crypto = require("crypto");
// global.crypto = crypto;
// const DocumentIntelligence = require("@azure-rest/ai-document-intelligence").default;
// const { getLongRunningPoller, isUnexpected } = require("@azure-rest/ai-document-intelligence");
// const { AzureKeyCredential } = require("@azure/core-auth");

async function ExtractReceipt(imageUrl) {
    // Stub: Azure Document Intelligence removed. Returns null.
    return null;
}

module.exports = ExtractReceipt;
