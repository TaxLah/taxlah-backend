const crypto = require("crypto");
global.crypto = crypto;

const DocumentIntelligence 		= require("@azure-rest/ai-document-intelligence").default, { getLongRunningPoller, isUnexpected } = require("@azure-rest/ai-document-intelligence");
const { AzureKeyCredential } 	= require("@azure/core-auth");

const key 		= "NcPHn0ZavsJIC3F48pMtgnCPYuanuGLUdbhfoBM5L6F7HYVcCkYxJQQJ99BLACqBBLyXJ3w3AAALACOGXw7w";
const endpoint 	= "https://taxlah.cognitiveservices.azure.com/";

async function ExtractReceipt(imageUrl) {
	const client = DocumentIntelligence(endpoint, new AzureKeyCredential(key));

	const initialResponse = await client
		.path("/documentModels/{modelId}:analyze", "prebuilt-receipt")
		.post({
			contentType: "application/json",
			body: {
				urlSource: imageUrl,
			},
		});

	if (isUnexpected(initialResponse)) {
		throw initialResponse.body.error;
	}

	const poller = await getLongRunningPoller(client, initialResponse);
	console.log("Log Poller : ", poller);

	const analyzeResult = poller.body.analyzeResult;

	const documents = analyzeResult?.documents;
	console.log("Log Documents : ", documents);

	const document = documents && documents[0];
	if (!document) {
		throw new Error("Expected at least one document in the result.");
	}

	console.log("Log Document : ", document)

	return {
		CountryRegion: document.fields.CountryRegion || null,
		Items: document.fields?.Items?.type === "array" ? document.fields.Items.valueArray : [],
		MerchantAddress: document.fields.MerchantAddress || null,
		MerchantName: document.fields.MerchantName || null,
		MerchantPhoneNumber: document.fields.MerchantPhoneNumber || null,
		ReceiptType: document.fields.ReceiptType || null,
		Total: document.fields.Total || null,
		TransactionDate: document.fields.TransactionDate || null,
		TransactionTime: document.fields.TransactionTime || null,
	};
}

module.exports = ExtractReceipt;
