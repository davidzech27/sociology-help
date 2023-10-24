import { Storage } from "@google-cloud/storage"
import { type protos } from "@google-cloud/vision"

const bucket = new Storage().bucket("sociology-help")

const { QDRANT_URL, QDRANT_API_KEY, OPENAI_SECRET_KEY } = process.env

if (typeof QDRANT_URL !== "string") {
	console.error("Must set QDRANT_URL environment variable")

	process.exit(1)
}

if (typeof QDRANT_API_KEY !== "string") {
	console.error("Must set QDRANT_API_KEY environment variable")

	process.exit(1)
}

if (typeof OPENAI_SECRET_KEY !== "string") {
	console.error("Must set OPENAI_SECRET_KEY environment variable")

	process.exit(1)
}

const createCollection = async () => {
	await fetch(`${QDRANT_URL}/collections/sociology-help`, {
		method: "PUT",
		body: JSON.stringify({
			name: "sociology-help",
			vectors: {
				size: 1536,
				distance: "Dot",
			},
		}),
		headers: {
			"Content-Type": "application/json",
			"api-key": QDRANT_API_KEY,
		},
	})
}

const insertPoints = async (
	points: { id: number; payload: Record<string, string | number>; vector: number[] }[]
) => {
	await (
		await fetch(`${QDRANT_URL}/collections/sociology-help/points`, {
			method: "PUT",
			body: JSON.stringify({ points }),
			headers: {
				"Content-Type": "application/json",
				"api-key": QDRANT_API_KEY,
			},
		})
	).json()
}

const countPoints = async () => {
	return (
		(await (
			await fetch(`${QDRANT_URL}/collections/sociology-help/points/count`, {
				method: "POST",
				body: JSON.stringify({
					exact: true,
				}),
				headers: {
					"Content-Type": "application/json",
					"api-key": QDRANT_API_KEY,
				},
			})
		).json()) as { result: { count: number } }
	).result.count
}

const getEmbedding = async (text: string) => {
	return (
		(await (
			await fetch("https://api.openai.com/v1/embeddings", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${OPENAI_SECRET_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					input: text,
					model: "text-embedding-ada-002",
				}),
			})
		).json()) as { data: [{ embedding: number[] }] }
	).data[0].embedding
}

const main = async () => {
	await createCollection()

	const [files] = await bucket.getFiles({ prefix: "ocr/" })

	for (const file of files) {
		const [buffer] = await file.download()

		const result = JSON.parse(
			buffer.toString("utf8")
		) as protos.google.cloud.vision.v1.IAnnotateFileResponse

		if (!result.responses) throw "No responses"

		const points: Parameters<typeof insertPoints>[0] = []

		for (const page of result.responses) {
			const pageNumber = page.context?.pageNumber

			const text = page.fullTextAnnotation?.text

			if (!pageNumber) throw "No pageNumber"

			if (!text) throw "No text"

			const embedding = await getEmbedding(text)

			points.push({
				id: pageNumber,
				payload: {
					text,
				},
				vector: embedding,
			})
		}

		await insertPoints(points)

		console.info("Points in collection: " + (await countPoints()).toString())
	}
}

void main()
