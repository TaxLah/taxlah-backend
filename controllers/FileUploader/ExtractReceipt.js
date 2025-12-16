const crypto = require("crypto");
global.crypto = crypto;

const DocumentIntelligence =
		require("@azure-rest/ai-document-intelligence").default,
	{
		getLongRunningPoller,
		isUnexpected,
	} = require("@azure-rest/ai-document-intelligence");

const { AzureKeyCredential } = require("@azure/core-auth");

// set `<your-key>` and `<your-endpoint>` variables with the values from the Azure portal.
const key       = "NcPHn0ZavsJIC3F48pMtgnCPYuanuGLUdbhfoBM5L6F7HYVcCkYxJQQJ99BLACqBBLyXJ3w3AAALACOGXw7w";
const endpoint  = "https://taxlah.cognitiveservices.azure.com/";

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
    console.log("Log Poller : ", poller)
    
	const analyzeResult = poller.body.analyzeResult;

	const documents = analyzeResult?.documents;
    console.log("Log Documents : ", documents)

	const document = documents && documents[0];
	if (!document) {
		throw new Error("Expected at least one document in the result.");
	}

    // console.log("Log Tax : ", documents[1].fields.TotalTax)

	console.log(
		"Extracted document:",
		document.docType,
		`(confidence: ${document.confidence || "<undefined>"})`
	);
	// console.log("Fields:", document.fields);
    // console.log("Items : ", document.fields.Items)
    // console.table(document.fields.Items.valueArray)

    // for (let i = 0; i < document.fields.Items.valueArray.length; i++) {
    //     console.log(`Log Item ${i + 1} : `, document.fields.Items.valueArray[i])        
    //     console.log("Item Name : ", document.fields.Items.valueArray[i].valueObject.Description.valueString)
    //     console.log("Item Price : ", document.fields.Items.valueArray[i].valueObject.TotalPrice.valueCurrency.amount)
    // }

    return document
}

module.exports = ExtractReceipt;
