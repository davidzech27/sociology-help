import { Storage } from "@google-cloud/storage"

const pathToTextbook = process.env.PATH_TO_TEXTBOOK

if (typeof pathToTextbook !== "string") {
	console.error("Must set PATH_TO_TEXTBOOK environment variable")

	process.exit(1)
}


const main = async () => {
	const bucket = new Storage().bucket("sociology-help")

	await bucket.upload(pathToTextbook, {
		destination: "stats.pdf",
		preconditionOpts: { ifGenerationMatch: 0 },
	})
}

void main()
