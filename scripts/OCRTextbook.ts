import { v1 as vision } from "@google-cloud/vision"

const client = new vision.ImageAnnotatorClient()

const bucketName = "sociology-help"

const fileName = "stats.pdf"

const outputPrefix = "ocr"

const [operation] = await client.asyncBatchAnnotateFiles({
	requests: [
		{
			inputConfig: {
				mimeType: "application/pdf",
				gcsSource: {
					uri: `gs://${bucketName}/${fileName}`,
				},
			},
			features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
			outputConfig: {
				gcsDestination: {
					uri: `gs://${bucketName}/${outputPrefix}/`,
				},
			},
		},
	],
})

const [filesResponse] = await operation.promise()

const destinationUri = filesResponse.responses?.[0]?.outputConfig?.gcsDestination?.uri

console.log(
	`JSON saved to: ${
		destinationUri === null
			? "null"
			: destinationUri === undefined
			? "undefined"
			: destinationUri
	}`
)
