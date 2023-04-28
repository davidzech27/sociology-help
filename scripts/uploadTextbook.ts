import { Storage } from "@google-cloud/storage"

const pathToTextbook = process.env.PATH_TO_TEXTBOOK

if (typeof pathToTextbook !== "string") {
	console.error("Must set PATH_TO_TEXTBOOK environment variable")

	process.exit(1)
}

const bucket = new Storage().bucket("stats-helper")

const main = async () => {
	await bucket.upload(pathToTextbook, {
		destination: "stats.pdf",
		preconditionOpts: { ifGenerationMatch: 0 },
	})
}

void main()
